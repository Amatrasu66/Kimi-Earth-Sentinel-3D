import { describe, expect, it } from "vitest";
import { MemoryCache } from "@/server/cache";
import { LAYER_TTLS, successResponse, ttlForLayer, withStatus } from "@/server/provenance";
import { resolveWithCache } from "@/server/services/layers";

describe("provenance", () => {
  it("attaches data_status and meta envelope", () => {
    const payload = withStatus({ layer_id: "x" }, "live", "USGS");
    expect(payload.data_status.status).toBe("live");
    expect(payload.data_status.source).toBe("USGS");
    const res = successResponse(payload, { cacheHit: true });
    expect(res.success).toBe(true);
    expect(res.meta.cache_hit).toBe(true);
    expect(res.meta.data_status).toBe("live");
    expect(res.meta.source).toBe("USGS");
  });
  it("preserves layer TTL table", () => {
    expect(LAYER_TTLS.earthquakes).toBe(300);
    expect(LAYER_TTLS.temperature).toBe(3600);
    expect(ttlForLayer("unknown")).toBe(600);
  });
});

describe("cache + stale fallback", () => {
  it("serves fresh entries with cache_hit", async () => {
    const { data, cacheHit } = await resolveWithCache("k1", 300, async () =>
      withStatus({ v: 1 }, "live", "T"),
    );
    expect(cacheHit).toBe(false);
    expect((data as { v: number }).v).toBe(1);
    const second = await resolveWithCache("k1", 300, async () => {
      throw new Error("should not be called");
    });
    expect(second.cacheHit).toBe(true);
  });

  it("serves expired LIVE as STALE when refresh yields SIMULATED", async () => {
    const cache = (await import("@/server/cache")).getCache();
    cache.clear();
    // Seed an expired LIVE entry directly.
    const live = withStatus({ v: "old" }, "live", "T", undefined, "2026-01-01T00:00:00Z");
    cache.set("stale-key", [live, "2026-01-01T00:00:00Z"], -1); // already expired
    const { data, stale, cacheHit } = await resolveWithCache("stale-key", 300, async () =>
      withStatus({ v: "fallback" }, "simulated", "T"),
    );
    expect(stale).toBe(true);
    expect(cacheHit).toBe(true);
    expect((data as { data_status: { status: string } }).data_status.status).toBe("stale");
    cache.clear();
  });

  it("MemoryCache bounds entries", () => {
    const c = new MemoryCache(300, 2);
    c.set("a", [1, null]);
    c.set("b", [2, null]);
    c.set("c", [3, null]);
    expect(c.size).toBe(2);
  });
});
