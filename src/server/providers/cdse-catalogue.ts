/**
 * CDSE Sentinel catalogue provider (Phase 6) — Copernicus Data Space
 * Ecosystem OData `/Products` endpoint, keyless (verified live).
 *
 * Provider-choice evidence (Phase 6 scope proposal §4, Stage B probes):
 * - STAC item search returns 200 but zero features without auth, so the
 *   OData path is the only compliant no-credential option.
 * - Spatial filter must be `OData.CSC.Intersects` (capital `CSC`); spaces
 *   encode as `%20`, quotes as `%27`, parentheses stay raw.
 * - `GeoFootprint` comes back as a GeoJSON geometry ([lon, lat] order) and
 *   `$orderby=ContentDate/Start desc` is supported.
 *
 * Honesty contract: this provider throws on failure — the route maps that
 * to STALE/UNAVAILABLE. It never fabricates scenes and never falls back to
 * simulated data.
 */
import { serverConfig } from "../config";
import { fetchJsonWithTimeout } from "../http";
import type { Bbox } from "../validation";
import type { SceneCollectionId, SceneFootprint, SceneSummary } from "@/types";

export const CDSE_SOURCE = "CDSE OData";

/** In-memory TTL (seconds) for LIVE scene results — fresh products, low cost. */
export const SCENES_TTL = 900;

export const SCENES_LIMIT_DEFAULT = 20;
/** Hard cap: one AOI search never returns more than one page. */
export const SCENES_LIMIT_MAX = 20;

/** Copernicus attribution shown wherever Sentinel results are displayed. */
export const SENTINEL_ATTRIBUTION = `Contains modified Copernicus Sentinel data [${new Date().getUTCFullYear()}]`;

interface SceneCollectionSpec {
  /** OData `Collection/Name` facet. */
  collection: "SENTINEL-1" | "SENTINEL-2";
  /** `contains(Name, …)` token that narrows to the product class. */
  nameToken: string;
  /** Human label for UI selects. */
  label: string;
}

/**
 * Curated collection allow-list (verified live, all keyless HTTP 200).
 * Adding an entry requires a live probe of its facet/token combination.
 */
export const SCENE_COLLECTIONS: Record<SceneCollectionId, SceneCollectionSpec> = {
  "sentinel-2-l1c": { collection: "SENTINEL-2", nameToken: "MSIL1C", label: "Sentinel-2 L1C" },
  "sentinel-2-l2a": { collection: "SENTINEL-2", nameToken: "MSIL2A", label: "Sentinel-2 L2A" },
  "sentinel-1-grd": { collection: "SENTINEL-1", nameToken: "_GRD", label: "Sentinel-1 GRD" },
};

export const DEFAULT_SCENE_COLLECTION: SceneCollectionId = "sentinel-2-l1c";

/** `$select` projection — keep the payload bounded to displayed fields. */
const SCENE_SELECT = "Id,Name,ContentDate,GeoFootprint,Online,PublicationDate";

export interface SceneSearchParams {
  bbox: Bbox;
  collectionId: SceneCollectionId;
  /** ISO-8601 lower bound on ContentDate/Start (exclusive). */
  start: string;
  /** ISO-8601 upper bound on ContentDate/Start (exclusive). */
  end: string;
  limit: number;
}

/**
 * The exact OData `$filter` text, matching the verified probe byte-for-byte
 * in shape (spaces, quoting, polygon ring closure). Unit-tested against the
 * Stage B captured fixture so the builder cannot silently drift from the
 * only syntax CDSE accepts.
 */
export function buildSceneFilter(
  params: Pick<SceneSearchParams, "bbox" | "collectionId" | "start" | "end">,
): string {
  const spec = SCENE_COLLECTIONS[params.collectionId];
  const { min_lon, min_lat, max_lon, max_lat } = params.bbox;
  // Closed ring, counter-clockwise by listing, [lon lat] pairs, comma-separated.
  const ring = [
    `${min_lon} ${min_lat}`,
    `${max_lon} ${min_lat}`,
    `${max_lon} ${max_lat}`,
    `${min_lon} ${max_lat}`,
    `${min_lon} ${min_lat}`,
  ].join(",");
  return (
    `Collection/Name eq '${spec.collection}'` +
    ` and contains(Name,'${spec.nameToken}')` +
    ` and OData.CSC.Intersects(area=geography'SRID=4326;POLYGON((${ring}))')` +
    ` and ContentDate/Start gt ${params.start}` +
    ` and ContentDate/Start lt ${params.end}`
  );
}

