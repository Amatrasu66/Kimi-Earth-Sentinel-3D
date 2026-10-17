/**
 * Phase 6 scene-search hook tests. Deterministic and offline-safe: fetch is
 * stubbed per test (any unstubbed URL throws), SWR cache is reset between
 * tests via cache provider clearing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { buildSceneSearchPath, useSceneSearch } from "./useSceneSearch";

function okJson(payload: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
}

const PAGE = {
  query: { bbox: "139,35,140,36", start: "2026-10-01T00:00:00.000Z", end: "2026-10-15T00:00:00.000Z", collection: "sentinel-2-l2a", limit: 20 },
  scenes: [
    {
      id: "scene-1",
      name: "S2C_MSIL2A_20261015T011651.SAFE",
      collection: "sentinel-2-l2a",
      content_date: "2026-10-15T01:16:51.024Z",
      publication_date: null,
      online: true,
      footprint: null,
    },
  ],
  count: 1,
  attribution: "Contains modified Copernicus Sentinel data [2026]",
  data_status: { status: "live", source: "CDSE OData", fetched_at: "2026-10-16T00:00:00Z", message: null },
};

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => okJson({ success: true, data: PAGE, meta: { timestamp: "", cache_hit: false, cached_at: null, stale: false, source: "CDSE OData", data_status: "live" } })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildSceneSearchPath", () => {
  it("builds the canonical path from a valid bbox", () => {
    expect(buildSceneSearchPath({ bbox: " 139,35,140,36 ", collection: "sentinel-1-grd" })).toBe(
      "/scenes?bbox=139%2C35%2C140%2C36&collection=sentinel-1-grd",
    );
  });

  it("returns null for missing or malformed bbox (never fetches invalid AOIs)", () => {
    expect(buildSceneSearchPath({ bbox: null })).toBeNull();
    expect(buildSceneSearchPath({ bbox: "" })).toBeNull();
    expect(buildSceneSearchPath({ bbox: "139,35,140" })).toBeNull();
    expect(buildSceneSearchPath({ bbox: "140,35,139,36" })).toBeNull();
  });

  it("omits empty optional params", () => {
    expect(buildSceneSearchPath({ bbox: "139,35,140,36", start: "", end: null, collection: "" })).toBe(
      "/scenes?bbox=139%2C35%2C140%2C36",
    );
  });
});

describe("useSceneSearch", () => {
  it("fetches nothing without a bbox key", async () => {
    const { result } = renderHook(() => useSceneSearch({ bbox: null }), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.scenes).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("maps the envelope into scenes/status/cacheHit", async () => {
    const { result } = renderHook(
      () => useSceneSearch({ bbox: "139,35,140,36", collection: "sentinel-2-l2a" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.scenes).toHaveLength(1);
    expect(result.current.count).toBe(1);
    expect(result.current.dataStatus?.status).toBe("live");
    expect(result.current.cacheHit).toBe(false);
    expect(result.current.attribution).toContain("Copernicus");
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain("/api/v1/scenes?bbox=139%2C35%2C140%2C36");
  });

  it("surfaces failures as errors with an empty scene list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ success: false, error: { code: "INTERNAL_ERROR", message: "boom" } }), { status: 500 }))),
    );
    const { result } = renderHook(() => useSceneSearch({ bbox: "139,35,140,36" }), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.scenes).toEqual([]);
  });
});
