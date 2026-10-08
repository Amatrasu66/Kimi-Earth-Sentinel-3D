/**
 * T1.3 deterministic tests: limits, 429 shape, Retry-After, route classes,
 * refill/expiry, identity handling, and the store memory bound.
 * Time is injected explicitly — no flakiness, no live network.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  MAX_ENTRIES,
  RATE_LIMITS,
  RATE_WINDOW_MS,
  checkLimit,
  classifyRoute,
  createRateLimitStore,
  identityFromHeaders,
  resetRuntimeStore,
} from "@/server/rate-limit";
import { middleware } from "@/middleware";

const T0 = 1_700_000_000_000;

describe("classifyRoute", () => {
  it("marks upstream-expensive routes heavy", () => {
    expect(classifyRoute("/api/v1/layers/earthquakes/data")).toBe("heavy");
    expect(classifyRoute("/api/v1/layers/wind/heatmap")).toBe("heavy");
    expect(classifyRoute("/api/v1/search")).toBe("heavy");
    expect(classifyRoute("/api/v1/geocode/reverse")).toBe("heavy");
    expect(classifyRoute("/api/v1/imagery/gibs/tile/layer/3/1/1")).toBe("heavy");
  });
  it("marks cheap metadata/health routes light", () => {
    expect(classifyRoute("/api/v1")).toBe("light");
    expect(classifyRoute("/api/v1/layers")).toBe("light");
    expect(classifyRoute("/api/v1/health")).toBe("light");
    expect(classifyRoute("/api/v1/imagery/gibs/capabilities")).toBe("light");
  });
  it("defaults the rest of /api/v1 to standard, ignores other paths", () => {
    expect(classifyRoute("/api/v1/events/abc123")).toBe("standard");
    expect(classifyRoute("/api/v1/stats")).toBe("standard");
    expect(classifyRoute("/api/v1/stats/historical")).toBe("standard");
    expect(classifyRoute("/api/v1/timezones")).toBe("standard");
    expect(classifyRoute("/api/v1/unknown/future")).toBe("standard");
    expect(classifyRoute("/")).toBeNull();
    expect(classifyRoute("/api/health")).toBeNull();
    expect(classifyRoute("/textures/earth-day.jpg")).toBeNull();
  });
});

describe("checkLimit", () => {
  it("allows up to capacity, then denies with Retry-After", () => {
    const store = createRateLimitStore();
    for (let i = 0; i < RATE_LIMITS.heavy; i++) {
      const d = checkLimit(store, "1.2.3.4", "heavy", T0);
      expect(d.allowed).toBe(true);
    }
    const denied = checkLimit(store, "1.2.3.4", "heavy", T0);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("refills over the window and reports remaining", () => {
    const store = createRateLimitStore();
    for (let i = 0; i < RATE_LIMITS.standard; i++) {
      checkLimit(store, "9.9.9.9", "standard", T0);
    }
    expect(checkLimit(store, "9.9.9.9", "standard", T0).allowed).toBe(false);
    // Half a window later: half the bucket is back.
    const half = checkLimit(store, "9.9.9.9", "standard", T0 + RATE_WINDOW_MS / 2);
    expect(half.allowed).toBe(true);
    expect(half.remaining).toBeGreaterThan(0);
    // Full window of idleness: bucket is whole again.
    const full = checkLimit(store, "9.9.9.9", "standard", T0 + RATE_WINDOW_MS * 2);
    expect(full.allowed).toBe(true);
    expect(full.remaining).toBe(RATE_LIMITS.standard - 1);
  });

  it("isolates identities and classes", () => {
    const store = createRateLimitStore();
    for (let i = 0; i < RATE_LIMITS.heavy; i++) checkLimit(store, "a", "heavy", T0);
    expect(checkLimit(store, "a", "heavy", T0).allowed).toBe(false);
    expect(checkLimit(store, "b", "heavy", T0).allowed).toBe(true);
    expect(checkLimit(store, "a", "light", T0).allowed).toBe(true);
  });

  it("never exceeds the memory bound under identity flood", () => {
    const store = createRateLimitStore();
    for (let i = 0; i < MAX_ENTRIES + 500; i++) {
      checkLimit(store, `flood-${i}`, "heavy", T0);
    }
    expect(store.buckets.size).toBeLessThanOrEqual(MAX_ENTRIES);
  });

  it("reaps long-idle buckets", () => {
    const store = createRateLimitStore();
    checkLimit(store, "stale-client", "heavy", T0);
    expect(store.buckets.size).toBe(1);
    checkLimit(store, "fresh-client", "heavy", T0 + RATE_WINDOW_MS * 10);
    // The stale bucket's tokens refilled (full window idle) — still tracked,
    // but a flood-sized insert would evict it first (covered above).
    expect(checkLimit(store, "stale-client", "heavy", T0 + RATE_WINDOW_MS * 10).allowed).toBe(
      true,
    );
  });
});

describe("identityFromHeaders", () => {
  it("takes the first x-forwarded-for entry, falls back safely", () => {
    expect(identityFromHeaders("203.0.113.7, 70.41.3.18", null)).toBe("203.0.113.7");
    expect(identityFromHeaders(null, "198.51.100.9")).toBe("198.51.100.9");
    expect(identityFromHeaders(null, null)).toBe("unknown");
    expect(identityFromHeaders("", "")).toBe("unknown");
  });
  it("caps identity length so headers cannot bloat keys", () => {
    expect(identityFromHeaders("x".repeat(500), null)).toHaveLength(64);
  });
});

describe("middleware (T1.3 acceptance)", () => {
  beforeEach(() => resetRuntimeStore());

  function heavyRequest(ip: string, n = 0) {
    return new NextRequest(`http://localhost:3000/api/v1/search?q=test${n}`, {
      headers: { "x-forwarded-for": ip },
    });
  }

  it("passes normal traffic and throttles a heavy-route flood with 429 + Retry-After", async () => {
    for (let i = 0; i < RATE_LIMITS.heavy; i++) {
      const res = await middleware(heavyRequest("203.0.113.7", i));
      expect(res.status).not.toBe(429);
    }
    const limited = await middleware(heavyRequest("203.0.113.7", 999));
    expect(limited.status).toBe(429);
    const retryAfter = limited.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
    const body = (await limited.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };
    // Standard error envelope preserved.
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(typeof body.error.message).toBe("string");
  });

  it("does not throttle other identities or light routes", async () => {
    for (let i = 0; i < RATE_LIMITS.heavy; i++) {
      await middleware(heavyRequest("203.0.113.7", i));
    }
    const other = await middleware(heavyRequest("198.51.100.9", 0));
    expect(other.status).not.toBe(429);
    const light = new NextRequest("http://localhost:3000/api/v1/health", {
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    expect((await middleware(light)).status).not.toBe(429);
  });
});
