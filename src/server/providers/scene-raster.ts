/**
 * Sentinel scene-raster resolution (Phase 7) — maps a CDSE product GUID to
 * a renderable tiled raster on Microsoft Planetary Computer (PC), keyless.
 *
 * Provider-choice evidence (Phase 7 provider research, live probes):
 * - CDSE-native rendering is blocked: Sentinel Hub needs OAuth2 client
 *   credentials (not provisioned) and OData quicklooks need a public
 *   access token and carry no documented georeferencing.
 * - PC STAC + Data API is keyless (verified: a `.../WebMercatorQuad/6/50/19`
 *   tile was fetched with no SAS token) and serves Sentinel-2 L2A
 *   (`sentinel-2-l2a`) and Sentinel-1 GRD (`sentinel-1-grd`) as cloud
 *   optimized GeoTIFFs with server-side rendering. There is no
 *   `sentinel-2-l1c` collection, so L1C scenes are honestly reported as
 *   unsupported instead of being faked.
 *
 * Resolution contract:
 * - The scene GUID comes from the CDSE catalogue (Phase 6). The canonical
 *   product Name is re-fetched by id at resolution time (unquoted
 *   `Id eq <guid>` filter — the only form the verified endpoint accepts;
 *   the GUID shape is validated by the route before interpolation), so
 *   client-supplied names are never trusted.
 * - The PC item is located by exact-name filter (`s2:product_uri` for L2A,
 *   `s1:product_identifier` for S1 GRD) and the returned item's identity is
 *   re-checked against the name; a mismatch is a failure, never a raster
 *   for the wrong product.
 *
 * Honesty contract: transport and shape failures throw (the route maps
 * them to STALE/UNAVAILABLE). `unsupported` and `not_found` are returned
 * as terminal answers, never fabricated descriptors.
 */
import { serverConfig } from "../config";
import { fetchJsonWithTimeout } from "../http";
import { SENTINEL_ATTRIBUTION } from "./cdse-catalogue";
import type { SceneRasterCollection, SceneRasterDescriptor, SceneRasterStatus } from "@/types";

export const PC_SOURCE = "Microsoft Planetary Computer";

/**
 * Data API base for tiled rendering. Pinned (not env-overridable): the
 * client factory validates every tile template against this exact origin,
 * so an override could only break rendering, never help it.
 */
export const PC_DATA_API_URL = "https://planetarycomputer.microsoft.com/api/data/v1";

/** Display attribution next to any rendered scene raster. */
export const PC_ATTRIBUTION = `${SENTINEL_ATTRIBUTION} · Rendered by Microsoft Planetary Computer`;

/** TTL (seconds) for a resolved renderable descriptor — stable per scene. */
export const SCENE_RASTER_TTL = 900;
/** TTL (seconds) for terminal non-renderable answers. */
export const SCENE_RASTER_NEGATIVE_TTL = 300;

/**
 * Zoom clamp for scene rasters. Native Sentinel resolution is ~10 m; PC
 * serves pre-rendered tiles far beyond that, but zooming past level 14
 * only interpolates pixels — the client is told the honest cap.
 */
export const SCENE_RASTER_MIN_ZOOM = 0;
export const SCENE_RASTER_MAX_ZOOM = 14;

/** How each verified collection is rendered (from the live tile probes). */
export const SCENE_RASTER_RENDERING: Record<SceneRasterCollection, string> = {
  "sentinel-2-l2a": "True color (visual band composite 1–2–3)",
  "sentinel-1-grd": "Dual-pol radar composite (VV / VH / VV÷VH)",
};

export const SCENE_RASTER_RESOLUTION_NOTE =
  "~10 m native pixels; zoom beyond level 14 interpolates, it does not add detail";

/** PC item ids are stable alphanumeric slugs — the tile-template guard. */
const PC_ITEM_ID_RE = /^[A-Za-z0-9._-]+$/;

const PC_PREVIEW_ORIGIN = "https://planetarycomputer.microsoft.com/";

function stripSafeSuffix(name: string): string {
  return name.endsWith(".SAFE") ? name.slice(0, -5) : name;
}

/**
 * Classify a CDSE product name into a renderable collection. Returns null
 * for everything without a verified tiled rendering path (including
 * Sentinel-2 L1C, which PC does not carry).
 */
export function classifySceneName(name: string): SceneRasterCollection | null {
  const base = stripSafeSuffix(name);
  if (base.startsWith("S2") && base.includes("_MSIL2A_")) return "sentinel-2-l2a";
  if (base.startsWith("S1") && base.includes("_GRD")) return "sentinel-1-grd";
  return null;
}

/**
 * CDSE by-id lookup URL. The filter is the verified unquoted-GUID form
 * (`Id eq <guid>`; quoted ids return an empty set) and is percent-encoded
 * as one query value.
 */
