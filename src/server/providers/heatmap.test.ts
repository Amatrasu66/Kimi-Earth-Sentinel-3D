/**
 * T2.8 real-heatmap tests. Deterministic and offline-safe — upstreams are
 * stubbed per test (any unstubbed URL throws), so nothing reaches the
 * network. No seeded or synthetic values anywhere in these assertions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { getCache } from "@/server/cache";
import { getAllLayers } from "@/server/models/layers";
import {
  MAX_HEATMAP_POINTS,
  REAL_MAX_RESOLUTION,
  colForLon,
  decodeGrid,
  effectiveResolution,
  encodeGrid,
  getHeatmap,
  heatmapGridPoints,
  heatmapSourceFor,
  rowForLat,
} from "@/server/providers/heatmap";

const D = 24 * 3600 * 1000;

function stubFetch(handler: (url: string) => Promise<Response>) {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function okJson(payload: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(payload), { status }));
}

/** Multi-location Open-Meteo response: one {current} per requested point, in order. */
function omList(n: number, field: string, value: (i: number) => number) {
  return Array.from({ length: n }, (_, i) => ({
    current: { time: "2026-10-11T00:00:00Z", [field]: value(i) },
  }));
}

beforeEach(() => {
  getCache().clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  getCache().clear();
});

describe("heatmap decision matrix (executable, §4 table)", () => {
  it("covers every catalogue layer with a real source family", () => {
    const families = new Map(getAllLayers().map((l) => [l.id, heatmapSourceFor(l.id)]));
    expect(families.get("temperature")).toBe("model");
    expect(families.get("precipitation")).toBe("model");
    expect(families.get("clouds")).toBe("model");
    expect(families.get("wind")).toBe("model");
    expect(families.get("air_quality")).toBe("model");
    expect(families.get("earthquakes")).toBe("events");
    expect(families.get("disasters")).toBe("events");
    expect(families.get("wildfires")).toBe("events");
    expect([...families.values()].every((f) => f !== null)).toBe(true);
    expect(heatmapSourceFor("nope")).toBeNull();
  });
});

describe("grid geometry and encoding (contract)", () => {
  it("builds row-major equirectangular centers (R=20 → 200 cells)", () => {
    const pts = heatmapGridPoints(20);
    expect(pts).toHaveLength(200);
    expect(pts).toHaveLength(MAX_HEATMAP_POINTS);
    // First center: lon -171, lat 81. Last: lon 171, lat -81.
    expect(pts[0].lon).toBeCloseTo(-171, 10);
    expect(pts[0].lat).toBeCloseTo(81, 10);
    expect(pts[199].lon).toBeCloseTo(171, 10);
    expect(pts[199].lat).toBeCloseTo(-81, 10);
  });

  it("round-trips centers through row/col indexing", () => {
    const pts = heatmapGridPoints(8);
    pts.forEach((p, i) => {
      const r = Math.floor(i / 8);
      const c = i % 8;
      expect(rowForLat(p.lat, 4)).toBe(r);
      expect(colForLon(p.lon, 8)).toBe(c);
    });
  });

  it("round-trips values including NaN through base64 LE float32", () => {
    const values = [21.5, Number.NaN, -3.25, 0];
    const decoded = decodeGrid(encodeGrid(values));
    expect(decoded[0]).toBeCloseTo(21.5, 5);
    expect(decoded[1]).toBeNaN();
    expect(decoded[2]).toBeCloseTo(-3.25, 5);
    expect(decoded[3]).toBe(0);
    expect(decodeGrid("")).toEqual([]);
  });

  it("clamps resolutions before any allocation or provider call", () => {
    expect(effectiveResolution(512)).toBe(REAL_MAX_RESOLUTION);
    expect(effectiveResolution(128)).toBe(REAL_MAX_RESOLUTION);
    expect(effectiveResolution(20)).toBe(20);
    expect(effectiveResolution(8)).toBe(8);
    expect(effectiveResolution(0)).toBe(1);
    expect(heatmapGridPoints(effectiveResolution(512))).toHaveLength(MAX_HEATMAP_POINTS);
  });
});

