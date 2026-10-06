/**
 * Process-local TTL cache with stale fallback — port of
 * backend/app/cache_service.py (InMemoryCache).
 *
 * Vercel note: serverless instances are ephemeral and may be distributed,
 * so this cache is a best-effort per-instance optimization, NOT a shared
 * source of truth. Correctness never depends on it: misses simply refetch
 * from providers, and TTLs mirror the Flask behavior.
 */

export interface CacheEntry {
  value: [unknown, string | null | undefined];
  expiresAt: number;
}

export class MemoryCache {
  private store = new Map<string, CacheEntry>();
  constructor(
    private defaultTimeout = 300,
    private maxEntries = 2000,
  ) {}

  get(key: string): [unknown, string | null | undefined] | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) return null; // keep for getStale()
    return entry.value;
  }

  getStale(key: string): [unknown, string | null | undefined] | null {
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  set(key: string, value: [unknown, string | null | undefined], timeout?: number): void {
    const ttl = timeout ?? this.defaultTimeout;
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(key, { value, expiresAt: Date.now() + Math.max(ttl, 0) * 1000 });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

// Module-global singleton (per serverless instance). Route handlers share it
// within one instance; across instances each has its own copy.
const globalScope = globalThis as unknown as { __earthSentinelCache?: MemoryCache };

export function getCache(): MemoryCache {
  if (!globalScope.__earthSentinelCache) {
    const fallback = Number(process.env.CACHE_DEFAULT_TIMEOUT ?? 300);
    globalScope.__earthSentinelCache = new MemoryCache(
      Number.isNaN(fallback) ? 300 : fallback,
    );
  }
  return globalScope.__earthSentinelCache;
}