export function buildCdseProductUrl(sceneId: string): string {
  return (
    `${serverConfig.cdseOdataUrl}/Products` +
    `?$filter=${encodeURIComponent(`Id eq ${sceneId}`)}` +
    `&$select=${encodeURIComponent("Name")}`
  );
}

/**
 * Exact-name filter against the PC collection (verified live for both
 * collections: L2A matches on `s2:product_uri` including `.SAFE`; S1 GRD
 * matches on `s1:product_identifier` without it).
 */
export function pcItemFilter(collection: SceneRasterCollection, sceneName: string): string {
  const base = stripSafeSuffix(sceneName);
  return collection === "sentinel-2-l2a"
    ? `s2:product_uri = '${base}.SAFE'`
    : `s1:product_identifier = '${base}'`;
}

/**
 * PC item-search URL. Uses the collection-items endpoint with a GET CQL2
 * filter — the verified working shape (the `/search?filter=` endpoint
 * timed out in live probes and must not be used).
 */
export function buildPcItemsUrl(collection: SceneRasterCollection, sceneName: string): string {
  const filter = pcItemFilter(collection, sceneName);
  return (
    `${serverConfig.pcStacUrl}/collections/${collection}/items` +
    `?filter=${encodeURIComponent(filter)}&limit=1`
  );
}

/**
 * XYZ tile template for one PC item, assembled from the exact rendering
 * queries captured live (never from client input). `itemId` must pass the
 * slug guard — anything else throws before a URL exists.
 */
export function buildPcTileTemplate(collection: SceneRasterCollection, itemId: string): string {
  if (!PC_ITEM_ID_RE.test(itemId)) {
    throw new Error("Planetary Computer item id has an unexpected shape");
  }
  const base =
    `${PC_DATA_API_URL}/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x` +
    `?collection=${collection}&item=${itemId}`;
  if (collection === "sentinel-2-l2a") {
    return `${base}&assets=visual&asset_bidx=visual%7C1,2,3&nodata=0&format=png`;
  }
  return (
    `${base}&assets=vv&assets=vh&expression=vv;vh;vv%2Fvh` +
    `&rescale=0,600&rescale=0,270&rescale=0,9&asset_as_band=True&tile_format=png&format=png`
  );
}

/** Extract the canonical product Name from a CDSE by-id response. */
export function extractCdseName(data: unknown): string | null {
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as { value?: unknown }).value)
  ) {
    throw new Error("Unexpected CDSE OData response shape");
  }
  const rows = (data as { value: unknown[] }).value;
  if (rows.length === 0) return null;
  const row = rows[0];
  if (typeof row !== "object" || row === null) {
    throw new Error("Unexpected CDSE OData product row shape");
  }
  const name = (row as Record<string, unknown>).Name;
  if (typeof name !== "string" || name === "") {
    throw new Error("CDSE OData product row is missing a Name");
  }
  return name;
}

interface PcFeature {
  id: string;
  properties: Record<string, unknown>;
  assets: Record<string, unknown> | null;
  bbox: [number, number, number, number] | null;
}

function parsePcFeature(data: unknown): PcFeature | null {
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as { features?: unknown }).features)
  ) {
    throw new Error("Unexpected Planetary Computer response shape");
  }
  const features = (data as { features: unknown[] }).features;
  if (features.length === 0) return null;
  const raw = features[0];
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Unexpected Planetary Computer feature shape");
  }
  const rec = raw as Record<string, unknown>;
  const id = rec.id;
  if (typeof id !== "string" || id === "") {
    throw new Error("Planetary Computer feature is missing an id");
  }
  const bboxRaw = rec.bbox;
  let bbox: PcFeature["bbox"] = null;
  if (Array.isArray(bboxRaw) && bboxRaw.length === 4) {
    const nums = bboxRaw.map((n) => (typeof n === "number" ? n : NaN));
    if (nums.every((n) => Number.isFinite(n))) {
      bbox = nums as [number, number, number, number];
    }
  }
  return {
    id,
    properties:
      typeof rec.properties === "object" && rec.properties !== null
        ? (rec.properties as Record<string, unknown>)
        : {},
    assets:
      typeof rec.assets === "object" && rec.assets !== null
        ? (rec.assets as Record<string, unknown>)
        : null,
    bbox,
  };
}

/**
 * Re-check the PC item identity against the CDSE name. A mismatch throws:
 * serving a raster for a different product than the selected scene would
 * be a data-integrity violation, not a degradation.
 */
export function pcIdentityMatches(
  collection: SceneRasterCollection,
  sceneName: string,
  properties: Record<string, unknown>,
): boolean {
  const base = stripSafeSuffix(sceneName);
  if (collection === "sentinel-2-l2a") {
    const uri = properties["s2:product_uri"];
    return typeof uri === "string" && stripSafeSuffix(uri) === base;
  }
  const identifier = properties["s1:product_identifier"];
  return typeof identifier === "string" && identifier === base;
}

