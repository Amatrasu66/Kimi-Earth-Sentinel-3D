/**
 * Phase 6 scene-search route tests: validation, cache semantics, honest
 * failure labels. Deterministic and offline-safe — the CDSE upstream is
 * stubbed per test (any unstubbed URL throws), cache keys use unique bboxes
 * plus per-test cache clears so no test can pollute another.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getCache } from "@/server/cache";
import { CDSE_SOURCE, SENTINEL_ATTRIBUTION } from "@/server/providers/cdse-catalogue";
import { GET as scenesGET } from "@/app/api/v1/scenes/route";

function okJson(payload: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(payload), { status }));
}

function stubFetch(handler: (url: string) => Promise<Response>) {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function scenesUrl(raw: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/scenes?${raw}`);
}

/** bbox unique per test case (cache isolation). */
const BBOX = "139.0,35.0,140.0,36.0";

const CDSE_PAGE = {
  value: [
    {
      Id: "scene-1",
      Name: "S2C_MSIL2A_20261015T011651_N0513_R031_T54SWE_20261015T041011.SAFE",
      ContentDate: { Start: "2026-10-15T01:16:51.024Z" },
      Online: true,
      PublicationDate: "2026-10-15T03:41:11.220Z",
      GeoFootprint: {
        type: "Polygon",
        coordinates: [[[139.9, 35.0], [141.2, 35.0], [141.2, 36.1], [139.9, 36.1], [139.9, 35.0]]],
      },
    },
  ],
};

interface ScenesBody {
  success: boolean;
  data: {
    query: { bbox: string; start: string; end: string; collection: string; limit: number };
    scenes: Array<{ id: string; name: string; collection: string; content_date: string }>;
    count: number;
    attribution: string;
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

describe("scene-search validation", () => {
  it("rejects a missing bbox", async () => {
    const res = await scenesGET(scenesUrl(""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_PARAMS");
  });

  it("rejects a malformed bbox and an inverted bbox", async () => {
    expect((await scenesGET(scenesUrl("bbox=139,35,140"))).status).toBe(400);
    expect((await scenesGET(scenesUrl("bbox=140,35,139,36"))).status).toBe(400);
  });

  it("rejects non-ISO dates and an inverted window", async () => {
    expect((await scenesGET(scenesUrl(`bbox=${BBOX}&start=banana`))).status).toBe(400);
    const later = new Date(Date.now() + 86_400_000).toISOString();
    const earlier = new Date(Date.now() - 86_400_000).toISOString();
    expect(
      (await scenesGET(scenesUrl(`bbox=${BBOX}&start=${later}&end=${earlier}`))).status,
    ).toBe(400);
  });

  it("rejects windows beyond 45 days", async () => {
    const res = await scenesGET(scenesUrl(`bbox=${BBOX}&start=2020-01-01&end=2020-06-30`));
    expect(res.status).toBe(400);
  });

  it("rejects unknown collections", async () => {
    expect((await scenesGET(scenesUrl(`bbox=${BBOX}&collection=sentinel-3-olci`))).status).toBe(400);
  });
});

describe("scene-search live + cache", () => {
  it("returns normalized LIVE scenes with the Copernicus attribution", async () => {
    stubFetch(() => okJson(CDSE_PAGE));
    const res = await scenesGET(scenesUrl(`bbox=${BBOX}&collection=sentinel-2-l2a`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ScenesBody;
    expect(body.success).toBe(true);
    expect(body.data.data_status.status).toBe("live");
    expect(body.data.data_status.source).toBe(CDSE_SOURCE);
    expect(body.data.count).toBe(1);
    expect(body.data.scenes[0].id).toBe("scene-1");
    expect(body.data.scenes[0].collection).toBe("sentinel-2-l2a");
    expect(body.data.attribution).toBe(SENTINEL_ATTRIBUTION);
    expect(body.data.query.bbox).toBe(BBOX);
    expect(body.data.query.collection).toBe("sentinel-2-l2a");
    expect(body.data.query.limit).toBe(20);
    // Defaults: end ≈ now, start = end − 14 days (span within 45).
    const spanDays =
      (Date.parse(body.data.query.end) - Date.parse(body.data.query.start)) / 86_400_000;
    expect(spanDays).toBeGreaterThan(13.9);
    expect(spanDays).toBeLessThanOrEqual(14.1);
    expect(body.meta.cache_hit).toBe(false);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=900");
  });

  it("serves repeats from the per-instance cache with a cache hit", async () => {
    const fetchMock = stubFetch(() => okJson(CDSE_PAGE));
    const first = await scenesGET(scenesUrl(`bbox=${BBOX}&start=2026-10-01&end=2026-10-10`));
    const second = await scenesGET(scenesUrl(`bbox=${BBOX}&start=2026-10-01&end=2026-10-10`));
    expect(((await first.json()) as ScenesBody).meta.cache_hit).toBe(false);
    const secondBody = (await second.json()) as ScenesBody;
    expect(secondBody.meta.cache_hit).toBe(true);
    expect(secondBody.data.count).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes equivalent bbox spellings to the same cache entry", async () => {
    const fetchMock = stubFetch(() => okJson(CDSE_PAGE));
    await scenesGET(scenesUrl(`bbox=${BBOX}&start=2026-10-02&end=2026-10-09`));
    await scenesGET(scenesUrl(`bbox=${BBOX.trim()}&start=2026-10-02&end=2026-10-09`));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("scene-search failure honesty", () => {
  it("serves an expired LIVE entry as STALE when the provider fails", async () => {
    const key = `scenes:v1:collection=sentinel-2-l2a:bbox=${BBOX}:start=2026-10-03T00:00:00.000Z:end=2026-10-04T00:00:00.000Z:limit=20`;
    const cache = getCache();
    // Seed an expired LIVE entry: TTL 0 means get() misses immediately
    // while getStale() still serves it (MemoryCache contract).
    cache.set(
      key,
      [
        {
          query: { bbox: BBOX, start: "2026-10-03T00:00:00.000Z", end: "2026-10-04T00:00:00.000Z", collection: "sentinel-2-l2a", limit: 20 },
          scenes: [],
          count: 0,
          attribution: SENTINEL_ATTRIBUTION,
          data_status: { status: "live", source: CDSE_SOURCE, fetched_at: "2026-10-01T00:00:00Z", message: null },
        },
        "2026-10-01T00:00:00Z",
      ],
      0,
    );
    stubFetch(() => Promise.reject(new Error("catalogue down")));
    const res = await scenesGET(scenesUrl(`bbox=${BBOX}&start=2026-10-03&end=2026-10-04&collection=sentinel-2-l2a`));
    const body = (await res.json()) as ScenesBody;
    expect(body.data.data_status.status).toBe("stale");
    expect(body.meta.stale).toBe(true);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns an empty UNAVAILABLE payload (never fabricated scenes) with no cache", async () => {
    stubFetch(() => Promise.reject(new Error("catalogue down")));
    const res = await scenesGET(scenesUrl(`bbox=${BBOX}&start=2026-10-05&end=2026-10-06`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ScenesBody;
    expect(body.data.data_status.status).toBe("unavailable");
    expect(body.data.scenes).toEqual([]);
    expect(body.data.count).toBe(0);
    expect(body.data.data_status.message).toContain("could not be reached");
    expect(body.meta.cache_hit).toBe(false);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
