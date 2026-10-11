/**
 * T2.6 search-route tests: live merge, fallback honesty, cache semantics.
 * Deterministic and offline-safe — the geocoding upstream is stubbed per
 * test (any unstubbed URL throws), and cache keys use unique queries plus
 * per-test cache clears so no test can pollute another.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getCache } from "@/server/cache";
import { GEOCODING_SOURCE } from "@/server/providers/geocoding";
import { GET as searchGET } from "@/app/api/v1/search/route";

const BERLIN_ROW = {
  id: 2950159,
  name: "Berlin",
  latitude: 52.52437,
  longitude: 13.41053,
  country_code: "DE",
  country: "Germany",
  admin1: "Berlin",
  timezone: "Europe/Berlin",
  population: 3426354,
};

const PARIS_ROW = {
  id: 2988507,
  name: "Paris",
  latitude: 48.85341,
  longitude: 2.3488,
  country_code: "FR",
  country: "France",
  admin1: "Île-de-France",
  population: 2138551,
};

function okJson(payload: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(payload), { status }));
}

function stubFetch(handler: (url: string) => Promise<Response>) {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function searchUrl(raw: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/search?${raw}`);
}

interface SearchBody {
  success: boolean;
  data: {
    query: string;
    results: Array<{
      id: string;
      type: string;
      name: string;
      lat: number;
      lon: number;
      country?: string;
      source?: string;
    }>;
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

describe("live merged search", () => {
  it("merges provider locations with event-index matches, LIVE with mixed provenance", async () => {
    stubFetch(() => okJson({ results: [BERLIN_ROW, PARIS_ROW] }));
    const res = await searchGET(searchUrl("q=t26fire-merge&type=all&limit=5"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchBody;
    expect(body.success).toBe(true);
    expect(body.data.data_status.status).toBe("live");
    expect(body.data.data_status.source).toContain(GEOCODING_SOURCE);
    expect(body.data.data_status.source).toContain("bundled event index");
    // Locations first in provider order, bundled fire event after.
    expect(body.data.results.map((r) => r.id)).toEqual(["om-geo-2950159", "om-geo-2988507", "fire-001"]);
    expect(body.data.results[0].type).toBe("location");
    expect(body.data.results[0].source).toBe(GEOCODING_SOURCE);
    expect(body.data.results[2].type).toBe("event");
    expect(body.data.results[2].source).toBe("bundled event index");
    expect(body.meta.cache_hit).toBe(false);
    expect(body.meta.data_status).toBe("live");
  });

  it("serves repeats from the per-instance cache with the public LIVE policy", async () => {
    const fetchMock = stubFetch(() => okJson({ results: [BERLIN_ROW] }));
    const first = await searchGET(searchUrl("q=t26cache-hit&type=all"));
    const firstBody = (await first.json()) as SearchBody;
    expect(first.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    const second = await searchGET(searchUrl("q=t26cache-hit&type=all"));
    const secondBody = (await second.json()) as SearchBody;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(secondBody.meta.cache_hit).toBe(true);
    expect(secondBody.data.data_status.fetched_at).toBe(firstBody.data.data_status.fetched_at);
    expect(second.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
  });

  it("re-serves expired LIVE entries as STALE on provider failure, no-store", async () => {
    stubFetch(() => okJson({ results: [BERLIN_ROW] }));
    const first = await searchGET(searchUrl("q=t26stale-one&type=all"));
    const firstBody = (await first.json()) as SearchBody;
    // Expire the entry in place, then fail the provider.
    const cache = getCache();
    const staleEntry = cache.getStale("search:v1:type=all:limit=20:q=t26stale-one") as
      | [{ data_status: { fetched_at: string } }, string | null | undefined]
      | null;
    if (staleEntry === null) throw new Error("expected a cached LIVE entry");
    cache.set(
      "search:v1:type=all:limit=20:q=t26stale-one",
      [staleEntry[0], staleEntry[1]],
      -1,
    );
    stubFetch(async () => {
      throw new Error("upstream down");
    });
    const res = await searchGET(searchUrl("q=t26stale-one&type=all"));
    const body = (await res.json()) as SearchBody;
    expect(body.data.data_status.status).toBe("stale");
    expect(body.data.data_status.fetched_at).toBe(firstBody.data.data_status.fetched_at);
    expect(body.meta.cache_hit).toBe(true);
    expect(body.meta.stale).toBe(true);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("type=location excludes event-index matches", async () => {
    stubFetch(() => okJson({ results: [BERLIN_ROW] }));
    const res = await searchGET(searchUrl("q=t26fire-loc&type=location"));
    const body = (await res.json()) as SearchBody;
    expect(body.data.data_status.status).toBe("live");
    expect(body.data.results.map((r) => r.id)).toEqual(["om-geo-2950159"]);
  });

  it("maps postal-code and Unicode queries end to end", async () => {
    stubFetch((url) => {
      const name = new URL(url).searchParams.get("name") ?? "";
      if (name === "10115") return okJson({ results: [BERLIN_ROW] });
      if (name === "Zürich") {
        return okJson({
          results: [{ id: 7, name: "Zürich", latitude: 47.37, longitude: 8.54, country: "Schweiz" }],
        });
      }
      throw new Error(`unexpected upstream ${url}`);
    });
    const postal = (await (
      await searchGET(searchUrl(`q=${encodeURIComponent("10115")}&type=location`))
    ).json()) as SearchBody;
    expect(postal.data.results[0].name).toBe("Berlin");
    const unicode = (await (
      await searchGET(searchUrl(`q=${encodeURIComponent("Zürich")}&type=location`))
    ).json()) as SearchBody;
    expect(unicode.data.results[0].name).toBe("Zürich");
  });
});

describe("search fallback honesty", () => {
  it("preserves bundled event results as SIMULATED when the provider fails", async () => {
    const fetchMock = stubFetch(async () => {
      throw new Error("upstream down");
    });
    const res = await searchGET(searchUrl("q=t26flood-fallback&type=all"));
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = (await res.json()) as SearchBody;
    expect(body.data.data_status.status).toBe("simulated");
    expect(body.data.results.map((r) => r.id)).toEqual(["flood-001"]);
    expect(body.data.results[0].source).toBe("bundled event index");
    expect(body.data.data_status.message).toMatch(/unavailable/i);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers UNAVAILABLE (never invented cities) when nothing honest can be served", async () => {
    stubFetch(async () => {
      throw new Error("upstream down");
    });
    const res = await searchGET(searchUrl("q=t26nothing-honest&type=location"));
    const body = (await res.json()) as SearchBody;
    expect(body.success).toBe(true);
    expect(body.data.results).toEqual([]);
    expect(body.data.data_status.status).toBe("unavailable");
    expect(body.data.data_status.source).toBe(GEOCODING_SOURCE);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("type=event stays fully local with no upstream call", async () => {
    const fetchMock = stubFetch(async () => {
      throw new Error("provider must not be called");
    });
    const res = await searchGET(searchUrl("q=t26quake-event&type=event"));
    const body = (await res.json()) as SearchBody;
    expect(body.data.data_status.status).toBe("simulated");
    expect(body.data.results.map((r) => r.id)).toEqual(["usgs-12345"]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("short queries return empty without touching the provider", async () => {
    const fetchMock = stubFetch(async () => {
      throw new Error("provider must not be called");
    });
    const res = await searchGET(searchUrl("q=a"));
    const body = (await res.json()) as SearchBody;
    expect(res.status).toBe(200);
    expect(body.data.results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