describe("model heatmaps (correct source + variable)", () => {
  const CASES = [
    { layer: "temperature", variable: "temperature_2m", unit: "celsius", host: "api.open-meteo.com", value: 21.5 },
    { layer: "precipitation", variable: "precipitation", unit: "mm", host: "api.open-meteo.com", value: 3.2 },
    { layer: "clouds", variable: "cloud_cover", unit: "percent", host: "api.open-meteo.com", value: 93 },
    { layer: "wind", variable: "wind_speed_10m", unit: "km/h", host: "api.open-meteo.com", value: 12.4 },
    { layer: "air_quality", variable: "us_aqi", unit: "AQI", host: "air-quality-api.open-meteo.com", value: 42 },
  ] as const;

  for (const { layer, variable, unit, host, value } of CASES) {
    it(`${layer} requests canonical ${variable} and maps cells to values`, async () => {
      const fetchMock = stubFetch((url) => {
        if (!url.includes(host)) throw new Error(`unexpected upstream ${url}`);
        const params = new URL(url).searchParams;
        expect(params.get("current")).toBe(variable);
        const n = (params.get("latitude") ?? "").split(",").length;
        return okJson(omList(n, variable, () => value));
      });
      const out = await getHeatmap(layer, 8, "24h", new Date("2026-10-11T00:00:00Z"));
      expect(out.data_status.status).toBe("live");
      expect(out.unit).toBe(unit);
      expect(out.resolution).toBe(8);
      const grid = decodeGrid(out.grid as string);
      expect(grid).toHaveLength(32);
      // Float32 round-trip: exact for integers, approximate otherwise.
      expect(grid.every((v) => Math.abs(v - value) < 1e-5)).toBe(true);
      expect(out.min_value as number).toBeCloseTo(value, 5);
      expect(out.max_value as number).toBeCloseTo(value, 5);
      expect(fetchMock).toHaveBeenCalledOnce(); // 32 cells = 1 batch
    });
  }

  it("keeps valid cells on partial failure (NaN gaps + warnings, still LIVE)", async () => {
    let calls = 0;
    stubFetch((url) => {
      if (!url.includes("api.open-meteo.com")) throw new Error(`unexpected upstream ${url}`);
      calls += 1;
      if (calls === 1) {
        const n = (new URL(url).searchParams.get("latitude") ?? "").split(",").length;
        return okJson(omList(n, "temperature_2m", (i) => 10 + i));
      }
      throw new Error("batch two down");
    });
    // R=12 → 72 cells → 2 batches; the second fails.
    const out = await getHeatmap("temperature", 12, "24h", new Date("2026-10-11T00:00:00Z"));
    expect(out.data_status.status).toBe("live");
    const grid = decodeGrid(out.grid as string);
    expect(grid).toHaveLength(72);
    expect(grid.slice(0, 50).every((v) => Number.isFinite(v))).toBe(true);
    expect(grid.slice(50).every((v) => Number.isNaN(v))).toBe(true);
    expect(out.warnings).toEqual(["22 of 72 cells could not be fetched (NaN)."]);
    expect(out.data_status.message).toMatch(/Partial coverage: 22 of 72 cells missing/);
  });

  it("answers UNAVAILABLE (never zeros) when no cell has a value", async () => {
    stubFetch(() => okJson(omList(32, "temperature_2m", () => Number.NaN).map(() => ({ current: { time: "x" } }))));
    const out = await getHeatmap("temperature", 8, "24h");
    expect(out.data_status.status).toBe("unavailable");
    expect(out.grid).toBe("");
    expect(out.data_status.source).toBe("Open-Meteo");
  });

  it("serves oversized requests at the documented lower resolution", async () => {
    const fetchMock = stubFetch((url) => {
      if (!url.includes("api.open-meteo.com")) throw new Error(`unexpected upstream ${url}`);
      const n = (new URL(url).searchParams.get("latitude") ?? "").split(",").length;
      return okJson(omList(n, "temperature_2m", () => 20));
    });
    const out = await getHeatmap("temperature", 128, "24h", new Date("2026-10-11T00:00:00Z"));
    expect(out.resolution).toBe(REAL_MAX_RESOLUTION);
    expect(decodeGrid(out.grid as string)).toHaveLength(MAX_HEATMAP_POINTS);
    expect(out.data_status.message).toMatch(/lower resolution|exceeds the real-data maximum/);
    // Bounded fan-out: 200 points in 4 batches of 50, never a 128² allocation.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const totalRequested = fetchMock.mock.calls
      .map((c) => (String(c[0]).split("latitude=")[1].split("&")[0].split("%2C").length))
      .reduce((a, b) => a + b, 0);
    expect(totalRequested).toBe(MAX_HEATMAP_POINTS);
  });
});

