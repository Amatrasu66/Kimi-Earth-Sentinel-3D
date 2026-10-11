/**
 * T2.6 forward-search provider tests. Deterministic and offline-safe:
 * upstream fetches are stubbed per test (any unstubbed URL throws), so
 * nothing can reach the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCache } from "@/server/cache";
import { UpstreamTimeoutError } from "@/server/http";
import {
  GEOCODING_MAX_COUNT,
  GEOCODING_SOURCE,
  mergeSearchResults,
  searchGeocodingLocations,
} from "@/server/providers/geocoding";
import type { SearchResult } from "@/types";

const BERLIN_ROW = {
  id: 2950159,
  name: "Berlin",
  latitude: 52.52437,
  longitude: 13.41053,
  elevation: 74.0,
  feature_code: "PPLC",
  country_code: "DE",
  country: "Germany",
  admin1: "Berlin",
  timezone: "Europe/Berlin",
  population: 3426354,
  postcodes: ["10967", "13347"],
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

function loc(over: Partial<SearchResult> & { id: string; name: string }): SearchResult {
  return { type: "location", lat: 0, lon: 0, ...over };
}

function ev(id: string, name = id): SearchResult {
  return { id, type: "event", name, lat: 0, lon: 0 };
}

beforeEach(() => {
  getCache().clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  getCache().clear();
});

describe("searchGeocodingLocations mapping", () => {
  it("maps real city rows to the SearchResult contract", async () => {
    stubFetch(() => okJson({ results: [BERLIN_ROW, PARIS_ROW] }));
    const out = await searchGeocodingLocations("ber", 10);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      id: "om-geo-2950159",
      type: "location",
      name: "Berlin",
      lat: 52.52437,
      lon: 13.41053,
      country: "Germany",
      admin1: "Berlin",
      country_code: "DE",
      population: 3426354,
      snippet: "Berlin, Berlin, Germany",
      source: GEOCODING_SOURCE,
    });
    expect(out[1].id).toBe("om-geo-2988507");
    expect(out[1].snippet).toBe("Paris, Île-de-France, France");
  });

  it("passes postal-code queries through per the provider contract", async () => {
    const fetchMock = stubFetch(() => okJson({ results: [BERLIN_ROW] }));
    const out = await searchGeocodingLocations("10115", 5);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Berlin");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(new URL(url).searchParams.get("name")).toBe("10115");
  });

  it("keeps Unicode/diacritic names intact and URL-encodes the query", async () => {
    const fetchMock = stubFetch(() =>
      okJson({
        results: [{ id: 1, name: "Zürich", latitude: 47.37, longitude: 8.54, country: "Schweiz" }],
      }),
    );
    const out = await searchGeocodingLocations("Zürich", 5);
    expect(out[0].name).toBe("Zürich");
    const url = fetchMock.mock.calls[0][0] as string;
    // URLSearchParams encoding — raw interpolation would leave this readable.
    expect(url).toContain("name=Z%C3%BCrich");
    expect(url).not.toContain("name=Zürich");
  });

  it("returns [] for empty provider payloads (no match), never invented rows", async () => {
    stubFetch(() => okJson({}));
    await expect(searchGeocodingLocations("zzqq", 5)).resolves.toEqual([]);
    stubFetch(() => okJson({ results: [] }));
    await expect(searchGeocodingLocations("zzqq", 5)).resolves.toEqual([]);
  });

  it("skips malformed rows instead of inventing coordinates", async () => {
    stubFetch(() =>
      okJson({
        results: [
          { id: 1, name: "No Coords" },
          { id: 2, latitude: 10, longitude: 20 },
          { latitude: 10, longitude: 20, name: "No Id" },
          { id: 3, name: "Out Of Range", latitude: 95, longitude: 0 },
          { id: 4, name: "No Numbers", latitude: "x", longitude: 0 },
          { id: 5, name: "Kept", latitude: 10, longitude: 20 },
        ],
      }),
    );
    const out = await searchGeocodingLocations("x", 10);
    expect(out.map((r) => r.id)).toEqual(["om-geo-5"]);
  });

  it("surfaces provider error reasons and HTTP failures (never silent [])", async () => {
    stubFetch(() => okJson({ error: true, reason: "Parameter count must be between 1 and 100." }, 400));
    await expect(searchGeocodingLocations("x", 5)).rejects.toThrow(/between 1 and 100/);
    stubFetch(() => okJson({ error: "boom" }, 500));
    await expect(searchGeocodingLocations("x", 5)).rejects.toThrow(/status 500/);
    stubFetch(() => Promise.resolve(new Response("not json", { status: 200 })));
    await expect(searchGeocodingLocations("x", 5)).rejects.toThrow(/response shape/);
  });

  it("caps the provider count and reuses the shared timeout helper", async () => {
    const fetchMock = stubFetch(() => okJson({ results: [] }));
    await searchGeocodingLocations("berlin", 100);
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("count")).toBe(
      String(GEOCODING_MAX_COUNT),
    );
    await searchGeocodingLocations("berlin", 3);
    expect(new URL(fetchMock.mock.calls[1][0] as string).searchParams.get("count")).toBe("3");
  });

  it("times out through fetchJsonWithTimeout", async () => {
    stubFetch(() => new Promise<Response>(() => {})); // hangs forever
    await expect(searchGeocodingLocations("berlin", 5, { timeoutMs: 50 })).rejects.toBeInstanceOf(
      UpstreamTimeoutError,
    );
  });
});

describe("mergeSearchResults ranking + dedup", () => {
  it("orders locations first (provider relevance), then events, sliced to limit", () => {
    const out = mergeSearchResults(
      [loc({ id: "om-geo-1", name: "Berlin" }), loc({ id: "om-geo-2", name: "Bern" })],
      [ev("fire-001"), ev("usgs-12345")],
      3,
    );
    expect(out.map((r) => r.id)).toEqual(["om-geo-1", "om-geo-2", "fire-001"]);
  });

  it("drops duplicate provider ids and duplicate-looking name+country rows", () => {
    const out = mergeSearchResults(
      [
        loc({ id: "om-geo-1", name: "Paris", country: "France" }),
        loc({ id: "om-geo-1", name: "Paris", country: "France" }),
        loc({ id: "om-geo-9", name: "PARIS", country: "france" }),
        loc({ id: "om-geo-2", name: "Paris", country: "USA" }),
      ],
      [ev("fire-001"), ev("fire-001")],
      10,
    );
    expect(out.map((r) => r.id)).toEqual(["om-geo-1", "om-geo-2", "fire-001"]);
  });

  it("is deterministic for equal inputs and keeps result types distinct", () => {
    const locations = [loc({ id: "om-geo-1", name: "Lima", country: "Peru" })];
    const events = [ev("flood-001", "Severe Flooding")];
    const a = mergeSearchResults(locations, events, 10);
    const b = mergeSearchResults(locations, events, 10);
    expect(a).toEqual(b);
    expect(a.map((r) => r.type)).toEqual(["location", "event"]);
  });
});