function isUsableBbox(
  bbox: PcFeature["bbox"],
): bbox is [number, number, number, number] {
  if (bbox === null) return false;
  const [west, south, east, north] = bbox;
  // Antimeridian-crossing footprints (rare polar granules) are rejected:
  // Cesium rectangles cannot represent them without splitting, and a
  // misplaced raster is worse than an honest "unavailable".
  return (
    west >= -180 &&
    east <= 180 &&
    south >= -90 &&
    north <= 90 &&
    west < east &&
    south < north
  );
}

function previewUrlFromAssets(assets: Record<string, unknown> | null): string | null {
  if (!assets) return null;
  const preview = assets.rendered_preview;
  if (typeof preview !== "object" || preview === null) return null;
  const href = (preview as Record<string, unknown>).href;
  // Only the verified provider origin may become a rendered <img> source.
  return typeof href === "string" && href.startsWith(PC_PREVIEW_ORIGIN) ? href : null;
}

/** Build the validated descriptor from a located PC feature. */
export function buildSceneRasterDescriptor(
  collection: SceneRasterCollection,
  sceneName: string,
  feature: PcFeature,
): SceneRasterDescriptor {
  if (!pcIdentityMatches(collection, sceneName, feature.properties)) {
    throw new Error("Planetary Computer returned a different product for this scene");
  }
  if (!isUsableBbox(feature.bbox)) {
    throw new Error("Planetary Computer item is missing a usable bounding box");
  }
  return {
    provider: "microsoft-planetary-computer",
    collection,
    item_id: feature.id,
    tile_url_template: buildPcTileTemplate(collection, feature.id),
    preview_url: previewUrlFromAssets(feature.assets),
    bbox: feature.bbox,
    min_zoom: SCENE_RASTER_MIN_ZOOM,
    max_zoom: SCENE_RASTER_MAX_ZOOM,
    rendering: SCENE_RASTER_RENDERING[collection],
    resolution_note: SCENE_RASTER_RESOLUTION_NOTE,
  };
}

export interface SceneRasterResolution {
  status: SceneRasterStatus;
  /** Canonical CDSE product name (null only when the scene was not found). */
  scene_name: string | null;
  /** Present iff `status === 'renderable'`. */
  raster: SceneRasterDescriptor | null;
  /** Human explanation of the status (never empty). */
  reason: string;
}

export function unsupportedResolution(sceneName: string | null): SceneRasterResolution {
  const detail =
    sceneName && sceneName.includes("_MSIL1C_")
      ? "Sentinel-2 L1C is not distributed through the verified Planetary Computer collections (only L2A and Sentinel-1 GRD)."
      : "This product type has no verified tiled rendering path.";
  return {
    status: "unsupported",
    scene_name: sceneName,
    raster: null,
    reason: `${detail} The scene remains selectable in the catalogue and its footprint stays on the globe.`,
  };
}

/**
 * Resolve one scene id end to end: CDSE by-id → canonical name → PC item by
 * exact-name filter → validated descriptor. Throws on transport/shape
 * failures and identity mismatches (route maps to STALE/UNAVAILABLE);
 * returns terminal `unsupported`/`not_found` answers as-is.
 */
export async function resolveSceneRaster(
  sceneId: string,
  signal?: AbortSignal,
): Promise<SceneRasterResolution> {
  const lookup = await fetchJsonWithTimeout(buildCdseProductUrl(sceneId), {
    timeoutMs: serverConfig.cdseTimeoutMs,
    signal,
    headers: { Accept: "application/json" },
  });
  if (lookup.status !== 200) {
    throw new Error(`CDSE OData returned HTTP ${lookup.status}`);
  }
  const sceneName = extractCdseName(lookup.json);
  if (sceneName === null) {
    return {
      status: "not_found",
      scene_name: null,
      raster: null,
      reason: "The selected scene is no longer present in the Copernicus catalogue.",
    };
  }

  const collection = classifySceneName(sceneName);
  if (collection === null) {
    return unsupportedResolution(sceneName);
  }

  const items = await fetchJsonWithTimeout(buildPcItemsUrl(collection, sceneName), {
    timeoutMs: serverConfig.pcTimeoutMs,
    signal,
    headers: { Accept: "application/json" },
  });
  if (items.status !== 200) {
    throw new Error(`Planetary Computer returned HTTP ${items.status}`);
  }
  const feature = parsePcFeature(items.json);
  if (feature === null) {
    return {
      status: "not_found",
      scene_name: sceneName,
      raster: null,
      reason:
        "The scene exists in the Copernicus catalogue but is not yet mirrored in " +
        "the verified Planetary Computer collection used for rendering.",
    };
  }

  const raster = buildSceneRasterDescriptor(collection, sceneName, feature);
  return {
    status: "renderable",
    scene_name: sceneName,
    raster,
    reason: `Renderable via ${PC_SOURCE} (${PC_ATTRIBUTION}).`,
  };
}
