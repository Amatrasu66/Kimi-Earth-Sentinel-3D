/**
 * Phase 7 scene-raster route tests: validation, cache semantics, honest
 * failure labels. Deterministic and offline-safe — both upstreams (CDSE
 * OData, Planetary Computer STAC) are stubbed per test (any unstubbed URL
 * throws) and the cache is cleared per test for isolation.
 *
 * NOTE: these tests were authored during implementation and have NOT been
 * executed by the implementing agent (see PHASE_7_IMPLEMENTATION_REPORT.md
 * §12). They run with the standard `npm test`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getCache } from "@/server/cache";
import { CDSE_SOURCE, SENTINEL_ATTRIBUTION } from "@/server/providers/cdse-catalogue";
import { PC_SOURCE, SCENE_RASTER_TTL } from "@/server/providers/scene-raster";
import { GET as rasterGET } from "@/app/api/v1/scenes/raster/route";
import type { SceneRasterPayload } from "@/types";

function okJson(payload: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(payload), { status }));
}

function stubFetch(handler: (url: string) => Promise<Response>) {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function rasterUrl(raw: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/scenes/raster?${raw}`);
}

const SCENE_ID = "7de1e22f-81bb-4922-909c-867365d04b55";
const L2A_NAME = "S2B_MSIL2A_20261017T144729_N0513_R139_T19MFT_20261017T182518.SAFE";
const L2A_ITEM = "S2B_MSIL2A_20261017T144729_R139_T19MFT_20261017T182518";
const L1C_NAME = "S2B_MSIL1C_20261017T144729_N0513_R139_T19MFT_20261017T182518.SAFE";

const CDSE_PAGE = { value: [{ Name: L2A_NAME }] };
const PC_PAGE = {
  type: "FeatureCollection",
  features: [
    {
      id: L2A_ITEM,
      bbox: [139.9, 35.0, 141.2, 36.1],
      properties: { "s2:product_uri": L2A_NAME },
      assets: {
        rendered_preview: {
          href: `https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png?collection=sentinel-2-l2a&item=${L2A_ITEM}`,
        },
      },
    },
  ],
};

interface RasterBody {
  success: boolean;
  data: SceneRasterPayload & {
    data_status: { status: string; source: string | null; message: string | null; fetched_at: string };
  };
  meta: { cache_hit: boolean; stale: boolean; source: string | null; data_status: string | null };
}

beforeEach(() => {
  getCache().clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  getCache().clear();
});

describe("scene-raster validation", () => {
  it("rejects a missing scene id without touching any upstream", async () => {
    const fetchMock = stubFetch(() => {
      throw new Error("no upstream may be contacted for invalid input");
    });
    const res = await rasterGET(rasterUrl(""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_PARAMS");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed ids (including injection-shaped input)", async () => {
    const fetchMock = stubFetch(() => {
      throw new Error("no upstream may be contacted for invalid input");
    });
    for (const bad of ["not-a-guid", "'; DROP TABLE Products", `${SCENE_ID} OR 1 eq 1`]) {
      const res = await rasterGET(rasterUrl(`scene=${encodeURIComponent(bad)}`));
      expect(res.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the canonical GUID and lowercases it for the cache key", async () => {
    const fetchMock = stubFetch((url: string) => {
      if (url.startsWith("https://catalogue.dataspace.copernicus.eu/")) {
        return okJson(CDSE_PAGE);
      }
      return okJson(PC_PAGE);
    });
    const upper = SCENE_ID.toUpperCase();
    const first = await rasterGET(rasterUrl(`scene=${upper}`));
    expect(first.status).toBe(200);
    const second = await rasterGET(rasterUrl(`scene=${SCENE_ID}`));
    const secondBody = (await second.json()) as RasterBody;
    expect(secondBody.meta.cache_hit).toBe(true);
    // Two upstream calls total: one CDSE + one PC, shared by both spellings.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("scene-raster live + cache", () => {
  it("returns a LIVE renderable descriptor with shared caching", async () => {
    stubFetch((url: string) => {
      if (url.startsWith("https://catalogue.dataspace.copernicus.eu/")) {
        return okJson(CDSE_PAGE);
      }
      return okJson(PC_PAGE);
    });
    const res = await rasterGET(rasterUrl(`scene=${SCENE_ID}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as RasterBody;
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("renderable");
    expect(body.data.data_status.status).toBe("live");
    expect(body.data.data_status.source).toBe(PC_SOURCE);
    expect(body.data.raster?.item_id).toBe(L2A_ITEM);
    expect(body.data.raster?.tile_url_template).toContain("planetarycomputer.microsoft.com");
    expect(body.data.attribution).toContain("Microsoft Planetary Computer");
    expect(body.meta.cache_hit).toBe(false);
    expect(res.headers.get("Cache-Control")).toContain(`s-maxage=${SCENE_RASTER_TTL}`);
  });

  it("serves repeats from the per-instance cache", async () => {
    const fetchMock = stubFetch((url: string) => {
      if (url.startsWith("https://catalogue.dataspace.copernicus.eu/")) {
        return okJson(CDSE_PAGE);
      }
      return okJson(PC_PAGE);
    });
    await rasterGET(rasterUrl(`scene=${SCENE_ID}`));
    const second = await rasterGET(rasterUrl(`scene=${SCENE_ID}`));
    expect(((await second.json()) as RasterBody).meta.cache_hit).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("labels a terminal 'unsupported' answer honestly and short-caches it", async () => {
    const fetchMock = stubFetch(() => okJson({ value: [{ Name: L1C_NAME }] }));
    const res = await rasterGET(rasterUrl(`scene=${SCENE_ID}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as RasterBody;
    expect(body.data.status).toBe("unsupported");
    expect(body.data.raster).toBeNull();
    expect(body.data.data_status.status).toBe("unavailable");
    expect(body.data.data_status.source).toBe(CDSE_SOURCE);
    expect(body.data.attribution).toBe(SENTINEL_ATTRIBUTION);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    // Terminal answers are cached in-process (short TTL), not re-fetched.
    const repeat = await rasterGET(rasterUrl(`scene=${SCENE_ID}`));
    expect(((await repeat.json()) as RasterBody).meta.cache_hit).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("scene-raster failure honesty", () => {
  it("serves an expired entry as STALE when upstreams fail", async () => {
    const key = `scene-raster:v1:${SCENE_ID}`;
    const payload = {
      scene_id: SCENE_ID,
      scene_name: L2A_NAME,
      status: "renderable" as const,
      raster: {
        provider: "microsoft-planetary-computer" as const,
        collection: "sentinel-2-l2a" as const,
        item_id: L2A_ITEM,
        tile_url_template:
          `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x` +
          `?collection=sentinel-2-l2a&item=${L2A_ITEM}&assets=visual&asset_bidx=visual%7C1,2,3&nodata=0&format=png`,
        preview_url: null,
        bbox: [139.9, 35.0, 141.2, 36.1] as [number, number, number, number],
        min_zoom: 0,
        max_zoom: 14,
        rendering: "True color (visual band composite 1–2–3)",
        resolution_note: "~10 m native pixels",
      },
      reason: "Renderable via Microsoft Planetary Computer.",
      attribution: "Contains modified Copernicus Sentinel data · Rendered by Microsoft Planetary Computer",
      data_status: {
        status: "live",
        source: PC_SOURCE,
        fetched_at: "2026-10-17T00:00:00Z",
        message: null,
      },
    };
    // TTL 0: get() misses immediately while getStale() still serves it.
    getCache().set(key, [payload, payload.data_status.fetched_at], 0);
    stubFetch(() => {
      throw new Error("upstream down");
    });
    const res = await rasterGET(rasterUrl(`scene=${SCENE_ID}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as RasterBody;
    expect(body.meta.stale).toBe(true);
    expect(body.data.data_status.status).toBe("stale");
    expect(body.data.data_status.message).toContain("cached");
    expect(body.data.raster?.item_id).toBe(L2A_ITEM);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns an UNAVAILABLE envelope when upstreams fail with no cache", async () => {
    stubFetch(() => {
      throw new Error("upstream down");
    });
    const res = await rasterGET(rasterUrl(`scene=${SCENE_ID}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as RasterBody;
    expect(body.data.status).toBe("unavailable");
    expect(body.data.raster).toBeNull();
    expect(body.data.data_status.status).toBe("unavailable");
    expect(body.data.data_status.message).toMatch(/no cached resolution/i);
    expect(body.data.reason).toMatch(/unavailable/i);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
