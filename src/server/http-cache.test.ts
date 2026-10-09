/**
 * T2.1 HTTP caching policies. Deterministic and offline-safe: provider
 * fetches are stubbed (canned LIVE fixtures or forced failures), so no
 * test can touch the network — any stray fetch throws and fails the test.
 *
 * Policy under test:
 * - LIVE layer data / event detail → public, s-maxage=<TTL>, SWR=<2×TTL>
 *   (TTLs mirror the in-memory cache: per-layer, 300 event detail).
 * - Static catalogues (layers, GIBS capabilities) → public 3600 / 7200.
 * - API index (static version + links) → public 60 / 120.
 * - Health (instance metadata), STALE / SIMULATED fallbacks, simulated
 *   mock endpoints, errors, and 429s → no-store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getCache } from "@/server/cache";
import { middleware } from "@/middleware";
import {
  NO_STORE,
  publicCacheControl,
  STATIC_CATALOG_TTL,
  INDEX_TTL,
} from "@/server/route-helpers";
import { LAYER_TTLS } from "@/server/provenance";
import { EVENT_DETAIL_TTL } from "@/server/services/event-detail";
import {
  layerCacheKey,
  payloadStatus,
} from "@/server/services/layers";
import { withStatus } from "@/server/provenance";
import { GET as indexGET } from "@/app/api/v1/route";
import { GET as layersGET } from "@/app/api/v1/layers/route";
import { GET as layerDataGET } from "@/app/api/v1/layers/[layerId]/data/route";
import { GET as heatmapGET } from "@/app/api/v1/layers/[layerId]/heatmap/route";
import { GET as eventGET } from "@/app/api/v1/events/[eventId]/route";
import { GET as searchGET } from "@/app/api/v1/search/route";
import { GET as statsGET } from "@/app/api/v1/stats/route";
import { GET as rootHealthGET } from "@/app/api/health/route";
import { GET as v1HealthGET } from "@/app/api/v1/health/route";
import { GET as v1RestGET } from "@/app/api/v1/[...rest]/route";
import { GET as capabilitiesGET } from "@/app/api/v1/imagery/gibs/capabilities/route";
import { RATE_LIMITS, resetRuntimeStore } from "@/server/rate-limit";

const QUAKE = { params: Promise.resolve({ layerId: "earthquakes" }) };
const HEAT = { params: Promise.resolve({ layerId: "temperature" }) };

function dataReq(params: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/layers/earthquakes/data?${params}`);
}

function eventParams(eventId: string) {
  return { params: Promise.resolve({ eventId }) };
}

const USGS_LIST_FIXTURE = {
  features: [
    {
      id: "t21quake1",
      properties: {
        mag: 5.5,
        place: "Test Basin",
        time: 1700000000000,
        url: "https://example.invalid/quake",
      },
      geometry: { type: "Point", coordinates: [-122.5, 37.5, 10] },
    },
  ],
};

const USGS_DETAIL_FIXTURE = {
  id: "t21live01",
  properties: {
    mag: 6.1,
    place: "Test Trench",
    time: 1700000000000,
    updated: 1700000100000,
    url: "https://example.invalid/detail",
    tsunami: 0,
  },
  geometry: { type: "Point", coordinates: [-120.0, 35.0, 12] },
};

function liveFetchStub(payload: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
}

function deadFetchStub() {
  return vi.fn(async () => {
    throw new Error("upstream must not be reachable");
  });
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

describe("publicCacheControl helper", () => {
  it("builds the PRD policy with SWR defaulting to 2× TTL", () => {
    expect(publicCacheControl(300)).toBe("public, s-maxage=300, stale-while-revalidate=600");
    expect(publicCacheControl(3600, 7200)).toBe(
      "public, s-maxage=3600, stale-while-revalidate=7200",
    );
    expect(NO_STORE).toBe("no-store");
  });
});

describe("static catalogues + index", () => {
  it("serves layers metadata publicly with the static-catalog TTL", async () => {
    const res = await layersGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      `public, s-maxage=${STATIC_CATALOG_TTL}, stale-while-revalidate=${STATIC_CATALOG_TTL * 2}`,
    );
  });

  it("serves GIBS capabilities publicly with the static-catalog TTL", async () => {
    const res = await capabilitiesGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      `public, s-maxage=${STATIC_CATALOG_TTL}, stale-while-revalidate=${STATIC_CATALOG_TTL * 2}`,
    );
  });

  it("serves the API index publicly with the short index TTL", async () => {
    const res = await indexGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      `public, s-maxage=${INDEX_TTL}, stale-while-revalidate=${INDEX_TTL * 2}`,
    );
  });
});

describe("layer data caching", () => {
  it("serves LIVE data publicly with the per-layer TTL and keeps mem-cache semantics", async () => {
    vi.stubGlobal("fetch", liveFetchStub(USGS_LIST_FIXTURE));
    const first = await layerDataGET(dataReq("limit=11"), QUAKE);
    expect(first.status).toBe(200);
    const ttl = LAYER_TTLS.earthquakes;
    expect(first.headers.get("Cache-Control")).toBe(
      `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`,
    );
    const firstBody = (await first.json()) as {
      success: boolean;
      data: { data_status: { status: string; fetched_at: string } };
      meta: { cache_hit: boolean };
    };
    expect(firstBody.data.data_status.status).toBe("live");
    expect(firstBody.meta.cache_hit).toBe(false);

    // Repeat: in-memory hit keeps fetched_at stable, header unchanged.
    const second = await layerDataGET(dataReq("limit=11"), QUAKE);
    expect(second.headers.get("Cache-Control")).toBe(first.headers.get("Cache-Control"));
    const secondBody = (await second.json()) as typeof firstBody;
    expect(secondBody.meta.cache_hit).toBe(true);
    expect(secondBody.data.data_status.status).toBe("live");
    expect(secondBody.data.data_status.fetched_at).toBe(firstBody.data.data_status.fetched_at);
  });

  it("serves SIMULATED fallback with no-store (never extended via CDN)", async () => {
    vi.stubGlobal("fetch", deadFetchStub());
    const res = await layerDataGET(dataReq("limit=13"), QUAKE);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as {
      data: { data_status: { status: string } };
      meta: { cache_hit: boolean };
    };
    expect(body.data.data_status.status).toBe("simulated");
    expect(body.meta.cache_hit).toBe(false);
  });

  it("serves STALE re-fallback with no-store and preserves the original fetched_at", async () => {
    const cache = getCache();
    const live = withStatus(
      { layer_id: "earthquakes", count: 0, points: [], stats: {} },
      "live",
      "USGS",
      undefined,
      "2026-01-01T00:00:00Z",
    );
    cache.set(layerCacheKey("earthquakes", null, 17, null), [live, "2026-01-01T00:00:00Z"], -1);
    vi.stubGlobal("fetch", deadFetchStub());
    const res = await layerDataGET(dataReq("limit=17"), QUAKE);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as {
      data: { data_status: { status: string; fetched_at: string } };
      meta: { cache_hit: boolean };
    };
    expect(body.data.data_status.status).toBe("stale");
    expect(body.meta.cache_hit).toBe(true);
    expect(body.data.data_status.fetched_at).toBe("2026-01-01T00:00:00Z");
  });

  it("keeps heatmap (always simulated) no-store", async () => {
    const res = await heatmapGET(
      new NextRequest("http://localhost:3000/api/v1/layers/temperature/heatmap"),
      HEAT,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { data: { data_status: { status: string } } };
    expect(payloadStatus(body.data)).toBe("simulated");
  });
});

describe("event detail caching", () => {
  it("serves LIVE detail publicly with the event-detail TTL", async () => {
    vi.stubGlobal("fetch", liveFetchStub(USGS_DETAIL_FIXTURE));
    const res = await eventGET(
      new Request("http://localhost:3000/x"),
      eventParams("t21live01"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      `public, s-maxage=${EVENT_DETAIL_TTL}, stale-while-revalidate=${EVENT_DETAIL_TTL * 2}`,
    );
    const body = (await res.json()) as { data: { data_status: { status: string } } };
    expect(body.data.data_status.status).toBe("live");
  });

  it("serves SIMULATED wildfire detail with no-store", async () => {
    // T2.3: well-formed fire-<lat>-<lon> marker without a configured key
    // stays on the simulated path (no provider call possible).
    const res = await eventGET(new Request("http://localhost:3000/x"), eventParams("fire-34.1--118.2"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { data: { data_status: { status: string } } };
    expect(body.data.data_status.status).toBe("simulated");
  });
});

describe("simulated mock endpoints stay no-store", () => {
  it("search", async () => {
    const res = await searchGET(
      new NextRequest("http://localhost:3000/api/v1/search?q=tokyo"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("stats (nondeterministic mock)", async () => {
    const res = await statsGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("freshness-sensitive and error responses are never public", () => {
  it("health endpoints stay no-store with started_at semantics intact", async () => {
    for (const get of [rootHealthGET, v1HealthGET]) {
      const res = await get();
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      const body = (await res.json()) as { data: Record<string, unknown> };
      expect(body.data.status).toBe("ok");
      expect(typeof body.data.started_at).toBe("string");
      expect("uptime_seconds" in body.data).toBe(false);
    }
  });

  it("invalid input carries no public cache policy", async () => {
    vi.stubGlobal("fetch", deadFetchStub());
    const res = await layerDataGET(dataReq("limit=0"), QUAKE);
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("unknown layer and unknown v1 paths carry no public cache policy", async () => {
    const badLayer = await layerDataGET(
      new NextRequest("http://localhost:3000/api/v1/layers/nope/data?limit=5"),
      { params: Promise.resolve({ layerId: "nope" }) },
    );
    expect(badLayer.status).toBe(404);
    expect(badLayer.headers.get("Cache-Control")).toBe("no-store");
    const rest = await v1RestGET();
    expect(rest.status).toBe(404);
    expect(rest.headers.get("Cache-Control")).toBe("no-store");
  });

  it("429 throttles keep Retry-After and never take the success cache policy", async () => {
    const ip = "203.0.113.77";
    for (let i = 0; i < RATE_LIMITS.heavy; i++) {
      await middleware(
        new NextRequest(`http://localhost:3000/api/v1/search?q=t21flood${i}`, {
          headers: { "x-forwarded-for": ip },
        }),
      );
    }
    const limited = await middleware(
      new NextRequest("http://localhost:3000/api/v1/search?q=t21floodX", {
        headers: { "x-forwarded-for": ip },
      }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Cache-Control")).toBe("no-store");
    expect(limited.headers.get("Retry-After")).not.toBeNull();
    const body = (await limited.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("RATE_LIMITED");
  });
});
