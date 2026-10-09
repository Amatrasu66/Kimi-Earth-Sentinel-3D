/**
 * T2.5 global air quality: Open-Meteo model worldwide, AirNow optionally
 * for U.S. coverage. Deterministic and offline-safe — upstream fetches are
 * stubbed per test (routed by URL host), so nothing can reach the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getCache } from "@/server/cache";
import { classifyRoute } from "@/server/rate-limit";
import { generateWeatherGrid } from "@/server/providers/fallback";
import {
  getAirQualityData,
  isUsCoverage,
  normalizeAirnow,
} from "@/server/providers/airnow";
import { getOpenMeteoAirQuality } from "@/server/providers/open-meteo-aq";
import { GET as layerDataGET } from "@/app/api/v1/layers/[layerId]/data/route";

const AQ = { params: Promise.resolve({ layerId: "air_quality" }) };
const ASIA_BBOX = "100,0,120,20";
const US_BBOX = "-125,25,-66,49";

function aqUrl(bbox: string | null, limit: number): NextRequest {
  const q = bbox ? `bbox=${encodeURIComponent(bbox)}&limit=${limit}` : `limit=${limit}`;
  return new NextRequest(`http://localhost:3000/api/v1/layers/air_quality/data?${q}`);
}

function pointCount(url: string): number {
  const lat = new URL(url).searchParams.get("latitude") ?? "";
  return lat === "" ? 0 : lat.split(",").length;
}

function aqBatch(n: number, aqi: number | null = 42, extra: Record<string, unknown> = {}) {
  return Array.from({ length: n }, () => ({
    latitude: 0,
    longitude: 0,
    current: {
      time: "2026-10-09T00:00:00Z",
      ...(aqi === null ? {} : { us_aqi: aqi }),
      pm2_5: 10.5,
      pm10: 20.1,
      ozone: 88.0,
      nitrogen_dioxide: 12.3,
      ...extra,
    },
  }));
}

const AIRNOW_ITEMS = [
  { Latitude: 39.0, Longitude: -98.5, AQI: 88, ReportingArea: "Test County", ParameterName: "O3" },
];

/** Route fetch by host: AirNow vs Open-Meteo AQ behaviors set per test. */
function stubUpstreams(airnow: () => Promise<Response>, aq: (url: string) => Promise<Response>) {
  const mock = vi.fn(async (url: string) => {
    if (url.includes("airnowapi")) return airnow();
    if (url.includes("air-quality-api")) return aq(url);
    throw new Error(`unexpected upstream ${url}`);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function okJson(payload: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
}

function liveBody(body: unknown) {
  return body as {
    data_status: { status: string; source: string | null; message: string | null };
    points: Record<string, unknown>[];
    warnings?: string[];
  };
}

beforeEach(() => {
  getCache().clear();
  vi.stubEnv("AIRNOW_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  getCache().clear();
});

describe("isUsCoverage", () => {
  it("accepts only bboxes fully inside the U.S. envelope", () => {
    expect(isUsCoverage(null)).toBe(false);
    expect(isUsCoverage("")).toBe(false);
    expect(isUsCoverage(US_BBOX)).toBe(true);
    expect(isUsCoverage(ASIA_BBOX)).toBe(false);
    expect(isUsCoverage("-125,25,-50,49")).toBe(false); // straddles the Atlantic edge
    expect(isUsCoverage("garbage")).toBe(false);
  });
});

describe("provider selection", () => {
  it("serves non-U.S. coverage from Open-Meteo without a key", async () => {
    stubUpstreams(
      async () => {
        throw new Error("AirNow must not be called");
      },
      async (url) => okJson(aqBatch(pointCount(url))),
    );
    const out = liveBody(await getAirQualityData(ASIA_BBOX, 50));
    expect(out.data_status.status).toBe("live");
    expect(out.data_status.source).toBe("Open-Meteo Air Quality");
    expect(out.data_status.message).toMatch(/model/i);
    expect(out.data_status.message).toMatch(/not monitoring-station observations/i);
  });

  it("serves the global grid from Open-Meteo with no bbox and no key", async () => {
    stubUpstreams(
      async () => {
        throw new Error("AirNow must not be called");
      },
      async (url) => okJson(aqBatch(pointCount(url))),
    );
    const out = liveBody(await getAirQualityData(null, 500));
    expect(out.data_status.status).toBe("live");
    expect(out.points).toHaveLength(108);
  });

  it("uses AirNow station observations for suitable U.S. requests with a key", async () => {
    vi.stubEnv("AIRNOW_API_KEY", "T25-TEST-KEY");
    stubUpstreams(
      async () => okJson(AIRNOW_ITEMS),
      async () => {
        throw new Error("model must not be called");
      },
    );
    const out = liveBody(await getAirQualityData(US_BBOX, 50));
    expect(out.data_status.status).toBe("live");
    expect(out.data_status.source).toBe("AirNow");
    expect(out.data_status.message).toMatch(/station observations/i);
    expect(out.points[0]).toMatchObject({ lat: 39.0, lon: -98.5, value: 88 });
  });

  it("falls back to Open-Meteo when AirNow fails", async () => {
    vi.stubEnv("AIRNOW_API_KEY", "T25-TEST-KEY");
    stubUpstreams(
      async () => {
        throw new Error("AirNow down");
      },
      async (url) => okJson(aqBatch(pointCount(url))),
    );
    const out = liveBody(await getAirQualityData(US_BBOX, 50));
    expect(out.data_status.status).toBe("live");
    expect(out.data_status.source).toBe("Open-Meteo Air Quality");
  });

  it("returns simulated (never live) when Open-Meteo fails keyless", async () => {
    stubUpstreams(
      async () => {
        throw new Error("AirNow must not be called");
      },
      async () => {
        throw new Error("model down");
      },
    );
    const out = liveBody(await getAirQualityData(ASIA_BBOX, 50));
    expect(out.data_status.status).toBe("simulated");
  });

  it("returns simulated (never live) when both providers fail", async () => {
    vi.stubEnv("AIRNOW_API_KEY", "T25-TEST-KEY");
    stubUpstreams(
      async () => {
        throw new Error("AirNow down");
      },
      async () => {
        throw new Error("model down");
      },
    );
    const out = liveBody(await getAirQualityData(US_BBOX, 50));
    expect(out.data_status.status).toBe("simulated");
  });
});

describe("Open-Meteo AQ normalization", () => {
  it("maps AQI + pollutants into the existing layer contract", async () => {
    stubUpstreams(
      async () => {
        throw new Error("nope");
      },
      async (url) => okJson(aqBatch(pointCount(url))),
    );
    const out = liveBody(await getOpenMeteoAirQuality(null, 3));
    expect(out.points).toHaveLength(3);
    expect(out.points[0]).toMatchObject({
      value: 42,
      severity: "low",
      parameter: "AQI",
      pollutants: { pm2_5: 10.5, pm10: 20.1, ozone: 88, nitrogen_dioxide: 12.3 },
    });
  });

  it("keeps missing optional pollutants as null without dropping the point", async () => {
    stubUpstreams(
      async () => {
        throw new Error("nope");
      },
      async (url) => okJson(aqBatch(pointCount(url), 60, { ozone: undefined })),
    );
    const out = liveBody(await getOpenMeteoAirQuality(null, 3));
    expect(out.data_status.status).toBe("live");
    const pollutants = out.points[0].pollutants as Record<string, unknown>;
    expect(pollutants.ozone).toBeNull();
    expect(pollutants.pm2_5).toBe(10.5);
  });

  it("skips valueless points instead of inventing zeros", async () => {
    let calls = 0;
    stubUpstreams(
      async () => {
        throw new Error("nope");
      },
      async (url) => {
        calls += 1;
        // First batch valueless, second live → partial live, no zero AQI.
        if (calls === 1) {
          return okJson(
            Array.from({ length: pointCount(url) }, () => ({
              current: { time: "2026-10-09T00:00:00Z" },
            })),
          );
        }
        return okJson(aqBatch(pointCount(url)));
      },
    );
    const out = liveBody(await getOpenMeteoAirQuality(null, 100));
    expect(out.data_status.status).toBe("live");
    expect(out.points).toHaveLength(50);
    expect(out.points.every((p) => (p.value as number) > 0)).toBe(true);
    expect(out.data_status.message).toContain("50 of 100 grid points");
  });

  it("preserves multi-coordinate order against the request grid", async () => {
    stubUpstreams(
      async () => {
        throw new Error("nope");
      },
      async (url) => okJson(aqBatch(pointCount(url))),
    );
    const out = liveBody(await getOpenMeteoAirQuality(null, 3));
    const grid = generateWeatherGrid(null).slice(0, 3);
    expect(out.points.map((p) => p.id)).toEqual(
      grid.map((g) => `aqi-${g.lat}-${g.lon}`),
    );
  });

  it("enforces the point cap and 50-point batches", async () => {
    const seen: number[] = [];
    stubUpstreams(
      async () => {
        throw new Error("nope");
      },
      async (url) => {
        seen.push(pointCount(url));
        return okJson(aqBatch(pointCount(url)));
      },
    );
    const out = liveBody(await getOpenMeteoAirQuality(null, 500));
    expect(out.points).toHaveLength(108);
    expect(seen).toEqual([50, 50, 8]);
  });

  it("bounds concurrency like the weather pool", async () => {
    let active = 0;
    let maxActive = 0;
    stubUpstreams(
      async () => {
        throw new Error("nope");
      },
      async (url) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        const body = aqBatch(pointCount(url));
        active -= 1;
        return okJson(body);
      },
    );
    await getOpenMeteoAirQuality(null, 500);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});

describe("AirNow record hygiene", () => {
  it("skips records without coordinates or AQI instead of inventing them", () => {
    const out = normalizeAirnow(
      [
        { Latitude: 39, Longitude: -98.5, AQI: 88 },
        { Latitude: 39, Longitude: -98.5 },
        { AQI: 88 },
      ],
      10,
    ) as { points: unknown[] };
    expect(out.points).toHaveLength(1);
  });
});

describe("route behavior", () => {
  it("accepts non-U.S. bboxes (T2.5) with live model data + public cache", async () => {
    stubUpstreams(
      async () => {
        throw new Error("AirNow must not be called");
      },
      async (url) => okJson(aqBatch(pointCount(url))),
    );
    const res = await layerDataGET(aqUrl(ASIA_BBOX, 50), AQ);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=1800, stale-while-revalidate=3600",
    );
    const body = (await res.json()) as {
      data: { data_status: { status: string; source: string } };
      meta: { cache_hit: boolean };
    };
    expect(body.data.data_status.status).toBe("live");
    expect(body.data.data_status.source).toBe("Open-Meteo Air Quality");
    expect(body.meta.cache_hit).toBe(false);
  });

  it("keeps simulated fallback no-store with stable provenance", async () => {
    stubUpstreams(
      async () => {
        throw new Error("down");
      },
      async () => {
        throw new Error("down");
      },
    );
    const res = await layerDataGET(aqUrl(null, 21), AQ);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as {
      data: { data_status: { status: string } };
    };
    expect(body.data.data_status.status).toBe("simulated");
  });

  it("rejects invalid bboxes with 400 before provider calls", async () => {
    const mock = stubUpstreams(
      async () => okJson([]),
      async () => okJson([]),
    );
    const res = await layerDataGET(aqUrl("10,,30,40", 5), AQ);
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(mock).not.toHaveBeenCalled();
  });

  it("times out through the shared helper into simulated no-store", async () => {
    vi.stubEnv("REQUEST_TIMEOUT", "1");
    stubUpstreams(
      async () => {
        throw new Error("nope");
      },
      async () => new Promise<Response>(() => {}),
    );
    const res = await layerDataGET(aqUrl(null, 22), AQ);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as {
      data: { data_status: { status: string } };
    };
    expect(body.data.data_status.status).toBe("simulated");
  }, 20000);

  it("leaves the air-quality route in the heavy rate-limit class", () => {
    expect(classifyRoute("/api/v1/layers/air_quality/data")).toBe("heavy");
  });

  it("never logs AirNow key material", async () => {
    vi.stubEnv("AIRNOW_API_KEY", "T25SECRETKEY");
    stubUpstreams(
      async () => {
        throw new Error("boom for API_KEY=T25SECRETKEY diagnostics");
      },
      async (url) => okJson(aqBatch(pointCount(url))),
    );
    const warned: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warned.push(args.map(String).join(" "));
    });
    try {
      // U.S. bbox forces the AirNow attempt, which fails into the model.
      const out = liveBody(await getAirQualityData(US_BBOX, 50));
      expect(out.data_status.status).toBe("live");
    } finally {
      spy.mockRestore();
    }
    expect(warned.join("\n")).not.toContain("T25SECRETKEY");
  });
});
