/**
 * T1.5 route-level behavior: invalid input → 400 in the standard envelope,
 * before any provider/network work; valid input keeps existing behavior.
 * Offline-safe: fetch throws if touched, so any provider call would fail
 * the test instead of hitting the network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as searchGET } from "@/app/api/v1/search/route";
import { GET as eventGET } from "@/app/api/v1/events/[eventId]/route";
import { GET as tileGET } from "@/app/api/v1/imagery/gibs/tile/[layer]/[z]/[x]/[y]/route";
import { GET as layerDataGET } from "@/app/api/v1/layers/[layerId]/data/route";

const LAYER = "MODIS_Terra_CorrectedReflectance_TrueColor";

afterEach(() => {
  vi.unstubAllGlobals();
});

function searchUrl(q: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/search?q=${encodeURIComponent(q)}`);
}

describe("search route validation", () => {
  it("trims the query and preserves normal behavior", async () => {
    const res = await searchGET(searchUrl("  tokyo  "));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { query: string } };
    expect(body.success).toBe(true);
    expect(body.data.query).toBe("tokyo");
  });

  it("rejects too-long and control-character queries with 400, no provider call", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("provider must not be called");
    });
    vi.stubGlobal("fetch", fetchMock);
    for (const q of ["x".repeat(201), "tokyo\nDROP", "a\x00b"]) {
      const res = await searchGET(searchUrl(q));
      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        success: boolean;
        error: { code: string; message: string };
      };
      expect(body.success).toBe(false);
      expect(typeof body.error.code).toBe("string");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("event route validation", () => {
  it("rejects traversal-like ids with 400 before provider work", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("provider must not be called");
    });
    vi.stubGlobal("fetch", fetchMock);
    for (const eventId of ["..", ".", "a/b", "x".repeat(129)]) {
      const res = await eventGET(new Request("http://localhost:3000/x"), {
        params: Promise.resolve({ eventId }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { success: boolean };
      expect(body.success).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps existing behavior for well-formed lookup-less ids (no network)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("provider must not be called");
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await eventGET(new Request("http://localhost:3000/x"), {
      params: Promise.resolve({ eventId: "fire-10-20" }),
    });
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GIBS tile route validation (already strict — regression lock)", () => {
  function tile(layer: string, z: string, x: string, y: string) {
    return tileGET(new Request("http://localhost:3000/x"), {
      params: Promise.resolve({ layer, z, x, y }),
    });
  }

  it("redirects valid tiles without fetching upstream", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("provider must not be called");
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await tile(LAYER, "2", "1", "1");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("gibs.earthdata.nasa.gov");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects bad layer, bad zoom, out-of-range and non-integer tiles", async () => {
    expect((await tile("EVIL_LAYER", "2", "1", "1")).status).toBe(404);
    expect((await tile(LAYER, "99", "1", "1")).status).toBe(400);
    expect((await tile(LAYER, "2", "4", "1")).status).toBe(400);
    expect((await tile(LAYER, "2", "-1", "1")).status).toBe(400);
    expect((await tile(LAYER, "2", "1.5", "1")).status).toBe(400);
  });
});

describe("layer data route validation", () => {
  const quakeParams = { params: Promise.resolve({ layerId: "earthquakes" }) };

  function dataUrl(params: string): NextRequest {
    return new NextRequest(`http://localhost:3000/api/v1/layers/earthquakes/data?${params}`);
  }

  it("rejects malformed numerics with 400 before provider work", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("provider must not be called");
    });
    vi.stubGlobal("fetch", fetchMock);
    for (const params of ["limit=0x10", "limit=1e3", "limit=5.0", "limit=0", "bbox=10,,30,40"]) {
      const res = await layerDataGET(dataUrl(params), quakeParams);
      expect(res.status, params).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves valid requests with unchanged fallback semantics (offline)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("fetch failed");
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await layerDataGET(dataUrl("limit=5"), quakeParams);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { data_status: { status: string } };
    };
    expect(body.success).toBe(true);
    // Upstream unreachable → labelled fallback, exactly as before.
    expect(body.data.data_status.status).toBe("simulated");
  });
});
