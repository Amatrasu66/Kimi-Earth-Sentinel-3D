/**
 * T2.8 heatmap-route tests: live real grids, clamp disclosure, validation,
 * stale/unavailable policy, cache isolation, rate-limit preservation.
 * Deterministic and offline-safe — upstreams stubbed per test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getCache } from "@/server/cache";
import { middleware } from "@/middleware";
import { resetRuntimeStore } from "@/server/rate-limit";
import { GET as heatmapGET } from "@/app/api/v1/layers/[layerId]/heatmap/route";
import { decodeGrid } from "@/server/providers/heatmap";

const HEAT = { params: Promise.resolve({ layerId: "temperature" }) };

function heatUrl(layerId: string, params: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/layers/${layerId}/heatmap?${params}`);
}

function heatParams(layerId: string) {
  return { params: Promise.resolve({ layerId }) };
}

function stubFetch(handler: (url: string) => Promise<Response>) {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function okJson(payload: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(payload), { status }));
}

function omList(n: number, field: string, value: number) {
  return Array.from({ length: n }, () => ({
    current: { time: "2026-10-11T00:00:00Z", [field]: value },
  }));
}

interface HeatBody {
  success: boolean;
  data: {
    layer_id: string;
    resolution: number;
    grid: string;
    min_value: number;
    max_value: number;
    unit: string;
    warnings?: string[];
    data_status: { status: string; source: string | null; message: string | null; fetched_at: string };
  };
  meta: { cache_hit: boolean; stale: boolean; data_status: string | null };
}

beforeEach(() => {
  getCache().clear();
  resetRuntimeStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
  getCache().clear();
  resetRuntimeStore();
});

describe("heatmap route live grids (T2.8)", () => {
  it("serves a live temperature grid publicly with decoded real values", async () => {
    const fetchMock = stubFetch((url) => {
      if (!url.includes("api.open-meteo.com")) throw new Error(`unexpected upstream ${url}`);
      const n = (new URL(url).searchParams.get("latitude") ?? "").split(",").length;
      return okJson(omList(n, "temperature_2m", 21.5));
    });
    const res = await heatmapGET(heatUrl("temperature", "resolution=8"), HEAT);
    expect(res.status).toBe(200);
    const body = (await res.json()) as HeatBody;
    expect(body.success).toBe(true);
    expect(body.data.data_status.status).toBe("live");
    expect(body.data.data_status.source).toBe("Open-Meteo");
    expect(body.data.unit).toBe("celsius");
    expect(body.data.resolution).toBe(8);
    expect(decodeGrid(body.data.grid)).toHaveLength(32);
    expect(body.meta.cache_hit).toBe(false);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=3600, stale-while-revalidate=7200");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("serves repeats from cache and isolates cache entries per resolution", async () => {
    const fetchMock = stubFetch((url) => {
      if (!url.includes("api.open-meteo.com")) throw new Error(`unexpected upstream ${url}`);
      const n = (new URL(url).searchParams.get("latitude") ?? "").split(",").length;
      return okJson(omList(n, "temperature_2m", 20));
    });
    const first = (await (await heatmapGET(heatUrl("temperature", "resolution=8"), HEAT)).json()) as HeatBody;
    expect(fetchMock).toHaveBeenCalledTimes(1); // 32 cells = 1 batch
    const r12Body = (await (await heatmapGET(heatUrl("temperature", "resolution=12"), HEAT)).json()) as HeatBody;
    expect(fetchMock).toHaveBeenCalledTimes(3); // +2 batches for 72 cells
    expect(r12Body.data.resolution).toBe(12);
    const second = (await (await heatmapGET(heatUrl("temperature", "resolution=8"), HEAT)).json()) as HeatBody;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(second.meta.cache_hit).toBe(true);
    expect(second.data.data_status.fetched_at).toBe(first.data.data_status.fetched_at);
  });

  it("discloses the documented lower resolution for oversized requests", async () => {
    stubFetch((url) => {
      if (!url.includes("api.open-meteo.com")) throw new Error(`unexpected upstream ${url}`);
      const n = (new URL(url).searchParams.get("latitude") ?? "").split(",").length;
      return okJson(omList(n, "temperature_2m", 20));
    });
    const res = await heatmapGET(heatUrl("temperature", "resolution=128"), HEAT);
    const body = (await res.json()) as HeatBody;
    expect(body.data.resolution).toBe(20);
    expect(decodeGrid(body.data.grid)).toHaveLength(200);
    expect(body.data.data_status.message).toMatch(/exceeds the real-data maximum/);
    expect(body.data.data_status.status).toBe("live");
  });

  it("rejects invalid inputs with 400 before provider calls", async () => {
    const fetchMock = stubFetch(async () => {
      throw new Error("must not be called");
    });
    for (const params of ["resolution=0", "resolution=513", "resolution=abc", "time_range=1y"]) {
      const res = await heatmapGET(heatUrl("temperature", params), HEAT);
      expect(res.status, params).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404s unknown layers without provider calls", async () => {
    const fetchMock = stubFetch(async () => {
      throw new Error("must not be called");
    });
    const res = await heatmapGET(heatUrl("nope", ""), heatParams("nope"));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-serves expired grids as STALE, else UNAVAILABLE with an empty grid", async () => {
    stubFetch((url) => {
      if (!url.includes("api.open-meteo.com")) throw new Error(`unexpected upstream ${url}`);
      const n = (new URL(url).searchParams.get("latitude") ?? "").split(",").length;
      return okJson(omList(n, "temperature_2m", 20));
    });
    // Expire the REAL cached entry in place (keeps the full payload shape).
    await heatmapGET(heatUrl("temperature", "resolution=8"), HEAT);
    const cache = getCache();
    const entry = cache.getStale("heatmap:temperature:res=8:range=24h") as
      | [Record<string, unknown>, string | null | undefined]
      | null;
    if (entry === null) throw new Error("expected a cached heatmap entry");
    cache.set("heatmap:temperature:res=8:range=24h", [entry[0], entry[1]], -1);
    stubFetch(async () => {
      throw new Error("open-meteo down");
    });
    const staleRes = await heatmapGET(heatUrl("temperature", "resolution=8"), HEAT);
    const staleBody = (await staleRes.json()) as HeatBody;
    expect(staleBody.data.data_status.status).toBe("stale");
    expect(staleBody.meta.stale).toBe(true);
    expect(staleRes.headers.get("Cache-Control")).toBe("no-store");
    getCache().clear();
    const unavailRes = await heatmapGET(heatUrl("temperature", "resolution=8"), HEAT);
    const unavailBody = (await unavailRes.json()) as HeatBody;
    expect(unavailBody.data.data_status.status).toBe("unavailable");
    expect(unavailBody.data.grid).toBe("");
    expect(unavailRes.headers.get("Cache-Control")).toBe("no-store");
  });

  it("marks keyless wildfire grids UNAVAILABLE without ever fetching FIRMS", async () => {
    const fetchMock = stubFetch(async (url) => {
      if (url.includes("firms.modaps.eosdis.nasa.gov")) throw new Error("FIRMS must not be called keyless");
      throw new Error(`unexpected upstream ${url}`);
    });
    const res = await heatmapGET(heatUrl("wildfires", "resolution=8"), heatParams("wildfires"));
    const body = (await res.json()) as HeatBody;
    expect(body.data.data_status.status).toBe("unavailable");
    expect(body.data.grid).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the heavy rate-limit class (429 envelope preserved)", async () => {
    const ip = "203.0.113.98";
    for (let i = 0; i < 20; i++) {
      await middleware(
        new NextRequest(`http://localhost:3000/api/v1/layers/temperature/heatmap?resolution=8&n=${i}`, {
          headers: { "x-forwarded-for": ip },
        }),
      );
    }
    const limited = await middleware(
      new NextRequest("http://localhost:3000/api/v1/layers/temperature/heatmap?resolution=8&n=x", {
        headers: { "x-forwarded-for": ip },
      }),
    );
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(limited.headers.get("Cache-Control")).toBe("no-store");
  });
});
