/**
 * T2.7 /stats/historical route tests: real series per period, validation,
 * UNAVAILABLE honesty, stale, cache isolation, rate-limit preservation.
 * Deterministic and offline-safe — upstreams stubbed per test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getCache } from "@/server/cache";
import { middleware } from "@/middleware";
import { resetRuntimeStore } from "@/server/rate-limit";
import { GET as historicalGET } from "@/app/api/v1/stats/historical/route";
import { statsHistoryKey } from "@/server/services/stats";

const H = 3600 * 1000;
const D = 24 * H;

function histUrl(params: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/stats/historical?${params}`);
}

function stubFetch(handler: (url: string) => Promise<Response>) {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function okJson(payload: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(payload), { status }));
}

interface HistBody {
  success: boolean;
  data: {
    metric: string;
    period: string;
    granularity: string | null;
    start: string | null;
    end: string | null;
    values: Array<{
      start: string;
      end: string;
      count: number;
      max_magnitude: number | null;
      avg_magnitude: number | null;
      max_brightness: number | null;
      by_category: Record<string, number> | null;
    }>;
    data_status: { status: string; source: string | null; message: string | null; fetched_at: string };
  };
  meta: { cache_hit: boolean; stale: boolean; data_status: string | null };
}

beforeEach(() => {
  getCache().clear();
  resetRuntimeStore();
  vi.stubEnv("NASA_FIRMS_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  getCache().clear();
  resetRuntimeStore();
});

describe("/stats/historical earthquakes", () => {
  it("buckets 7d of real records into 7 daily buckets (LIVE, public)", async () => {
    const base = Date.now();
    // Noon-anchored days-ago timestamps: same-UTC-day pairs stay paired no
    // matter when the suite runs (midnight-safe).
    const noonDaysAgo = (n: number, hour = 12) => {
      const d = new Date(base - n * D);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0);
    };
    const fetchMock = stubFetch((url) => {
      if (!url.includes("earthquake.usgs.gov")) throw new Error(`unexpected upstream ${url}`);
      const params = new URL(url).searchParams;
      // Bounded single request: ISO datetimes, explicit limit.
      expect(params.get("minmagnitude")).toBe("2.5");
      expect(params.get("orderby")).toBe("time");
      expect(Number(params.get("limit"))).toBeLessThanOrEqual(20000);
      expect(params.get("starttime")).toMatch(/Z$/);
      return okJson({
        features: [
          { id: "a", properties: { mag: 5.0, time: noonDaysAgo(1), url: "https://example.invalid/a" }, geometry: { coordinates: [0, 10, 5] } },
          { id: "b", properties: { mag: 6.0, time: noonDaysAgo(1, 13), url: "https://example.invalid/b" }, geometry: { coordinates: [1, 11, 5] } },
          { id: "c", properties: { mag: 4.5, time: noonDaysAgo(3), url: "https://example.invalid/c" }, geometry: { coordinates: [2, 12, 5] } },
        ],
      });
    });
    const res = await historicalGET(histUrl("metric=earthquakes&period=7d"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as HistBody;
    expect(body.success).toBe(true);
    expect(body.data.granularity).toBe("daily");
    expect(body.data.values).toHaveLength(7);
    expect(body.data.values.reduce((n, b) => n + b.count, 0)).toBe(3);
    // Contiguous UTC-day buckets, [start, end) chained.
    expect(body.data.values.every((b, i, arr) => i === 0 || b.start === arr[i - 1].end)).toBe(true);
    expect(body.data.values[0].start).toBe(body.data.start);
    expect(body.data.values[6].end).toBe(body.data.end);
    // The two same-day events share a bucket with max 6.0 / avg 5.5.
    const full = body.data.values.find((b) => b.count === 2);
    expect(full?.max_magnitude).toBe(6);
    expect(full?.avg_magnitude).toBe(5.5);
    expect(body.data.data_status.status).toBe("live");
    expect(body.meta.cache_hit).toBe(false);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("buckets 24h into 24 hourly buckets", async () => {
    stubFetch((url) => {
      if (!url.includes("earthquake.usgs.gov")) throw new Error(`unexpected upstream ${url}`);
      return okJson({ features: [] });
    });
    const body = (await (await historicalGET(histUrl("metric=earthquakes&period=24h"))).json()) as HistBody;
    expect(body.data.granularity).toBe("hourly");
    expect(body.data.values).toHaveLength(24);
    // Genuine zero window: counts 0 with null magnitudes (not unavailable).
    expect(body.data.values.every((b) => b.count === 0 && b.max_magnitude === null)).toBe(true);
    expect(body.data.data_status.status).toBe("live");
  });

  it("isolates cache entries per period and honors cache_hit/fetched_at", async () => {
    const fetchMock = stubFetch((url) => {
      if (!url.includes("earthquake.usgs.gov")) throw new Error(`unexpected upstream ${url}`);
      return okJson({ features: [] });
    });
    const r24 = (await (await historicalGET(histUrl("metric=earthquakes&period=24h"))).json()) as HistBody;
    const r7 = (await (await historicalGET(histUrl("metric=earthquakes&period=7d"))).json()) as HistBody;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r24.data.values).toHaveLength(24);
    expect(r7.data.values).toHaveLength(7);
    const r7again = (await (await historicalGET(histUrl("metric=earthquakes&period=7d"))).json()) as HistBody;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r7again.meta.cache_hit).toBe(true);
    expect(r7again.data.data_status.fetched_at).toBe(r7.data.data_status.fetched_at);
  });

  it("re-serves expired series as STALE, else UNAVAILABLE, both no-store", async () => {
    stubFetch((url) => {
      if (!url.includes("earthquake.usgs.gov")) throw new Error(`unexpected upstream ${url}`);
      return okJson({ features: [] });
    });
    const first = (await (await historicalGET(histUrl("metric=earthquakes&period=7d"))).json()) as HistBody;
    getCache().set(statsHistoryKey("earthquakes", "7d"), [
      { data_status: { status: "live", fetched_at: first.data.data_status.fetched_at } },
      first.data.data_status.fetched_at,
    ], -1);
    stubFetch(async () => {
      throw new Error("usgs down");
    });
    const staleRes = await historicalGET(histUrl("metric=earthquakes&period=7d"));
    const staleBody = (await staleRes.json()) as HistBody;
    expect(staleBody.data.data_status.status).toBe("stale");
    expect(staleBody.meta.stale).toBe(true);
    expect(staleRes.headers.get("Cache-Control")).toBe("no-store");
    getCache().clear();
    const unavailRes = await historicalGET(histUrl("metric=earthquakes&period=7d"));
    const unavailBody = (await unavailRes.json()) as HistBody;
    expect(unavailBody.data.data_status.status).toBe("unavailable");
    expect(unavailBody.data.values).toEqual([]);
    expect(unavailRes.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("/stats/historical disasters", () => {
  it("counts unique events once with first-category buckets (status=all, date range)", async () => {
    const base = Date.now();
    const fetchMock = stubFetch((url) => {
      if (!url.includes("eonet.gsfc.nasa.gov")) throw new Error(`unexpected upstream ${url}`);
      const params = new URL(url).searchParams;
      expect(params.get("status")).toBe("all");
      expect(params.get("start")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(params.get("end")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const iso = (ms: number) => new Date(ms).toISOString();
      return okJson({
        events: [
          {
            id: "e1", title: "Storm",
            categories: [{ id: "severeStorms", title: "Severe Storms" }, { id: "floods", title: "Floods" }],
            geometry: [{ date: iso(base - 2 * D), type: "Point", coordinates: [0, 10] }, { date: iso(base - 1 * D), type: "Point", coordinates: [1, 11] }],
          },
          { id: "e1", title: "dup", categories: [{ id: "floods", title: "Floods" }], geometry: [{ date: iso(base - 1 * D), type: "Point", coordinates: [2, 12] }] },
          { id: "e2", title: "Fire", categories: [{ id: "wildfires", title: "Wildfires" }], geometry: [{ date: iso(base - 1 * D), type: "Point", coordinates: [3, 13] }] },
        ],
      });
    });
    const body = (await (await historicalGET(histUrl("metric=disasters&period=7d"))).json()) as HistBody;
    expect(body.data.data_status.status).toBe("live");
    expect(body.data.values).toHaveLength(7);
    expect(body.data.values.reduce((n, b) => n + b.count, 0)).toBe(2);
    const day1 = body.data.values.find((b) => b.count === 2);
    // e1 counted once under its FIRST category despite two categories + two geometries + a dup record.
    expect(day1?.by_category).toEqual({ "Severe Storms": 1, Wildfires: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("/stats/historical unavailability honesty", () => {
  it("returns UNAVAILABLE for archiveless metrics without any fetch", async () => {
    const fetchMock = stubFetch(async () => {
      throw new Error("must not be called");
    });
    for (const metric of ["temperature", "air_quality"]) {
      const res = await historicalGET(histUrl(`metric=${metric}&period=7d`));
      const body = (await res.json()) as HistBody;
      expect(body.success).toBe(true);
      expect(body.data.values).toEqual([]);
      expect(body.data.granularity).toBeNull();
      expect(body.data.data_status.status).toBe("unavailable");
      expect(body.data.data_status.message).toMatch(/archive|history/i);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns UNAVAILABLE for keyless wildfire history without fetching FIRMS", async () => {
    const fetchMock = stubFetch(async (url) => {
      if (url.includes("firms.modaps.eosdis.nasa.gov")) throw new Error("FIRMS must not be called keyless");
      throw new Error(`unexpected upstream ${url}`);
    });
    const res = await historicalGET(histUrl("metric=wildfires&period=7d"));
    const body = (await res.json()) as HistBody;
    expect(body.data.data_status.status).toBe("unavailable");
    expect(body.data.data_status.message).toMatch(/API key/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns UNAVAILABLE for 30-day wildfire history (day-range support ends at 10)", async () => {
    vi.stubEnv("NASA_FIRMS_API_KEY", "t27-key");
    const fetchMock = stubFetch(async () => {
      throw new Error("WORLD/30 must never be requested");
    });
    const res = await historicalGET(histUrl("metric=wildfires&period=30d"));
    const body = (await res.json()) as HistBody;
    expect(body.data.data_status.status).toBe("unavailable");
    expect(body.data.data_status.message).toMatch(/10 days/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves keyed 7-day wildfire history from the WORLD/7 feed", async () => {
    vi.stubEnv("NASA_FIRMS_API_KEY", "t27-key");
    stubFetch((url) => {
      if (!url.includes("firms.modaps.eosdis.nasa.gov")) throw new Error(`unexpected upstream ${url}`);
      expect(url).toContain("/WORLD/7");
      const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      const base = Date.now();
      return Promise.resolve(
        new Response(
          [
            "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type",
            `10,10,400.0,1,1,${day(base - 1 * D)},1200,N,VN,n,2.0NRT,300,5,D,0`,
            `11,11,350.0,1,1,${day(base - 3 * D)},1200,N,VN,n,2.0NRT,300,5,D,0`,
          ].join("\n"),
          { status: 200 },
        ),
      );
    });
    const body = (await (await historicalGET(histUrl("metric=wildfires&period=7d"))).json()) as HistBody;
    expect(body.data.data_status.status).toBe("live");
    expect(body.data.granularity).toBe("daily");
    expect(body.data.values).toHaveLength(7);
    expect(body.data.values.reduce((n, b) => n + b.count, 0)).toBe(2);
    expect(body.data.values.every((b) => b.max_magnitude === null && b.avg_magnitude === null)).toBe(true);
  });
});

describe("/stats/historical validation and policy", () => {
  it("rejects unknown metrics/periods with 400 before provider calls", async () => {
    const fetchMock = stubFetch(async () => {
      throw new Error("must not be called");
    });
    for (const params of ["metric=nope&period=7d", "metric=earthquakes&period=1y", "metric=earthquakes&period=forever"]) {
      const res = await historicalGET(histUrl(params));
      expect(res.status, params).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores the retired aggregation parameter with fixed granularity", async () => {
    stubFetch((url) => {
      if (!url.includes("earthquake.usgs.gov")) throw new Error(`unexpected upstream ${url}`);
      return okJson({ features: [] });
    });
    const body = (await (await historicalGET(histUrl("metric=earthquakes&period=7d&aggregation=monthly"))).json()) as HistBody;
    expect(body.data.granularity).toBe("daily");
    expect(body.data.values).toHaveLength(7);
  });

  it("keeps the standard rate-limit class (429 envelope preserved)", async () => {
    const ip = "203.0.113.99";
    for (let i = 0; i < 60; i++) {
      await middleware(
        new NextRequest(`http://localhost:3111/api/v1/stats/historical?metric=earthquakes&period=7d&n=${i}`, {
          headers: { "x-forwarded-for": ip },
        }),
      );
    }
    const limited = await middleware(
      new NextRequest("http://localhost:3111/api/v1/stats/historical?metric=earthquakes&period=7d&n=x", {
        headers: { "x-forwarded-for": ip },
      }),
    );
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("RATE_LIMITED");
  });
});
