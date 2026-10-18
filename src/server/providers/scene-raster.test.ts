/**
 * Phase 7 scene-raster provider tests. Deterministic and offline-safe:
 * upstream fetches are stubbed per test (any unstubbed URL throws). The
 * URL/filter assertions pin the exact syntax captured live during the
 * Phase 7 provider probes — the unquoted `Id eq <guid>` CDSE filter, the
 * collection-items endpoint with `limit=1`, and the exact-name filters
 * (`s2:product_uri` / `s1:product_identifier`) — so the builders cannot
 * drift from the only request shapes the providers were verified to accept.
 *
 * NOTE: these tests were authored during implementation and have NOT been
 * executed by the implementing agent (see PHASE_7_IMPLEMENTATION_REPORT.md
 * §12). They run with the standard `npm test`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { serverConfig } from "@/server/config";
import {
  PC_ATTRIBUTION,
  PC_DATA_API_URL,
  PC_SOURCE,
  SCENE_RASTER_MAX_ZOOM,
  SCENE_RASTER_MIN_ZOOM,
  SCENE_RASTER_NEGATIVE_TTL,
  SCENE_RASTER_TTL,
  buildCdseProductUrl,
  buildPcItemsUrl,
  buildPcTileTemplate,
  classifySceneName,
  pcItemFilter,
  resolveSceneRaster,
} from "@/server/providers/scene-raster";

function okJson(payload: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(payload), { status }));
}

function stubFetch(handler: (url: string) => Promise<Response>) {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const SCENE_ID = "7de1e22f-81bb-4922-909c-867365d04b55";
/** Captured from the Phase 7 live CDSE probe (includes `.SAFE`). */
const L2A_NAME = "S2B_MSIL2A_20261017T144729_N0513_R139_T19MFT_20261017T182518.SAFE";
/** The Planetary Computer item id drops the `_N0513` baseline segment. */
const L2A_ITEM = "S2B_MSIL2A_20261017T144729_R139_T19MFT_20261017T182518";
const L1C_NAME = "S2B_MSIL1C_20261017T144729_N0513_R139_T19MFT_20261017T182518.SAFE";
/** Captured from the Phase 7 live probes (GRD pair, both sides). */
const S1_NAME = "S1C_IW_GRDH_1SDV_20261017T111256_20261017T111323_009924_013C8F_653B.SAFE";
const S1_IDENTIFIER = "S1C_IW_GRDH_1SDV_20261017T111256_20261017T111323_009924_013C8F_653B";
const S1_ITEM = "S1C_IW_GRDH_1SDV_20261017T111256_20261017T111323_009924_013C8F";

const PREVIEW_HREF = `${PC_DATA_API_URL}/item/preview.png?collection=sentinel-2-l2a&item=${L2A_ITEM}`;

const CDSE_L2A_PAGE = { value: [{ Name: L2A_NAME }] };

const PC_L2A_PAGE = {
  type: "FeatureCollection",
  features: [
    {
      id: L2A_ITEM,
      bbox: [139.9, 35.0, 141.2, 36.1],
      properties: { "s2:product_uri": L2A_NAME },
      assets: { rendered_preview: { href: PREVIEW_HREF } },
    },
  ],
};

const PC_S1_PAGE = {
  type: "FeatureCollection",
  features: [
    {
      id: S1_ITEM,
      bbox: [139.5, 34.8, 141.4, 36.4],
      properties: { "s1:product_identifier": S1_IDENTIFIER },
      assets: {},
    },
  ],
};

