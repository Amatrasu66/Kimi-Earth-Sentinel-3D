/**
 * Phase 6 CDSE catalogue provider tests. Deterministic and offline-safe:
 * upstream fetches are stubbed per test (any unstubbed URL throws), so
 * nothing can reach the network. The filter/URL assertions pin the exact
 * syntax captured live during Stage B (`OData.CSC.Intersects`, %20/%27
 * encoding, closed polygon ring) so the builder cannot drift from the only
 * request shape CDSE accepts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCache } from "@/server/cache";
import {
  CDSE_SOURCE,
  DEFAULT_SCENE_COLLECTION,
  SCENE_COLLECTIONS,
  SCENES_LIMIT_DEFAULT,
  SCENES_LIMIT_MAX,
  SCENES_TTL,
  buildSceneFilter,
  buildScenesUrl,
  fetchScenes,
  normalizeScenes,
  parseFootprint,
} from "@/server/providers/cdse-catalogue";
import type { SceneSearchParams } from "@/server/providers/cdse-catalogue";

function okJson(payload: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(payload), { status }));
}

function stubFetch(handler: (url: string) => Promise<Response>) {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

const BBOX = { min_lon: 138.0, min_lat: 34.5, max_lon: 141.0, max_lat: 37.0 };

const PARAMS: SceneSearchParams = {
  bbox: BBOX,
  collectionId: "sentinel-2-l2a",
  start: "2026-09-20T00:00:00.000Z",
  end: "2026-10-16T00:00:00.000Z",
  limit: 20,
};

/** Fixture captured from a live Stage B probe (Tokyo AOI, S2 L2A). */
const LIVE_FIXTURE = {
  value: [
    {
      Id: "9d063d3a-8bb0-4a3d-9f0e-2f6f3c9f4a01",
      Name: "S2C_MSIL2A_20261015T011651_N0513_R031_T54SWE_20261015T041011.SAFE",
      ContentDate: { Start: "2026-10-15T01:16:51.024Z", End: "2026-10-15T01:16:51.024Z" },
      Online: true,
      PublicationDate: "2026-10-15T03:41:11.220Z",
      GeoFootprint: {
        type: "Polygon",
        coordinates: [
          [
            [139.9, 35.0],
            [141.2, 35.0],
            [141.2, 36.1],
            [139.9, 36.1],
            [139.9, 35.0],
          ],
        ],
      },
    },
  ],
};

beforeEach(() => {
  getCache().clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  getCache().clear();
});

describe("phase 6 constants", () => {
  it("pins the route-facing budgets and provenance source", () => {
    expect(SCENES_TTL).toBe(900);
    expect(SCENES_LIMIT_DEFAULT).toBe(SCENES_LIMIT_MAX);
    expect(SCENES_LIMIT_MAX).toBe(20);
    expect(CDSE_SOURCE).toBe("CDSE OData");
    expect(DEFAULT_SCENE_COLLECTION).toBe("sentinel-2-l1c");
  });

  it("keeps the curated collection allow-list exactly at the verified set", () => {
    expect(Object.keys(SCENE_COLLECTIONS).sort()).toEqual([
      "sentinel-1-grd",
      "sentinel-2-l1c",
      "sentinel-2-l2a",
    ]);
    expect(SCENE_COLLECTIONS["sentinel-2-l2a"]).toEqual({
      collection: "SENTINEL-2",
      nameToken: "MSIL2A",
      label: "Sentinel-2 L2A",
    });
    expect(SCENE_COLLECTIONS["sentinel-1-grd"]).toEqual({
      collection: "SENTINEL-1",
      nameToken: "_GRD",
      label: "Sentinel-1 GRD",
    });
  });
});

describe("buildSceneFilter", () => {
  it("matches the verified Stage B probe text byte-for-byte", () => {
    expect(buildSceneFilter(PARAMS)).toBe(
      "Collection/Name eq 'SENTINEL-2' and contains(Name,'MSIL2A')" +
        " and OData.CSC.Intersects(area=geography'SRID=4326;POLYGON((" +
        "138 34.5,141 34.5,141 37,138 37,138 34.5" +
        "))')" +
        " and ContentDate/Start gt 2026-09-20T00:00:00.000Z" +
        " and ContentDate/Start lt 2026-10-16T00:00:00.000Z",
    );
  });

  it("uses the S1 facets for the GRD collection", () => {
    const filter = buildSceneFilter({ ...PARAMS, collectionId: "sentinel-1-grd" });
    expect(filter).toContain("Collection/Name eq 'SENTINEL-1'");
    expect(filter).toContain("contains(Name,'_GRD')");
  });
});

