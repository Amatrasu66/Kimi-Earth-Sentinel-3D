/**
 * T2.7 /stats route tests: live overview, partial failure, stale, key
 * redaction, cache policy. Deterministic and offline-safe — upstreams are
 * stubbed per test (any unstubbed URL throws).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCache } from "@/server/cache";
import { GET as statsGET } from "@/app/api/v1/stats/route";
import { statsOverviewKey } from "@/server/services/stats";

const H = 3600 * 1000;

function usgsFixture(base: number) {
  return {
    type: "FeatureCollection",
    metadata: { count: 3 },
    features: [
      { id: "us1", properties: { mag: 5.2, place: "A", time: base - 1 * H, url: "https://example.invalid/1" }, geometry: { coordinates: [10, 20, 33] } },
      { id: "us2", properties: { mag: 4.1, place: "B", time: base - 2 * H, url: "https://example.invalid/2" }, geometry: { coordinates: [-120, 35, 10] } },
      { id: "us3", properties: { mag: 6.3, place: "C", time: base - 3 * H, url: "https://example.invalid/3" }, geometry: { coordinates: [139.6, 35.6, 45] } },
    ],
  };
}

function eonetFixture(base: number) {
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    events: [
      {
        id: "e1", title: "Storm Alpha",
        categories: [{ id: "severeStorms", title: "Severe Storms" }],
        geometry: [{ date: iso(base - H), type: "Point", coordinates: [0, 10] }],
      },
    ],
  };
}

function stubFetch(handler: (url: string) => Promise<Response>) {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function okJson(payload: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(payload), { status }));
}

interface StatsBody {
  success: boolean;
  data: {
    window: { start: string; end: string };
    global: Record<string, number | string | null>;
    sources: Record<string, { status: string; source: string | null; message: string | null; fetched_at: string }>;
    timestamp: string;
    data_status: { status: string; source: string | null; message: string | null; fetched_at: string };
  };
  meta: { cache_hit: boolean; stale: boolean; source: string | null; data_status: string | null };
}

beforeEach(() => {
  getCache().clear();
  vi.stubEnv("NASA_FIRMS_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  getCache().clear();
  vi.restoreAllMocks();
});

describe("/stats overview", () => {
  it("serves live metrics with per-source provenance and the public policy", async () => {
    const base = Date.now();
    const fetchMock = stubFetch((url) => {
      if (url.includes("earthquake.usgs.gov")) return okJson(usgsFixture(base));
      if (url.includes("eonet.gsfc.nasa.gov")) return okJson(eonetFixture(base));
      throw new Error(`unexpected upstream ${url}`);
    });
    const res = await statsGET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as StatsBody;
    expect(body.success).toBe(true);
    expect(body.data.global.earthquakes_24h).toBe(3);
    expect(body.data.global.max_magnitude_24h).toBe(6.3);
    expect(body.data.global.active_events).toBe(1);
    expect(body.data.global.wildfire_count).toBeNull();
    expect(body.data.sources.earthquakes.status).toBe("live");
    expect(body.data.sources.disasters.status).toBe("live");
    expect(body.data.sources.wildfires.status).toBe("unavailable");
    expect(body.data.data_status.status).toBe("live");
    expect(body.data.data_status.message).toMatch(/wildfires/);
    expect(body.data.window.start < body.data.window.end).toBe(true);
    expect(body.meta.cache_hit).toBe(false);
    expect(body.meta.data_status).toBe("live");
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("serves keyed FIRMS detections as live wildfire metrics", async () => {
    vi.stubEnv("NASA_FIRMS_API_KEY", "t27-key");
    const base = Date.now();
    // Acquisition times anchored to now (hour-floored) — always inside the
    // trailing 24h window regardless of when the suite runs.
    const hhmm = (d: Date) =>
      `${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
    const row = (d: Date, lat: number, lon: number, bright: number) =>
      `${lat},${lon},${bright},1,1,${d.toISOString().slice(0, 10)},${hhmm(d)},N,VN,n,2.0NRT,300,9.0,D,0`;
    stubFetch((url) => {
      if (url.includes("earthquake.usgs.gov")) return okJson({ features: [] });
      if (url.includes("eonet.gsfc.nasa.gov")) return okJson({ events: [] });
      if (url.includes("firms.modaps.eosdis.nasa.gov")) {
        expect(url).toContain("/WORLD/1");
        return Promise.resolve(
          new Response(
            [
              "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type",
              row(new Date(base - 1 * H), 34.1, -118.2, 350.5),
              row(new Date(base - 2 * H), 35.0, -119.0, 420.25),
            ].join("\n"),
            { status: 200 },
          ),
        );
      }
      throw new Error(`unexpected upstream ${url}`);
    });
    const res = await statsGET();
    const body = (await res.json()) as StatsBody;
    expect(body.data.global.wildfire_count).toBe(2);
    expect(body.data.global.max_brightness).toBe(420.3);
    expect(body.data.sources.wildfires.status).toBe("live");
    expect(body.data.data_status.message).toBeNull();
  });

  it("serves repeats from cache with the original fetched_at", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes("earthquake.usgs.gov")) return okJson({ features: [] });
      if (url.includes("eonet.gsfc.nasa.gov")) return okJson({ events: [] });
      throw new Error(`unexpected upstream ${url}`);
    });
    const first = (await (await statsGET()).json()) as StatsBody;
    const second = (await (await statsGET()).json()) as StatsBody;
    expect(fetchMock).toHaveBeenCalledTimes(2); // one USGS + one EONET call, then cache
    expect(second.meta.cache_hit).toBe(true);
    expect(second.data.data_status.fetched_at).toBe(first.data.data_status.fetched_at);
    expect(second.data.global.active_events).toBe(0);
  });

  it("re-serves expired LIVE overviews as STALE on total failure", async () => {
    stubFetch((url) => {
      if (url.includes("earthquake.usgs.gov")) return okJson({ features: [] });
      if (url.includes("eonet.gsfc.nasa.gov")) return okJson({ events: [] });
      throw new Error(`unexpected upstream ${url}`);
    });
    const first = (await (await statsGET()).json()) as StatsBody;
    getCache().set(statsOverviewKey(), [
      { data_status: { status: "live", fetched_at: first.data.data_status.fetched_at } },
      first.data.data_status.fetched_at,
    ], -1);
    stubFetch(async () => {
      throw new Error("everything down");
    });
    const res = await statsGET();
    const body = (await res.json()) as StatsBody;
    expect(body.data.data_status.status).toBe("stale");
    expect(body.data.data_status.fetched_at).toBe(first.data.data_status.fetched_at);
    expect(body.meta.cache_hit).toBe(true);
    expect(body.meta.stale).toBe(true);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers UNAVAILABLE with null metrics on total failure without cache", async () => {
    stubFetch(async () => {
      throw new Error("everything down");
    });
    const res = await statsGET();
    const body = (await res.json()) as StatsBody;
    expect(body.success).toBe(true);
    expect(body.data.data_status.status).toBe("unavailable");
    expect(body.data.global.earthquakes_24h).toBeNull();
    expect(body.data.global.active_events).toBeNull();
    expect(body.data.global.wildfire_count).toBeNull();
    expect(body.data.sources.earthquakes.status).toBe("unavailable");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("never leaks the FIRMS key through logs or messages on failure", async () => {
    vi.stubEnv("NASA_FIRMS_API_KEY", "t27-secret-key-abc");
    vi.stubEnv("FIRMS_TIMEOUT", "1");
    const warnings: unknown[][] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warnings.push(args);
    });
    stubFetch((url) => {
      if (url.includes("earthquake.usgs.gov")) return okJson({ features: [] });
      if (url.includes("eonet.gsfc.nasa.gov")) return okJson({ events: [] });
      // Hang the FIRMS fetch so the shared helper times out — the timeout
      // message embeds the (redacted) request URL carrying the key.
      if (url.includes("firms.modaps.eosdis.nasa.gov")) return new Promise<Response>(() => {});
      throw new Error(`unexpected upstream ${url}`);
    });
    const body = (await (await statsGET()).json()) as StatsBody;
    expect(body.data.sources.wildfires.status).toBe("unavailable");
    const logged = warnings.map((args) => args.map(String).join(" ")).join("\n");
    expect(logged).not.toContain("t27-secret-key-abc");
    expect(logged).toContain("[REDACTED]");
  }, 15000);

  it("times out a slow source through the shared helper (EONET_TIMEOUT=1)", async () => {
    vi.stubEnv("EONET_TIMEOUT", "1");
    stubFetch((url) => {
      if (url.includes("earthquake.usgs.gov")) return okJson({ features: [] });
      if (url.includes("eonet.gsfc.nasa.gov")) return new Promise<Response>(() => {});
      throw new Error(`unexpected upstream ${url}`);
    });
    const body = (await (await statsGET()).json()) as StatsBody;
    expect(body.data.sources.disasters.status).toBe("unavailable");
    expect(body.data.sources.earthquakes.status).toBe("live");
    expect(body.data.data_status.status).toBe("live");
    expect(body.data.data_status.message).toMatch(/disasters/);
  }, 15000);
});
