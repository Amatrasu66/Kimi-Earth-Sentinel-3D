import type { NextRequest } from "next/server";
import { getCache } from "@/server/cache";
import { logError } from "@/server/http";
import {
  CDSE_SOURCE,
  DEFAULT_SCENE_COLLECTION,
  SCENES_LIMIT_DEFAULT,
  SCENES_LIMIT_MAX,
  SCENES_TTL,
  SENTINEL_ATTRIBUTION,
  fetchScenes,
  SCENE_COLLECTIONS,
} from "@/server/providers/cdse-catalogue";
import {
  LIVE,
  STALE,
  UNAVAILABLE,
  withStatus,
} from "@/server/provenance";
import {
  NO_STORE,
  fail,
  internalError,
  ok,
  publicCacheControl,
} from "@/server/route-helpers";
import { parseBbox, parseLimit, parseSceneWindow } from "@/server/validation";
import type { SceneCollectionId, SceneSummary } from "@/types";

export const dynamic = "force-dynamic";

const SCENE_COLLECTION_IDS = Object.keys(SCENE_COLLECTIONS) as SceneCollectionId[];

function scenesCacheKey(
  bbox: string,
  start: string,
  end: string,
  collection: string,
  limit: number,
): string {
  return `scenes:v1:collection=${collection}:bbox=${bbox}:start=${start}:end=${end}:limit=${limit}`;
}

interface ScenesPayload extends Record<string, unknown> {
  query: {
    bbox: string;
    start: string;
    end: string;
    collection: SceneCollectionId;
    limit: number;
  };
  scenes: SceneSummary[];
  count: number;
  attribution: string;
  data_status: { status: string; fetched_at: string; message?: string | null };
}

type CachedScenes = [ScenesPayload, string | null | undefined] | null;

/** Rewrite an expired LIVE entry as STALE, preserving the original fetched_at. */
function asStale(data: ScenesPayload): ScenesPayload {
  return {
    ...data,
    data_status: {
      ...data.data_status,
      status: STALE,
      message: `Provider refresh failed — showing cached data fetched at ${data.data_status.fetched_at}.`,
    },
  };
}

/**
 * Phase 6: AOI + window Sentinel catalogue search (keyless CDSE OData).
 * `bbox` is required; `start`/`end` default per parseSceneWindow; results
 * are capped at 20 (one page). LIVE hits are shared-cacheable; failures
 * degrade to STALE (if a LIVE entry expired) or an empty UNAVAILABLE
 * payload — never fabricated scenes.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const bboxRaw = sp.get("bbox");
    const { value: bbox, error: bboxErr } = parseBbox(bboxRaw);
    if (bboxErr) return fail(bboxErr);
    if (!bbox) return fail("bbox is required: expected 'minLon,minLat,maxLon,maxLat'.");
    const { value: window, error: windowErr } = parseSceneWindow(sp.get("start"), sp.get("end"));
    if (windowErr || window === null) return fail(windowErr ?? "Invalid window.");
    const collectionRaw = sp.get("collection") ?? DEFAULT_SCENE_COLLECTION;
    if (!(SCENE_COLLECTION_IDS as string[]).includes(collectionRaw)) {
      return fail(
        `Invalid collection ${JSON.stringify(collectionRaw)}: must be one of ${SCENE_COLLECTION_IDS.join(", ")}.`,
      );
    }
    const collectionId = collectionRaw as SceneCollectionId;
    const { value: limit, error: limitErr } = parseLimit(
      sp.get("limit"),
      SCENES_LIMIT_DEFAULT,
      SCENES_LIMIT_MAX,
    );
    if (limitErr || limit === null) return fail(limitErr ?? "Invalid limit.");
    const bboxNormalized = (bboxRaw as string).trim();

    const cache = getCache();
    const key = scenesCacheKey(bboxNormalized, window.start, window.end, collectionId, limit);
    const fresh = cache.get(key) as CachedScenes;
    if (fresh !== null) {
      return ok(fresh[0], {
        cacheHit: true,
        cacheControl:
          fresh[0].data_status.status === LIVE ? publicCacheControl(SCENES_TTL) : NO_STORE,
      });
    }

    try {
      const scenes = await fetchScenes({ bbox, collectionId, start: window.start, end: window.end, limit });
      const payload = withStatus(
        {
          query: {
            bbox: bboxNormalized,
            start: window.start,
            end: window.end,
            collection: collectionId,
            limit,
          },
          scenes,
          count: scenes.length,
          attribution: SENTINEL_ATTRIBUTION,
        },
        LIVE,
        CDSE_SOURCE,
        `Live Sentinel product footprints from the Copernicus Data Space catalogue. ${SENTINEL_ATTRIBUTION}`,
      );
      cache.set(key, [payload, payload.data_status.fetched_at], SCENES_TTL);
      return ok(payload, { cacheControl: publicCacheControl(SCENES_TTL) });
    } catch (err) {
      logError("CDSE OData scene search failed", err);
      const expired = cache.getStale(key) as CachedScenes;
      if (expired !== null && expired[0].data_status.status === LIVE) {
        return ok(asStale(expired[0]), { cacheHit: true, stale: true, cacheControl: NO_STORE });
      }
      // Nothing honest to serve: an empty result set, clearly labelled —
      // never invented products, never SIMULATED.
      return ok(
        withStatus(
          {
            query: {
              bbox: bboxNormalized,
              start: window.start,
              end: window.end,
              collection: collectionId,
              limit,
            },
            scenes: [] as SceneSummary[],
            count: 0,
            attribution: SENTINEL_ATTRIBUTION,
          },
          UNAVAILABLE,
          CDSE_SOURCE,
          "Scene search unavailable: the Copernicus catalogue could not be reached and no cached result exists.",
        ),
        { cacheControl: NO_STORE },
      );
    }
  } catch (e) {
    return internalError(e);
  }
}