describe("buildScenesUrl", () => {
  it("encodes spaces as %20 and quotes as %27 with raw parentheses", () => {
    const url = buildScenesUrl(PARAMS);
    expect(url.startsWith("https://catalogue.dataspace.copernicus.eu/odata/v1/Products?")).toBe(true);
    expect(url).toContain("%20");
    expect(url).toContain("%27");
    // `encodeURIComponent` never emits form-urlencoded `+` for spaces.
    expect(url).not.toContain("+");
    expect(url).toContain("OData.CSC.Intersects(area%3Dgeography%27SRID%3D4326%3BPOLYGON((");
    expect(url).toContain("&$top=20");
    expect(url).toContain("&$select=Id%2CName%2CContentDate%2CGeoFootprint%2COnline%2CPublicationDate");
    expect(url).toContain("&$orderby=ContentDate%2FStart%20desc");
  });

  it("decodes to the verified filter text (transport-encoding neutrality)", () => {
    const query = buildScenesUrl(PARAMS).split("?")[1] ?? "";
    const params = new URLSearchParams(query);
    // URLSearchParams decodes `+` as space, but the URL above never emits
    // `+` (asserted separately), so this is the exact filter text CDSE sees.
    expect(params.get("$filter")).toBe(buildSceneFilter(PARAMS));
    expect(params.get("$top")).toBe("20");
    expect(params.get("$orderby")).toBe("ContentDate/Start desc");
  });
});

describe("parseFootprint", () => {
  it("accepts the verified GeoJSON polygon", () => {
    const fp = parseFootprint(LIVE_FIXTURE.value[0].GeoFootprint);
    expect(fp?.type).toBe("Polygon");
  });

  it("accepts MultiPolygon and rejects malformed shapes", () => {
    expect(
      parseFootprint({ type: "MultiPolygon", coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]] })?.type,
    ).toBe("MultiPolygon");
    expect(parseFootprint({ type: "Point", coordinates: [0, 0] })).toBeNull();
    expect(parseFootprint({ type: "Polygon", coordinates: [] })).toBeNull();
    expect(parseFootprint({ type: "Polygon", coordinates: [[["x", 1]]] })).toBeNull();
    expect(parseFootprint(null)).toBeNull();
    expect(parseFootprint("polygon")).toBeNull();
  });

  it("rejects oversized geometries (pathology guard)", () => {
    const ring = Array.from({ length: 5000 }, (_, i) => [i % 10, i % 5]);
    expect(parseFootprint({ type: "Polygon", coordinates: [ring] })).toBeNull();
  });
});

describe("normalizeScenes", () => {
  it("maps the live fixture into the SceneSummary contract", () => {
    const scenes = normalizeScenes(LIVE_FIXTURE, "sentinel-2-l2a", 20);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toEqual({
      id: LIVE_FIXTURE.value[0].Id,
      name: LIVE_FIXTURE.value[0].Name,
      collection: "sentinel-2-l2a",
      content_date: "2026-10-15T01:16:51.024Z",
      publication_date: "2026-10-15T03:41:11.220Z",
      online: true,
      footprint: LIVE_FIXTURE.value[0].GeoFootprint,
    });
  });

  it("skips malformed items but keeps well-formed neighbours", () => {
    const scenes = normalizeScenes(
      {
        value: [
          null,
          { Id: "only-id" },
          { Id: "x", Name: "n", ContentDate: { Start: "not-a-date" } },
          {
            Id: "a2",
            Name: "S1C_IW_GRDH_1SDV_20261001T083258.SAFE",
            ContentDate: { Start: "2026-10-01T08:32:58Z" },
            Online: false,
            PublicationDate: null,
            GeoFootprint: { type: "Polygon", coordinates: "bogus" },
          },
        ],
      },
      "sentinel-1-grd",
      20,
    );
    expect(scenes).toHaveLength(1);
    expect(scenes[0].id).toBe("a2");
    expect(scenes[0].publication_date).toBeNull();
    expect(scenes[0].online).toBe(false);
    expect(scenes[0].footprint).toBeNull();
  });

  it("throws on a wrong envelope (route maps to stale/unavailable)", () => {
    expect(() => normalizeScenes({ rows: [] }, "sentinel-2-l2a", 20)).toThrow(
      "Unexpected CDSE OData response shape",
    );
    expect(() => normalizeScenes(null, "sentinel-2-l2a", 20)).toThrow();
  });

  it("truncates at the limit", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      Id: `id-${i}`,
      Name: `P${i}`,
      ContentDate: { Start: "2026-10-01T00:00:00Z" },
    }));
    expect(normalizeScenes({ value: rows }, "sentinel-2-l2a", 5)).toHaveLength(5);
  });
});

describe("fetchScenes", () => {
  it("requests the encoded URL once and normalizes the payload", async () => {
    const fetchMock = stubFetch((url) =>
      url.includes("/Products?$filter=") ? okJson(LIVE_FIXTURE) : Promise.reject(new Error("unexpected")),
    );
    const scenes = await fetchScenes(PARAMS);
    expect(scenes).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("%27SENTINEL-2%27");
    expect(calledUrl).toContain("$top=20");
  });

  it("throws on non-200 (route owns the fallback)", async () => {
    stubFetch(() => okJson({ message: "throttled" }, 429));
    await expect(fetchScenes(PARAMS)).rejects.toThrow("CDSE OData returned HTTP 429");
  });

  it("throws on a wrong envelope even with HTTP 200", async () => {
    stubFetch(() => okJson({ unexpected: true }));
    await expect(fetchScenes(PARAMS)).rejects.toThrow("Unexpected CDSE OData response shape");
  });
});