describe("event-density heatmaps (honest counts)", () => {
  it("bins USGS events per cell over the time_range window", async () => {
    const now = new Date("2026-10-11T00:00:00Z");
    stubFetch((url) => {
      if (!url.includes("earthquake.usgs.gov")) throw new Error(`unexpected upstream ${url}`);
      const params = new URL(url).searchParams;
      const span = Date.parse(params.get("endtime") ?? "") - Date.parse(params.get("starttime") ?? "");
      expect(span).toBe(7 * D); // time_range=7d selects the window
      return okJson({
        features: [
          { id: "a", properties: { mag: 5.0, time: now.getTime() - D, url: "https://example.invalid/a" }, geometry: { coordinates: [0, 10, 5] } },
          { id: "b", properties: { mag: 6.0, time: now.getTime() - D, url: "https://example.invalid/b" }, geometry: { coordinates: [1, 11, 5] } },
          { id: "c", properties: { mag: null, time: now.getTime() - D }, geometry: { coordinates: [0, 0, 5] } },
        ],
      });
    });
    const out = await getHeatmap("earthquakes", 8, "7d", now);
    expect(out.data_status.status).toBe("live");
    expect(out.unit).toBe("count");
    const grid = decodeGrid(out.grid as string);
    expect(grid.reduce((n, v) => n + v, 0)).toBe(2);
    expect(out.max_value).toBe(2); // both events share one 45°×45° cell
    expect(out.min_value).toBe(0); // observed zeros inside a covered window
  });

  it("bins EONET events per cell (real v3 geometry, counted once)", async () => {
    const now = new Date("2026-10-11T00:00:00Z");
    stubFetch((url) => {
      if (!url.includes("eonet.gsfc.nasa.gov")) throw new Error(`unexpected upstream ${url}`);
      const params = new URL(url).searchParams;
      expect(params.get("status")).toBe("all");
      return okJson({
        events: [
          {
            id: "e1", title: "Storm",
            categories: [{ id: "severeStorms", title: "Severe Storms" }, { id: "floods", title: "Floods" }],
            geometry: [{ date: new Date(now.getTime() - D).toISOString(), type: "Point", coordinates: [0, 10] }],
          },
        ],
      });
    });
    const out = await getHeatmap("disasters", 8, "7d", now);
    expect(out.unit).toBe("count");
    expect(decodeGrid(out.grid as string).reduce((n, v) => n + v, 0)).toBe(1);
  });

  it("bins keyed FIRMS detections per cell; 48h selects dayRange 2", async () => {
    vi.stubEnv("NASA_FIRMS_API_KEY", "t28-key");
    const now = new Date("2026-10-11T00:00:00Z");
    const fetchMock = stubFetch((url) => {
      if (!url.includes("firms.modaps.eosdis.nasa.gov")) throw new Error(`unexpected upstream ${url}`);
      expect(url).toContain("/WORLD/2");
      return Promise.resolve(
        new Response(
          [
            "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type",
            "10,10,400,1,1,2026-10-10,1200,N,VN,n,2.0,300,5,D,0",
            "10.5,10.5,380,1,1,2026-10-10,1300,N,VN,n,2.0,300,5,D,0",
          ].join("\n"),
          { status: 200 },
        ),
      );
    });
    try {
      const out = await getHeatmap("wildfires", 8, "48h", now);
      expect(out.data_status.status).toBe("live");
      expect(decodeGrid(out.grid as string).reduce((n, v) => n + v, 0)).toBe(2);
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("marks wildfire 30d and keyless FIRMS UNAVAILABLE (never zero grids)", async () => {
    vi.stubEnv("NASA_FIRMS_API_KEY", "t28-key");
    const fetchMock = stubFetch(async () => {
      throw new Error("WORLD/30 must never be requested");
    });
    try {
      const out = await getHeatmap("wildfires", 8, "30d");
      expect(out.data_status.status).toBe("unavailable");
      expect(out.grid).toBe("");
      expect(out.data_status.message).toMatch(/10 days/);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
    const noKeyFetch = stubFetch(async () => {
      throw new Error("FIRMS must not be called keyless");
    });
    const out = await getHeatmap("wildfires", 8, "7d");
    expect(out.data_status.status).toBe("unavailable");
    expect(out.grid).toBe("");
    expect(out.data_status.message).toMatch(/API key/);
    expect(noKeyFetch).not.toHaveBeenCalled();
  });
});

describe("heatmap payload budget (250 KB gzip)", () => {
  it("keeps the worst supported response two orders of magnitude inside budget", async () => {
    stubFetch((url) => {
      if (!url.includes("api.open-meteo.com")) throw new Error(`unexpected upstream ${url}`);
      const n = (new URL(url).searchParams.get("latitude") ?? "").split(",").length;
      return okJson(omList(n, "temperature_2m", (i) => -40 + (i % 89)));
    });
    const out = await getHeatmap("temperature", REAL_MAX_RESOLUTION, "24h");
    const raw = Buffer.from(JSON.stringify(out), "utf8");
    const gzipped = gzipSync(raw);
    // Measured 2026-10-11 (independent script): raw 1203 B, gzip 558 B.
    // Bounds below carry headroom for message/warning growth while failing
    // loudly long before the 250 KB budget is threatened.
    expect(raw.length).toBeLessThan(16 * 1024);
    expect(gzipped.length).toBeLessThan(250 * 1024);
  });
});
