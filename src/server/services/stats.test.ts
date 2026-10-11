/**
 * T2.7 stats-service unit tests: windows, extraction, bucketing, overview
 * aggregation, and history assembly. Deterministic and offline-safe —
 * upstream fetches are stubbed per test (any unstubbed URL throws).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCache } from "@/server/cache";
import {
  EONET_SOURCE,
  EONET_STATS_LIMIT,
  FIRMS_SOURCE,
  FirmsKeyMissingError,
  USGS_SOURCE,
  bucketEonet,
  bucketFires,
  bucketIndex,
  bucketQuakes,
  bucketedWindow,
  extractEonetRecords,
  extractFireRecords,
  extractQuakeRecords,
  fetchQuakeFeatures,
  getStatsHistory,
  getStatsOverview,
  trailingWindow,
} from "@/server/services/stats";

const NOW = new Date("2026-10-11T00:00:00Z");
const H = 3600 * 1000;
const D = 24 * H;

// USGS fixture: 3 valid (max 6.3 @ T-2h), 1 mag-null, 1 bad-coords.
function usgsFixture(base: number) {
  return {
    type: "FeatureCollection",
    metadata: { count: 5 },
    features: [
      { id: "us1", properties: { mag: 5.2, place: "A", time: base - 1 * H, url: "https://example.invalid/1" }, geometry: { coordinates: [10, 20, 33] } },
      { id: "us2", properties: { mag: 4.1, place: "B", time: base - 2 * H, url: "https://example.invalid/2" }, geometry: { coordinates: [-120, 35, 10] } },
      { id: "us3", properties: { mag: 6.3, place: "C", time: base - 3 * H, url: "https://example.invalid/3" }, geometry: { coordinates: [139.6, 35.6, 45] } },
      { id: "us4", properties: { mag: null, place: "D", time: base - 4 * H }, geometry: { coordinates: [0, 0, 5] } },
      { id: "us5", properties: { mag: 7.9, place: "E", time: base - 5 * H }, geometry: { coordinates: [0, 999, 5] } },
    ],
  };
}

// EONET fixture in the REAL v3 shape (`geometry` singular — verified against
// the live API 2026-10-11): multi-category + duplicate + geometry-less +
// bad-date + id-less rows.
function eonetFixture(base: number) {
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    events: [
      {
        id: "e1", title: "Storm Alpha",
        categories: [{ id: "severeStorms", title: "Severe Storms" }, { id: "floods", title: "Floods" }],
        geometry: [
          { date: iso(base - 3 * D), type: "Point", coordinates: [0, 10] },
          { date: iso(base - 1 * D), type: "Point", coordinates: [1, 11] },
        ],
        sources: [{ id: "EO" }],
      },
      { id: "e1", title: "Storm Alpha dup", categories: [{ id: "floods", title: "Floods" }], geometry: [{ date: iso(base - 1 * D), type: "Point", coordinates: [2, 12] }] },
      {
        id: "e2", title: "Volcano",
        categories: [{ id: "volcanoes", title: "Volcanoes" }],
        geometry: [{ date: iso(base - 2 * D), type: "Point", coordinates: [100, -5] }],
      },
      { id: "e3", title: "No Geometry", categories: [{ id: "floods", title: "Floods" }], geometry: [] },
      { id: "e4", title: "Bad Date", categories: [], geometry: [{ date: "not-a-date", type: "Point", coordinates: [0, 0] }] },
      { title: "No Id", categories: [], geometry: [{ date: iso(base - 1 * D), type: "Point", coordinates: [0, 0] }] },
    ],
  };
}

const FIRMS_HEADER =
  "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type";

function firmsFixture(rows: string[]): string {
  return [FIRMS_HEADER, ...rows].join("\n");
}

function stubFetch(handler: (url: string) => Promise<Response>) {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function okJson(payload: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(payload), { status }));
}

beforeEach(() => {
  getCache().clear();
  vi.stubEnv("NASA_FIRMS_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  getCache().clear();
});

describe("windows and bucket indices (UTC)", () => {
  it("builds exact trailing millisecond windows", () => {
    const w = trailingWindow("24h", NOW);
    expect(w.end.getTime() - w.start.getTime()).toBe(24 * H);
    expect(w.end.getTime()).toBe(NOW.getTime());
    expect(trailingWindow("30d", NOW).end.getTime() - trailingWindow("30d", NOW).start.getTime()).toBe(30 * D);
  });

  it("aligns historical windows to UTC hour/day floors with full buckets", () => {
    const h = bucketedWindow("24h", new Date("2026-10-11T05:40:00Z"));
    expect(h.granularity).toBe("hourly");
    expect(h.start.toISOString()).toBe("2026-10-10T05:00:00.000Z");
    expect(h.end.toISOString()).toBe("2026-10-11T05:00:00.000Z");
    const d = bucketedWindow("7d", new Date("2026-10-11T05:40:00Z"));
    expect(d.granularity).toBe("daily");
    expect(d.start.toISOString()).toBe("2026-10-04T00:00:00.000Z");
    expect(d.end.toISOString()).toBe("2026-10-11T00:00:00.000Z");
  });

  it("spans leap day correctly (Feb 29 2024 inside a 7d window)", () => {
    const w = bucketedWindow("7d", new Date("2024-03-01T12:00:00Z"));
    expect(w.start.toISOString()).toBe("2024-02-23T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    const starts: string[] = [];
    for (let t = w.start.getTime(); t < w.end.getTime(); t += D) {
      starts.push(new Date(t).toISOString());
    }
    expect(starts).toContain("2024-02-29T00:00:00.000Z");
    expect(trailingWindow("7d", new Date("2024-03-01T00:00:00Z")).start.toISOString()).toBe(
      "2024-02-23T00:00:00.000Z",
    );
  });

  it("assigns buckets [start, end): start-inclusive, end-exclusive", () => {
    expect(bucketIndex(1000, 1000, 100, 10)).toBe(0);
    expect(bucketIndex(1099, 1000, 100, 10)).toBe(0);
    expect(bucketIndex(1100, 1000, 100, 10)).toBe(1);
    expect(bucketIndex(999, 1000, 100, 10)).toBe(-1);
    expect(bucketIndex(2000, 1000, 100, 10)).toBe(-1);
  });
});

describe("record extraction (counting units)", () => {
  it("counts valid USGS records; skips mag-null and bad-coords rows", () => {
    const records = extractQuakeRecords(usgsFixture(NOW.getTime()).features);
    expect(records.map((r) => r.mag)).toEqual([5.2, 4.1, 6.3]);
  });

  it("dedupes EONET by id and counts multi-category events once", () => {
    const records = extractEonetRecords(eonetFixture(NOW.getTime()).events);
    expect(records.map((r) => r.id)).toEqual(["e1", "e2"]);
    // Latest geometry date wins for e1; first category is primary.
    expect(records[0].category).toBe("Severe Storms");
    expect(records[0].time).toBe(NOW.getTime() - 1 * D);
  });

  it("accepts the legacy plural `geometries` key defensively", () => {
    const records = extractEonetRecords([
      {
        id: "legacy",
        categories: [{ id: "floods", title: "Floods" }],
        geometries: [{ date: new Date(NOW.getTime() - D).toISOString(), coordinates: [0, 5] }],
      },
    ]);
    expect(records.map((r) => r.id)).toEqual(["legacy"]);
  });

  it("extracts FIRMS rows with UTC acquisition times; skips malformed rows", () => {
    const { records, truncated } = extractFireRecords(
      firmsFixture([
        "34.1,-118.2,350.5,1.0,1.0,2026-10-10,0630,N,VN,n,2.0NRT,300.0,12.5,D,0",
        "35.0,-119.0,,1.0,1.0,2026-10-10,0700,N,VN,n,2.0NRT,300.0,1.0,D,0",
        "999,0,300.0,1.0,1.0,2026-10-10,0700,N,VN,n,2.0NRT,300.0,1.0,D,0",
        "36.0,-120.0,300.0,1.0,1.0,2026-10-10,24xx,N,VN,n,2.0NRT,300.0,1.0,D,0",
      ]),
    );
    expect(truncated).toBe(false);
    expect(records).toEqual([
      { time: Date.UTC(2026, 9, 10, 6, 30), bright: 350.5 },
    ]);
  });

  it("flags truncation instead of silently undercounting FIRMS rows", () => {
    const rows = Array.from({ length: 5 }, (_, i) => `30,${-100 - i},300,1,1,2026-10-10,0100,N,VN,n,2.0,300,1,D,0`);
    const { records, truncated } = extractFireRecords(firmsFixture(rows), 3);
    expect(truncated).toBe(true);
    expect(records).toHaveLength(3);
  });

  it("treats USGS 204 / empty bodies as genuine zero windows", async () => {
    stubFetch(async () => new Response(null, { status: 204 }));
    await expect(
      fetchQuakeFeatures(new Date(NOW.getTime() - D), NOW),
    ).resolves.toEqual([]);
  });
});

describe("bucketing", () => {
  it("buckets quakes by hour with max/avg, nulls on empty buckets", () => {
    const window = bucketedWindow("24h", NOW);
    const buckets = bucketQuakes(
      [
        { mag: 5.0, time: window.start.getTime() + 30 * 60 * 1000 },
        { mag: 4.0, time: window.start.getTime() + 40 * 60 * 1000 },
        { mag: 6.0, time: window.end.getTime() }, // end-exclusive → dropped
      ],
      window,
      H,
    );
    expect(buckets).toHaveLength(24);
    expect(buckets[0].count).toBe(2);
    expect(buckets[0].max_magnitude).toBe(5);
    expect(buckets[0].avg_magnitude).toBe(4.5);
    expect(buckets[1].count).toBe(0);
    expect(buckets[1].max_magnitude).toBeNull();
    expect(buckets[1].avg_magnitude).toBeNull();
    expect(buckets.every((b, i, arr) => i === 0 || b.start === arr[i - 1].end)).toBe(true);
  });

  it("buckets EONET by latest-activity day with single-count categories", () => {
    const window = bucketedWindow("7d", NOW);
    const buckets = bucketEonet(extractEonetRecords(eonetFixture(NOW.getTime()).events), window, D);
    expect(buckets).toHaveLength(7);
    const total = buckets.reduce((n, b) => n + b.count, 0);
    expect(total).toBe(2);
    const withActivity = buckets.filter((b) => b.count > 0);
    expect(withActivity).toHaveLength(2);
    // e1 (Severe Storms primary, not Floods) lands on the base-1d bucket.
    const day1 = buckets.find((b) => b.start === new Date(NOW.getTime() - 1 * D).toISOString());
    expect(day1?.by_category).toEqual({ "Severe Storms": 1 });
  });

  it("buckets FIRMS detections by day with max brightness, nulls when empty", () => {
    const window = bucketedWindow("7d", NOW);
    const buckets = bucketFires(
      [
        { time: window.start.getTime() + 2 * D + H, bright: 350.5 },
        { time: window.start.getTime() + 2 * D + 2 * H, bright: 420.25 },
      ],
      window,
      D,
    );
    expect(buckets).toHaveLength(7);
    expect(buckets[2].count).toBe(2);
    expect(buckets[2].max_brightness).toBe(420.3);
    expect(buckets[0].count).toBe(0);
    expect(buckets[0].max_brightness).toBeNull();
    // Fire buckets carry no magnitudes.
    expect(buckets[2].max_magnitude).toBeNull();
    expect(buckets[2].avg_magnitude).toBeNull();
  });

  it("places a leap-day quake in the Feb-29 bucket", async () => {
    const now = new Date("2024-03-01T12:00:00Z");
    stubFetch(() =>
      okJson({
        features: [
          {
            id: "leap",
            properties: { mag: 5.0, time: Date.UTC(2024, 1, 29, 6, 0), url: "https://example.invalid/x" },
            geometry: { coordinates: [0, 0, 10] },
          },
        ],
      }),
    );
    const { history } = await getStatsHistory("earthquakes", "7d", now);
    expect(history.values).toHaveLength(7);
    const leap = history.values.find((b) => b.start === "2024-02-29T00:00:00.000Z");
    expect(leap?.count).toBe(1);
    expect(history.values.reduce((n, b) => n + b.count, 0)).toBe(1);
  });
});

describe("getStatsOverview aggregation", () => {
  function stubAll(opts: { eonet?: "ok" | "fail"; firms?: "csv" | "fail"; usgs?: "ok" | "empty" | "fail" }) {
    const base = Date.now();
    return stubFetch((url) => {
      if (url.includes("earthquake.usgs.gov")) {
        if (opts.usgs === "fail") throw new Error("usgs down");
        if (opts.usgs === "empty") return okJson({ features: [] });
        return okJson(usgsFixture(base));
      }
      if (url.includes("eonet.gsfc.nasa.gov")) {
        if (opts.eonet === "fail") throw new Error("eonet down");
        return okJson(eonetFixture(base));
      }
      if (url.includes("firms.modaps.eosdis.nasa.gov")) {
        if (opts.firms === "fail") throw new Error("firms down");
        return Promise.resolve(new Response("must not be called without a key", { status: 500 }));
      }
      throw new Error(`unexpected upstream ${url}`);
    });
  }

  it("derives counts/maxima from real fixture records (keyless FIRMS → unavailable)", async () => {
    const fetchMock = stubAll({});
    const out = await getStatsOverview(new Date());
    expect(out.data_status.status).toBe("live");
    expect(out.data_status.message).toMatch(/wildfires/);
    expect(out.global.earthquakes_24h).toBe(3);
    expect(out.global.max_magnitude_24h).toBe(6.3);
    expect(out.global.active_events).toBe(2);
    expect(out.global.wildfire_count).toBeNull();
    expect(out.global.max_brightness).toBeNull();
    expect(out.sources.earthquakes).toMatchObject({ status: "live", source: USGS_SOURCE });
    expect(out.sources.disasters).toMatchObject({ status: "live", source: EONET_SOURCE });
    expect(out.sources.wildfires.status).toBe("unavailable");
    expect(out.sources.wildfires.source).toBe(FIRMS_SOURCE);
    // Overview uses the bounded 30-day-recency open set (not all-time open).
    const eonetUrl = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes("eonet.gsfc.nasa.gov"));
    expect(new URL(eonetUrl ?? "").searchParams.get("days")).toBe("30");
  });

  it("computes the max-magnitude timestamp from the max record", async () => {
    const base = Date.now();
    stubFetch((url) => {
      if (url.includes("earthquake.usgs.gov")) return okJson(usgsFixture(base));
      if (url.includes("eonet.gsfc.nasa.gov")) return okJson({ events: [] });
      throw new Error(`unexpected upstream ${url}`);
    });
    const out = await getStatsOverview(new Date(base));
    expect(out.global.max_magnitude_time).toBe(new Date(base - 3 * H).toISOString().replace(/\.\d{3}Z$/, "Z"));
  });

  it("marks partial failure honestly (EONET down, rest live)", async () => {
    stubAll({ eonet: "fail" });
    const out = await getStatsOverview(new Date());
    expect(out.data_status.status).toBe("live");
    expect(out.data_status.message).toMatch(/disasters/);
    expect(out.global.earthquakes_24h).toBe(3);
    expect(out.global.active_events).toBeNull();
    expect(out.sources.disasters.status).toBe("unavailable");
    expect(out.sources.earthquakes.status).toBe("live");
  });

  it("answers UNAVAILABLE with null metrics on complete failure", async () => {
    stubAll({ usgs: "fail", eonet: "fail" });
    const out = await getStatsOverview(new Date());
    expect(out.data_status.status).toBe("unavailable");
    expect(out.global.earthquakes_24h).toBeNull();
    expect(out.global.active_events).toBeNull();
    expect(out.global.wildfire_count).toBeNull();
  });

  it("flags EONET cap truncation as a lower bound (never a silent exact count)", async () => {
    stubFetch((url) => {
      if (url.includes("earthquake.usgs.gov")) return okJson({ features: [] });
      if (url.includes("eonet.gsfc.nasa.gov")) {
        return okJson({
          events: Array.from({ length: EONET_STATS_LIMIT }, (_, i) => ({
            id: `cap-${i}`,
            categories: [{ id: "wildfires", title: "Wildfires" }],
            geometry: [{ date: new Date(NOW.getTime() - H).toISOString(), type: "Point", coordinates: [i % 180, 10] }],
          })),
        });
      }
      throw new Error(`unexpected upstream ${url}`);
    });
    const out = await getStatsOverview(new Date());
    expect(out.global.active_events).toBe(EONET_STATS_LIMIT);
    expect(out.sources.disasters.status).toBe("live");
    expect(out.sources.disasters.message).toMatch(/lower bound/);
  });

  it("treats a 204 USGS window as a genuine zero (not a failure)", async () => {
    stubFetch((url) => {
      if (url.includes("earthquake.usgs.gov")) return Promise.resolve(new Response(null, { status: 204 }));
      if (url.includes("eonet.gsfc.nasa.gov")) return okJson({ events: [] });
      throw new Error(`unexpected upstream ${url}`);
    });
    const out = await getStatsOverview(new Date());
    expect(out.sources.earthquakes.status).toBe("live");
    expect(out.global.earthquakes_24h).toBe(0);
    expect(out.global.max_magnitude_24h).toBeNull();
    expect(out.global.max_magnitude_time).toBeNull();
  });
});

describe("getStatsHistory source rules", () => {
  it("rejects archiveless metrics without any fetch", async () => {
    const fetchMock = stubFetch(async () => {
      throw new Error("must not be called");
    });
    for (const metric of ["temperature", "air_quality"] as const) {
      await expect(getStatsHistory(metric, "7d", NOW)).rejects.toMatchObject({
        name: "StatsUnavailableError",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects 30-day wildfire history (FIRMS day-range support ends at 10)", async () => {
    const fetchMock = stubFetch(async () => {
      throw new Error("must not be called");
    });
    await expect(getStatsHistory("wildfires", "30d", NOW)).rejects.toMatchObject({
      name: "StatsUnavailableError",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces keyless FIRMS history as a distinct key error (route maps to UNAVAILABLE)", async () => {
    const fetchMock = stubFetch(async () => {
      throw new Error("must not be called");
    });
    await expect(getStatsHistory("wildfires", "7d", NOW)).rejects.toBeInstanceOf(
      FirmsKeyMissingError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
