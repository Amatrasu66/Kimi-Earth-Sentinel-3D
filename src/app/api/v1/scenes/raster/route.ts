import type { NextRequest } from "next/server";
import { getCache } from "@/server/cache";
import { logError } from "@/server/http";
import {
  PC_ATTRIBUTION,
  PC_SOURCE,
  SCENE_RASTER_NEGATIVE_TTL,
  SCENE_RASTER_TTL,
  resolveSceneRaster,
} from "@/server/providers/scene-raster";
import { CDSE_SOURCE, SENTINEL_ATTRIBUTION } from "@/server/providers/cdse-catalogue";
import { LIVE, STALE, UNAVAILABLE, withStatus } from "@/server/provenance";
import {
  NO_STORE,
  fail,
  internalError,
  ok,
  publicCacheControl,
} from "@/server/route-helpers";
import { parseSceneId } from "@/server/validation";
import type { SceneRasterPayload } from "@/types";

export const dynamic = "force-dynamic";

function sceneRasterCacheKey(sceneId: string): string {
  return `scene-raster:v1:${sceneId}`;
}

type CachedRaster = [SceneRasterPayload, string | null | undefined] | null;

/** Rewrite a cached entry as STALE, preserving the original fetched_at. */
function asStale(data: SceneRasterPayload): SceneRasterPayload {
  return {
    ...data,
    data_status: {
      ...data.data_status,
      status: STALE,
      message: `Provider refresh failed — showing cached resolution fetched at ${data.data_status?.fetched_at ?? "unknown"}.`,
    },
  };
}

/**
 * Phase 7: resolve a selected CDSE scene (product GUID) to a renderable
 * raster descriptor. The client passes ONLY the scene id — the canonical
 * product name and the Planetary Computer item are resolved server-side
 * (exact-name filter + identity re-check), so no client input can steer a
 * provider URL. Renderable results are shared-cacheable; terminal
 * non-renderable answers are honestly labelled and short-cached; transport
 * failures degrade to STALE (if an entry exists) or UNAVAILABLE — never a
 * fabricated raster.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const { value: sceneId, error } = parseSceneId(sp.get("scene"));
    if (error) return fail(error);
    if (sceneId === null) {
      return fail("scene is required: a CDSE product id (UUID).");
    }

    const cache = getCache();
    const key = sceneRasterCacheKey(sceneId);
    const fresh = cache.get(key) as CachedRaster;
    if (fresh !== null) {
      return ok(fresh[0], {
        cacheHit: true,
        cacheControl:
          fresh[0].status === "renderable" ? publicCacheControl(SCENE_RASTER_TTL) : NO_STORE,
      });
    }

    try {
      const resolution = await resolveSceneRaster(sceneId);
      const renderable = resolution.status === "renderable";
      const payload = withStatus(
        {
          scene_id: sceneId,
          scene_name: resolution.scene_name,
          status: resolution.status,
          raster: resolution.raster,
          reason: resolution.reason,
          attribution: renderable ? PC_ATTRIBUTION : SENTINEL_ATTRIBUTION,
        },
        renderable ? LIVE : UNAVAILABLE,
        renderable ? PC_SOURCE : CDSE_SOURCE,
        resolution.reason,
      );
      cache.set(
        key,
        [payload, payload.data_status.fetched_at],
        renderable ? SCENE_RASTER_TTL : SCENE_RASTER_NEGATIVE_TTL,
      );
      return ok(payload, {
        cacheControl: renderable ? publicCacheControl(SCENE_RASTER_TTL) : NO_STORE,
      });
    } catch (err) {
      logError("Sentinel scene raster resolution failed", err);
      const expired = cache.getStale(key) as CachedRaster;
      if (expired !== null) {
        return ok(asStale(expired[0]), {
          cacheHit: true,
          stale: true,
          cacheControl: NO_STORE,
        });
      }
      const message =
        "Raster resolution unavailable: the catalogue or raster provider could not be " +
        "reached and no cached resolution exists for this scene.";
      return ok(
        withStatus(
          {
            scene_id: sceneId,
            scene_name: null,
            status: "unavailable" as const,
            raster: null,
            reason: message,
            attribution: SENTINEL_ATTRIBUTION,
          },
          UNAVAILABLE,
          PC_SOURCE,
          message,
        ),
        { cacheControl: NO_STORE },
      );
    }
  } catch (e) {
    return internalError(e);
  }
}