/**
 * Full request URL. `encodeURIComponent` gives space→%20 and leaves
 * parentheses raw (both verified); apostrophes are additionally encoded to
 * `%27` (it does not escape them) to match the verified request exactly.
 */
export function buildScenesUrl(params: SceneSearchParams): string {
  const filter = buildSceneFilter(params);
  return (
    `${serverConfig.cdseOdataUrl}/Products` +
    `?$filter=${encodeURIComponent(filter).replace(/'/g, "%27")}` +
    `&$top=${params.limit}` +
    `&$select=${encodeURIComponent(SCENE_SELECT)}` +
    `&$orderby=${encodeURIComponent("ContentDate/Start desc")}`
  );
}

/** Upper bound on coordinates accepted into a footprint (pathology guard). */
const FOOTPRINT_VERTEX_CAP = 4096;

function isValidRing(ring: unknown): ring is number[][] {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  return ring.every(
    (pt) =>
      Array.isArray(pt) &&
      pt.length >= 2 &&
      typeof pt[0] === "number" &&
      typeof pt[1] === "number" &&
      Number.isFinite(pt[0]) &&
      Number.isFinite(pt[1]),
  );
}

/**
 * Validate a CDSE `GeoFootprint` into the client geometry type. Returns
 * null for anything malformed or oversized — the scene stays listed, it
 * simply has no drawable footprint. Never throws on item-level shape.
 */
export function parseFootprint(raw: unknown): SceneFootprint | null {
  if (typeof raw !== "object" || raw === null) return null;
  const type = (raw as { type?: unknown }).type;
  const coordinates = (raw as { coordinates?: unknown }).coordinates;
  if (type === "Polygon") {
    if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
    let vertices = 0;
    if (!coordinates.every((ring) => (isValidRing(ring) ? ((vertices += ring.length), true) : false))) {
      return null;
    }
    if (vertices > FOOTPRINT_VERTEX_CAP) return null;
    return { type: "Polygon", coordinates: coordinates as number[][][] };
  }
  if (type === "MultiPolygon") {
    if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
    let vertices = 0;
    const ok = coordinates.every(
      (polygon) =>
        Array.isArray(polygon) &&
        polygon.every((ring) => (isValidRing(ring) ? ((vertices += ring.length), true) : false)),
    );
    if (!ok || vertices > FOOTPRINT_VERTEX_CAP) return null;
    return { type: "MultiPolygon", coordinates: coordinates as number[][][][] };
  }
  return null;
}

function toIso(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Normalize the OData envelope into SceneSummary rows (mirrors
 * `normalizeUsgs`: throws on a wrong envelope shape, skips malformed items,
 * truncates at limit). Item ids become globe entity identity.
 */
export function normalizeScenes(
  data: unknown,
  collectionId: SceneCollectionId,
  limit: number,
): SceneSummary[] {
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as { value?: unknown }).value)
  ) {
    throw new Error("Unexpected CDSE OData response shape");
  }
  const rows = (data as { value: unknown[] }).value;
  const scenes: SceneSummary[] = [];
  for (const row of rows) {
    if (scenes.length >= limit) break;
    if (typeof row !== "object" || row === null) continue;
    const rec = row as Record<string, unknown>;
    const id = typeof rec.Id === "string" && rec.Id !== "" ? rec.Id : null;
    const name = typeof rec.Name === "string" && rec.Name !== "" ? rec.Name : null;
    const contentDate = toIso((rec.ContentDate as Record<string, unknown> | null | undefined)?.Start);
    if (!id || !name || !contentDate) continue;
    scenes.push({
      id,
      name,
      collection: collectionId,
      content_date: contentDate,
      publication_date: toIso(rec.PublicationDate),
      online: typeof rec.Online === "boolean" ? rec.Online : null,
      footprint: parseFootprint(rec.GeoFootprint),
    });
  }
  return scenes;
}

/**
 * Query the catalogue for one AOI/window page. Throws on any transport or
 * shape failure (route owns the stale/unavailable mapping).
 */
export async function fetchScenes(
  params: SceneSearchParams,
  signal?: AbortSignal,
): Promise<SceneSummary[]> {
  const { status, json } = await fetchJsonWithTimeout(buildScenesUrl(params), {
    timeoutMs: serverConfig.cdseTimeoutMs,
    signal,
    headers: { Accept: "application/json" },
  });
  if (status !== 200) {
    throw new Error(`CDSE OData returned HTTP ${status}`);
  }
  return normalizeScenes(json, params.collectionId, params.limit);
}
