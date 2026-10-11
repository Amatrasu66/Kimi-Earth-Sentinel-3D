import { useState, useEffect, useCallback, useRef } from 'react';
import useSWR, { preload } from 'swr';
import type { SWRConfiguration } from 'swr';
import { api, ApiError, buildLayerDataPath } from '@/services/api';
import { parseBbox } from '@/server/validation';
import { LAYER_IDS } from '@/types';
import type { DataStatus, LayerMetadata, LayerData, LayerId } from '@/types';

// NOTE: the catalogue hook below still fetches in an effect (standard
// fetch-in-effect pattern with abort cleanup — not derived-state sync).
// The layer-data hook further down is SWR-based (T3.6).

export function useLayers() {
  const [layers, setLayers] = useState<LayerMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Layer-list fetch with abort cleanup — the standard fetch-in-effect
  // pattern (not a cascading render).
  useEffect(() => {
    const controller = new AbortController();
    api
      .getLayers({ signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setLayers(data.layers);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load layers.');
        setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, []);

  return { layers, loading, error };
}

// ---------------------------------------------------------------------------
// T3.6 SWR layer-data client.
// ---------------------------------------------------------------------------

export interface UseLayerDataOptions {
  limit?: number;
  min_severity?: string;
  bbox?: string;
}

export interface LayerDataMeta {
  /** Server L1 cache hit from the response envelope (null without data). */
  cacheHit: boolean | null;
}

export interface LayerDataEnvelope {
  data: LayerData;
  meta: LayerDataMeta;
}

/**
 * Retry policy (documented, bounded). The backend limiter stays
 * authoritative: at most 3 backoff retries for transient failures, at most
 * 2 extra attempts for 429s honoring Retry-After — then the error stands
 * and the user refreshes explicitly.
 */
export const LAYER_RETRY_MAX_ATTEMPTS = 3;
export const LAYER_RETRY_BASE_MS = 500;
export const LAYER_RETRY_MAX_MS = 8000;
export const LAYER_RETRY_JITTER_MS = 250;
export const LAYER_429_MAX_ATTEMPTS = 2;
export const LAYER_429_MAX_WAIT_SEC = 30;

/** Normalize request-affecting params to one canonical shape (key stability). */
export function normalizeLayerDataParams(
  params?: UseLayerDataOptions,
): { limit: number; min_severity?: string; bbox?: string } | null {
  const limitRaw = Number(params?.limit);
  // Server default is 500; materialize it so absent/undefined agree.
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(2000, Math.floor(limitRaw)))
    : 500;
  const out: { limit: number; min_severity?: string; bbox?: string } = { limit };
  const sev = params?.min_severity;
  if (typeof sev === 'string') {
    const valid = ['low', 'moderate', 'high', 'critical'] as const;
    if ((valid as readonly string[]).includes(sev)) out.min_severity = sev;
    // Invalid severity is dropped (documented) — never broadened, never sent.
  }
  const bbox = params?.bbox;
  if (typeof bbox === 'string' && bbox.trim() !== '') {
    // Malformed bbox => no key at all (no provider call on invalid input).
    if (parseBbox(bbox).error) return null;
    out.bbox = bbox.trim();
  }
  return out;
}

/**
 * Canonical SWR key for a layer request — the exact request path, so the
 * key and the fetched URL can never diverge. Null disables fetching
 * (no/invalid layer or params): SWR issues no request and reports no error.
 */
export function buildLayerDataKey(
  layerId: string | null,
  params?: UseLayerDataOptions,
): string | null {
  if (layerId === null || !(LAYER_IDS as readonly string[]).includes(layerId)) return null;
  const normalized = normalizeLayerDataParams(params);
  if (normalized === null) return null;
  return buildLayerDataPath(layerId, normalized);
}

// --- Ref-counted abort registry -------------------------------------------
// One AbortController per in-flight key, shared by deduplicated consumers.
// Releasing the last consumer aborts the fetch; a lone unmount can never
// kill another consumer's shared request (tested). Entries are deleted on
// release-to-zero, so the registry cannot grow without bound.
interface KeyEntry {
  controller: AbortController;
  refs: number;
}

const keyEntries = new Map<string, KeyEntry>();

export function retainLayerKey(key: string): void {
  const entry = keyEntries.get(key);
  if (entry) entry.refs += 1;
  else keyEntries.set(key, { controller: new AbortController(), refs: 1 });
}

export function releaseLayerKey(key: string): void {
  const entry = keyEntries.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    keyEntries.delete(key);
    try {
      entry.controller.abort();
    } catch {
      /* abort must never throw */
    }
  }
}

function signalForLayerKey(key: string): AbortSignal {
  let entry = keyEntries.get(key);
  if (!entry || entry.controller.signal.aborted) {
    entry = { controller: new AbortController(), refs: entry?.refs ?? 0 };
    keyEntries.set(key, entry);
  }
  return entry.controller.signal;
}

/** Test seam: forget all registry state. */
export function resetLayerKeyRegistryForTests(): void {
  keyEntries.clear();
}

// --- Retry classification --------------------------------------------------

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * Retryable = network-level failure (no status), HTTP 429 (special-cased
 * with Retry-After), or HTTP 5xx. Never: caller aborts, client timeouts
 * (slow upstream — retrying heavy routes multiplies load; the user
 * refreshes explicitly), or ordinary 4xx (validation/auth/not-found).
 */
export function isRetryableLayerError(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (err.status === undefined) return true;
    if (err.status === 429) return true;
    return err.status >= 500;
  }
  return false;
}

