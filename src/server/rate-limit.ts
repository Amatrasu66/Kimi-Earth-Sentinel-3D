/**
 * T1.3 (S-01) — best-effort per-instance token-bucket rate limiter.
 *
 * Platform note: there is no `vercel.json` in this repo and Vercel Firewall
 * rate-limit rules cannot be configured from code — they depend on the
 * Vercel plan (WAF custom rules are a paid-tier feature). The owner rule for
 * T1.3 is: verify plan capabilities, prefer Vercel-native where available,
 * add no paid infrastructure. This module is therefore the repo-side,
 * no-cost layer: it runs in `middleware.ts` (Edge-safe: pure TS, `Date.now`
 * only, no Node APIs) and shields provider quota from casual abuse.
 *
 * Serverless limitations (honest by design):
 * - State is per isolate/region, NOT shared: N instances ≈ N× the nominal
 *   limit under fan-out. A Vercel Firewall rule remains the correct global
 *   enforcement when the plan allows it (see docs/development.md).
 * - Client IP comes from `x-forwarded-for` (platform-appended on Vercel).
 *   Direct-to-origin traffic could spoof it; the store is hard-bounded
 *   (MAX_ENTRIES + expiry + eviction) so spoofed identities cannot grow
 *   memory without bound — they only share/evict bucket slots.
 *
 * The limiter never touches provider logic or fallback semantics: it rejects
 * excess requests with 429 BEFORE any upstream call, in the standard
 * `{ success: false, error: { code, message } }` envelope + `Retry-After`.
 */
export type RouteClass = "light" | "standard" | "heavy";

/** Requests per 60 s window, per client identity, per class. */
export const RATE_LIMITS: Record<RouteClass, number> = {
  light: 120,
  standard: 60,
  heavy: 20,
};

export const RATE_WINDOW_MS = 60_000;

/** Hard bound on tracked identities — prevents unbounded memory growth. */
export const MAX_ENTRIES = 2000;

export interface LimitDecision {
  allowed: boolean;
  /** Requests remaining in the current window (0 when denied). */
  remaining: number;
  /** Seconds the client should wait before retrying (0 when allowed). */
  retryAfterSec: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimitStore {
  buckets: Map<string, Bucket>;
}

/** Fresh isolated store — tests create one per case; runtime uses the singleton. */
export function createRateLimitStore(): RateLimitStore {
  return { buckets: new Map() };
}

let singleton: RateLimitStore | null = null;

export function runtimeStore(): RateLimitStore {
  if (!singleton) singleton = createRateLimitStore();
  return singleton;
}

/** Test-only reset for the runtime singleton (isolates middleware tests). */
export function resetRuntimeStore(): void {
  singleton = createRateLimitStore();
}

function bucketKey(identity: string, routeClass: RouteClass): string {
  return `${routeClass}:${identity}`;
}

function evictIfNeeded(store: RateLimitStore, now: number): void {
  if (store.buckets.size < MAX_ENTRIES) return;
  // First pass: drop expired buckets (idle a full window or more).
  for (const [key, bucket] of store.buckets) {
    if (now - bucket.updatedAt >= RATE_WINDOW_MS) store.buckets.delete(key);
    if (store.buckets.size < MAX_ENTRIES) return;
  }
  // Still full (active flood of distinct identities): drop oldest first.
  // Map preserves insertion order, so the first key is the oldest.
  while (store.buckets.size >= MAX_ENTRIES) {
    const oldest = store.buckets.keys().next();
    if (oldest.done) return;
    store.buckets.delete(oldest.value);
  }
}

/**
 * Token-bucket check. Deterministic: pass `now` explicitly in tests;
 * defaults to `Date.now()` at runtime.
 */
export function checkLimit(
  store: RateLimitStore,
  identity: string,
  routeClass: RouteClass,
  now: number = Date.now(),
): LimitDecision {
  const capacity = RATE_LIMITS[routeClass];
  const refillPerMs = capacity / RATE_WINDOW_MS;
  const key = bucketKey(identity, routeClass);
  let bucket = store.buckets.get(key);
  if (!bucket) {
    evictIfNeeded(store, now);
    bucket = { tokens: capacity, updatedAt: now };
    store.buckets.set(key, bucket);
  } else {
    const elapsed = Math.max(0, now - bucket.updatedAt);
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
    bucket.updatedAt = now;
  }
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterSec: 0 };
  }
  const deficit = 1 - bucket.tokens;
  return {
    allowed: false,
    remaining: 0,
    retryAfterSec: Math.max(1, Math.ceil(deficit / refillPerMs / 1000)),
  };
}

/**
 * Route classification. Heavy = upstream-expensive (provider quota burn):
 * per-layer data, heatmaps, search, reverse-geocode, GIBS tiles.
 * Light = cheap metadata/health. Everything else under /api/v1 is standard.
 * Returns null for paths outside the protected surface.
 */
export function classifyRoute(pathname: string): RouteClass | null {
  if (!pathname.startsWith("/api/v1/") && pathname !== "/api/v1") return null;
  if (
    /^\/api\/v1\/layers\/[^/]+\/(data|heatmap)$/.test(pathname) ||
    pathname === "/api/v1/search" ||
    pathname === "/api/v1/geocode/reverse" ||
    /^\/api\/v1\/imagery\/gibs\/tile\//.test(pathname)
  ) {
    return "heavy";
  }
  if (
    pathname === "/api/v1" ||
    pathname === "/api/v1/layers" ||
    pathname === "/api/v1/health" ||
    pathname === "/api/v1/imagery/gibs/capabilities"
  ) {
    return "light";
  }
  return "standard";
}

/**
 * Client identity for limiting. On Vercel `x-forwarded-for` is
 * platform-appended (client IP is the first entry); direct-to-origin
 * spoofing is a documented limitation, mitigated by the bounded store.
 * Unidentifiable clients share one "unknown" bucket (fail-closed direction:
 * they are limited together, never unlimited).
 */
export function identityFromHeaders(
  forwardedFor: string | null,
  realIp: string | null,
): string {
  const first = (forwardedFor ?? "").split(",")[0]?.trim();
  if (first) return first.slice(0, 64);
  const ip = (realIp ?? "").trim();
  if (ip) return ip.slice(0, 64);
  return "unknown";
}