function stubHappyPath(pcPage: unknown) {
  return stubFetch((url: string) => {
    if (url.startsWith("https://catalogue.dataspace.copernicus.eu/")) {
      return okJson(CDSE_L2A_PAGE);
    }
    if (url.startsWith("https://planetarycomputer.microsoft.com/api/stac/")) {
      return okJson(pcPage);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe("phase 7 constants", () => {
  it("pins the provenance source, TTLs, zoom clamp, and data API origin", () => {
    expect(PC_SOURCE).toBe("Microsoft Planetary Computer");
    expect(SCENE_RASTER_TTL).toBe(900);
    expect(SCENE_RASTER_NEGATIVE_TTL).toBe(300);
    expect(SCENE_RASTER_MIN_ZOOM).toBe(0);
    expect(SCENE_RASTER_MAX_ZOOM).toBe(14);
    expect(PC_DATA_API_URL).toBe(
      "https://planetarycomputer.microsoft.com/api/data/v1",
    );
    expect(PC_ATTRIBUTION).toMatch(/Copernicus Sentinel data/);
    expect(PC_ATTRIBUTION).toMatch(/Microsoft Planetary Computer/);
  });
});

describe("classifySceneName", () => {
  it("maps L2A and S1 GRD names to their verified PC collections", () => {
    expect(classifySceneName(L2A_NAME)).toBe("sentinel-2-l2a");
    expect(classifySceneName(S1_NAME)).toBe("sentinel-1-grd");
  });

  it("classifies names without the .SAFE suffix identically", () => {
    expect(classifySceneName(L2A_NAME.slice(0, -5))).toBe("sentinel-2-l2a");
  });

  it("returns null for products without a verified rendering path", () => {
    expect(classifySceneName(L1C_NAME)).toBeNull();
    expect(classifySceneName("S3A_OL_1_EFR____20261017T102036_20261017T102336_20261018T132133_0179_096_059_2160_PS1_O_NT_002.SEN3")).toBeNull();
    expect(classifySceneName("")).toBeNull();
  });
});

describe("request builders", () => {
  it("builds the CDSE by-id URL with the unquoted GUID filter (no %27)", () => {
    const url = buildCdseProductUrl(SCENE_ID);
    expect(url).toBe(
      `${serverConfig.cdseOdataUrl}/Products` +
        `?$filter=Id%20eq%20${SCENE_ID}&$select=Name`,
    );
    // The quoted form returns an empty set on the verified endpoint.
    expect(url).not.toContain("%27");
  });

  it("builds the exact-name filters verified live for both collections", () => {
    expect(pcItemFilter("sentinel-2-l2a", L2A_NAME)).toBe(
      `s2:product_uri = '${L2A_NAME}'`,
    );
    expect(pcItemFilter("sentinel-1-grd", S1_NAME)).toBe(
      `s1:product_identifier = '${S1_IDENTIFIER}'`,
    );
  });

  it("uses the collection-items endpoint (never /search) with limit=1", () => {
    const url = buildPcItemsUrl("sentinel-2-l2a", L2A_NAME);
    expect(url.startsWith(`${serverConfig.pcStacUrl}/collections/sentinel-2-l2a/items?`)).toBe(true);
    expect(url).toContain("filter=");
    expect(url).toContain("limit=1");
    // Spaces encode as %20 and quotes as %27, both verified.
    expect(url).toContain("s2%3Aproduct_uri%20%3D%20%27");
    expect(url).not.toContain("/search");
  });

  it("assembles the exact live-verified tile templates", () => {
    expect(buildPcTileTemplate("sentinel-2-l2a", L2A_ITEM)).toBe(
      `${PC_DATA_API_URL}/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x` +
        `?collection=sentinel-2-l2a&item=${L2A_ITEM}` +
        `&assets=visual&asset_bidx=visual%7C1,2,3&nodata=0&format=png`,
    );
    expect(buildPcTileTemplate("sentinel-1-grd", S1_ITEM)).toBe(
      `${PC_DATA_API_URL}/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x` +
        `?collection=sentinel-1-grd&item=${S1_ITEM}` +
        `&assets=vv&assets=vh&expression=vv;vh;vv%2Fvh` +
        `&rescale=0,600&rescale=0,270&rescale=0,9&asset_as_band=True&tile_format=png&format=png`,
    );
  });

  it("refuses to build a tile template from an unexpected item id", () => {
    expect(() => buildPcTileTemplate("sentinel-2-l2a", "bad id/../x")).toThrow();
    expect(() => buildPcTileTemplate("sentinel-2-l2a", "")).toThrow();
  });
});

describe("resolveSceneRaster", () => {
  it("resolves an L2A scene end to end (identity re-checked, no token)", async () => {
    const fetchMock = stubHappyPath(PC_L2A_PAGE);
    const result = await resolveSceneRaster(SCENE_ID);
    expect(result.status).toBe("renderable");
    expect(result.scene_name).toBe(L2A_NAME);
    const raster = result.raster;
    expect(raster).not.toBeNull();
    expect(raster?.provider).toBe("microsoft-planetary-computer");
    expect(raster?.collection).toBe("sentinel-2-l2a");
    expect(raster?.item_id).toBe(L2A_ITEM);
    expect(raster?.tile_url_template.startsWith(`${PC_DATA_API_URL}/item/tiles/`)).toBe(true);
    expect(raster?.tile_url_template).toContain(`item=${L2A_ITEM}`);
    expect(raster?.tile_url_template).not.toContain("token=");
    expect(raster?.preview_url).toBe(PREVIEW_HREF);
    expect(raster?.bbox).toEqual([139.9, 35.0, 141.2, 36.1]);
    expect(raster?.min_zoom).toBe(0);
    expect(raster?.max_zoom).toBe(14);
    expect(raster?.rendering).toMatch(/True color/i);
    expect(raster?.resolution_note.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves an S1 GRD scene with the radar composite template", async () => {
    stubFetch((url: string) => {
      if (url.startsWith("https://catalogue.dataspace.copernicus.eu/")) {
        return okJson({ value: [{ Name: S1_NAME }] });
      }
      return okJson(PC_S1_PAGE);
    });
    const result = await resolveSceneRaster(SCENE_ID);
    expect(result.status).toBe("renderable");
    expect(result.raster?.collection).toBe("sentinel-1-grd");
    expect(result.raster?.tile_url_template).toContain("assets=vv");
    expect(result.raster?.tile_url_template).toContain("expression=vv;vh;vv%2Fvh");
    expect(result.raster?.preview_url).toBeNull();
  });

  it("returns a terminal 'unsupported' answer for L1C without calling PC", async () => {
    const fetchMock = stubFetch((url: string) => {
      if (url.startsWith("https://catalogue.dataspace.copernicus.eu/")) {
        return okJson({ value: [{ Name: L1C_NAME }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const result = await resolveSceneRaster(SCENE_ID);
    expect(result.status).toBe("unsupported");
    expect(result.raster).toBeNull();
    expect(result.reason).toMatch(/L1C/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 'not_found' when the catalogue no longer lists the scene", async () => {
    stubFetch(() => okJson({ value: [] }));
    const result = await resolveSceneRaster(SCENE_ID);
    expect(result.status).toBe("not_found");
    expect(result.scene_name).toBeNull();
    expect(result.raster).toBeNull();
  });

  it("returns 'not_found' when the product is not yet mirrored on PC", async () => {
    stubHappyPath({ type: "FeatureCollection", features: [] });
    const result = await resolveSceneRaster(SCENE_ID);
    expect(result.status).toBe("not_found");
    expect(result.scene_name).toBe(L2A_NAME);
    expect(result.reason).toMatch(/not yet mirrored/i);
  });

  it("rejects an identity mismatch instead of serving the wrong product", async () => {
    stubHappyPath({
      type: "FeatureCollection",
      features: [
        {
          id: L2A_ITEM,
          bbox: [139.9, 35.0, 141.2, 36.1],
          properties: { "s2:product_uri": "S2A_MSIL2A_20250101T000000_N0513_R033_T48VUJ_20250101T000000.SAFE" },
          assets: {},
        },
      ],
    });
    await expect(resolveSceneRaster(SCENE_ID)).rejects.toThrow(/different product/);
  });

  it("rejects a PC item without a usable bounding box", async () => {
    stubHappyPath({
      type: "FeatureCollection",
      features: [
        { id: L2A_ITEM, bbox: [140, 36, 139, 35], properties: { "s2:product_uri": L2A_NAME }, assets: {} },
      ],
    });
    await expect(resolveSceneRaster(SCENE_ID)).rejects.toThrow(/bounding box/);
  });

  it("throws on upstream HTTP failures and malformed envelopes", async () => {
    stubFetch(() => okJson({}, 504));
    await expect(resolveSceneRaster(SCENE_ID)).rejects.toThrow(/HTTP 504/);

    vi.unstubAllGlobals();
    stubFetch(() => okJson({ notValue: true }));
    await expect(resolveSceneRaster(SCENE_ID)).rejects.toThrow(/shape/);

    vi.unstubAllGlobals();
    stubFetch((url: string) => {
      if (url.startsWith("https://catalogue.dataspace.copernicus.eu/")) {
        return okJson(CDSE_L2A_PAGE);
      }
      return okJson({ notFeatures: true });
    });
    await expect(resolveSceneRaster(SCENE_ID)).rejects.toThrow(/shape/);
  });
});