/** Bounded delay for an attempt (retryCount starts at 1): expo + jitter, capped. */
export function layerRetryDelayMs(err: unknown, retryCount: number): number {
  if (err instanceof ApiError && err.status === 429) {
    return Math.min(err.retryAfterSec ?? 1, LAYER_429_MAX_WAIT_SEC) * 1000;
  }
  const backoff = LAYER_RETRY_BASE_MS * 2 ** Math.max(0, retryCount - 1);
  return Math.min(backoff + Math.random() * LAYER_RETRY_JITTER_MS, LAYER_RETRY_MAX_MS);
}

type OnErrorRetry = NonNullable<SWRConfiguration['onErrorRetry']>;

/**
 * Shared fetcher: key IS the canonical request path. Derives everything
 * from the key argument (never a stale closure) and borrows the registry
 * signal for its key.
 */
async function fetchLayerDataKey(key: string): Promise<LayerDataEnvelope> {
  const signal = signalForLayerKey(key);
  const { data, meta } = await api.fetchLayerDataPath(key, { signal });
  return { data, meta: { cacheHit: meta.cache_hit ?? null } };
}

export interface UseLayerDataResult {
  data: LayerData | null;
  /** True during initial load and revalidation (preserves the refetch-spinner UX). */
  loading: boolean;
  /** True during any revalidation (new; background-aware callers). */
  validating: boolean;
  error: Error | null;
  dataStatus: DataStatus | null;
  meta: LayerDataMeta;
  refetch: () => void;
}

/**
 * Typed SWR layer-data hook (T3.6). Same name/signature/return shape as the
 * previous fetch-in-effect hook, plus `validating` and server `meta`:
 * - null key (no/invalid layer or params) fetches nothing, errors nothing.
 * - identical concurrent keys share one request (SWR dedupe); changing the
 *   key never lets an obsolete response win (SWR key scoping + no
 *   keepPreviousData across layers).
 * - same-key revalidation keeps showing current data while refreshing.
 * - aborts are ref-counted per key (see registry above).
 */
export function useLayerData(layerId: LayerId | null, options?: UseLayerDataOptions): UseLayerDataResult {
  const key = buildLayerDataKey(layerId, options);
  const mountedRef = useRef(true);
  const activeKeyRef = useRef<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    activeKeyRef.current = key;
  }, [key]);

  useEffect(() => {
    if (!key) return;
    retainLayerKey(key);
    return () => releaseLayerKey(key);
  }, [key]);

  const onErrorRetry: OnErrorRetry = useCallback(
    (err, retryKey, _config, revalidate, { retryCount }) => {
      if (!mountedRef.current) return;
      // Obsolete mid-backoff (layer switched): never refetch a dead key.
      if (retryKey !== activeKeyRef.current) return;
      if (isAbortError(err)) return;
      if (err instanceof ApiError && err.status === 429) {
        if (retryCount > LAYER_429_MAX_ATTEMPTS) return;
      } else {
        if (!isRetryableLayerError(err)) return;
        if (retryCount > LAYER_RETRY_MAX_ATTEMPTS) return;
      }
      const delay = layerRetryDelayMs(err, retryCount);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        if (retryKey !== activeKeyRef.current) return;
        void revalidate({ retryCount });
      }, delay);
    },
    [],
  );

  const swr = useSWR<LayerDataEnvelope>(key, fetchLayerDataKey, {
    dedupingInterval: 2000,
    // Heavy-route quota protection: no focus polling (explicit Refresh
    // exists); reconnect still revalidates; no interval polling.
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    refreshInterval: 0,
    keepPreviousData: false,
    onErrorRetry,
  });

  const envelope = swr.data ?? null;
  const { mutate } = swr;
  const refetch = useCallback(() => {
    void mutate();
  }, [mutate]);

  return {
    data: envelope?.data ?? null,
    loading: swr.isLoading || swr.isValidating,
    validating: swr.isValidating,
    error: (swr.error as Error | undefined) ?? null,
    dataStatus: envelope?.data?.data_status ?? null,
    meta: { cacheHit: envelope?.meta.cacheHit ?? null },
    refetch,
  };
}

// --- Conservative idle prefetch --------------------------------------------

/**
 * Idle-prefetch policy (T3.6 §8): exactly one candidate — the earthquakes
 * layer (the T3.8-designated default; the most likely next selection from
 * first-run) — scheduled via requestIdleCallback (3 s setTimeout fallback),
 * skipped when hidden/offline/active/already-cached, cancelled on layer
 * change or unmount, silent on failure, reusing the canonical key/fetcher
 * so a later selection hits SWR cache with zero new traffic. Bounded by
 * construction: one key, one attempt per schedule, no retries.
 */
export const PREFETCH_CANDIDATE_LAYER: LayerId = 'earthquakes';
export const PREFETCH_FALLBACK_DELAY_MS = 3000;

export function shouldIdlePrefetch(
  activeLayer: LayerId | null,
  visibilityState: string,
  onLine: boolean,
): boolean {
  if (activeLayer === PREFETCH_CANDIDATE_LAYER) return false;
  if (visibilityState !== 'visible') return false;
  if (onLine === false) return false;
  return true;
}

export function useIdlePrefetchLayer(activeLayer: LayerId | null): void {
  const activeLayerRef = useRef(activeLayer);
  useEffect(() => {
    activeLayerRef.current = activeLayer;
  }, [activeLayer]);

  useEffect(() => {
    if (
      !shouldIdlePrefetch(
        activeLayer,
        typeof document === 'undefined' ? 'visible' : document.visibilityState,
        typeof navigator === 'undefined' ? true : navigator.onLine,
      )
    ) {
      return;
    }
    const key = buildLayerDataKey(PREFETCH_CANDIDATE_LAYER, { limit: 500 });
    if (!key) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (activeLayerRef.current === PREFETCH_CANDIDATE_LAYER) return;
      void preload(key, () => fetchLayerDataKey(key)).catch(() => {
        /* prefetch failures stay silent by design */
      });
    };
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let id: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (typeof w.requestIdleCallback === 'function') {
      id = w.requestIdleCallback(run, { timeout: 5000 });
    } else {
      timer = setTimeout(run, PREFETCH_FALLBACK_DELAY_MS);
    }
    return () => {
      cancelled = true;
      if (id !== null) w.cancelIdleCallback?.(id);
      if (timer !== null) clearTimeout(timer);
    };
  }, [activeLayer]);
}
