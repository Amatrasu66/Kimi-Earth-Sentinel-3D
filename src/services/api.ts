/**
 * Centralized API configuration (Next.js: same-origin backend).
 *
 * The API lives in this same Next.js application under /api/v1, so the base
 * is a relative same-origin constant — no environment variables, no Render
 * URLs, no localhost fallbacks, no CORS. (Ported from the Vite frontend's
 * services/api.ts; request semantics — timeout, AbortSignal merging, error
 * normalization — are unchanged.)
 */
export const API_BASE = '/api/v1';

export type ApiBaseSource = 'same-origin';

export interface ResolvedApiConfig {
  base: string;
  source: ApiBaseSource;
  /** Always null: same-origin base cannot be misconfigured. */
  error: string | null;
}

/**
 * Pure resolver — kept for test compatibility. Always resolves same-origin;
 * inputs are accepted (legacy call sites) but intentionally ignored.
 */
export function resolveApiConfig(
  _env?: { baseUrl?: unknown; legacyUrl?: unknown },
  _isProduction?: boolean,
): ResolvedApiConfig {
  void _env;
  void _isProduction;
  return { base: API_BASE, source: 'same-origin', error: null };
}

export const API_BASE_SOURCE: ApiBaseSource = 'same-origin';
export const API_CONFIG_ERROR: string | null = null;
export const IS_PRODUCTION_BUILD = process.env.NODE_ENV === 'production';

/** Safe diagnostic snapshot for the Settings → Diagnostics panel. No secrets. */
export function getApiConfig(): ResolvedApiConfig & { isProduction: boolean } {
  return { base: API_BASE, source: API_BASE_SOURCE, error: API_CONFIG_ERROR, isProduction: IS_PRODUCTION_BUILD };
}

const REQUEST_TIMEOUT_MS = 15000;

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    timestamp: string;
    cache_hit?: boolean;
    cached_at?: string | null;
    source?: string;
    data_status?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export type { ApiResponse };

interface FetchOptions extends RequestInit {
  /** Per-request timeout override (ms). Defaults to REQUEST_TIMEOUT_MS. */
  timeoutMs?: number;
}

/** Extra per-call options accepted by api methods (cancellation/timeout). */
export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Typed API failure (T3.6): extends Error so existing `toThrow(message)`
 * expectations keep passing, while carrying the status/code/Retry-After the
 * SWR retry policy needs. Caller-abort and client-timeout keep the plain
 * `AbortError` name (existing contract); everything else arrives here.
 */
export class ApiError extends Error {
  /** HTTP status when the failure came from a response (undefined = network-level). */
  status?: number;
  /** Server error code from the `{ success:false, error:{code} }` envelope. */
  code?: string;
  /** Parsed `Retry-After` seconds (429s only, capped server-side at 60). */
  retryAfterSec?: number;

  constructor(message: string, opts?: { status?: number; code?: string; retryAfterSec?: number }) {
    super(message);
    this.name = 'ApiError';
    this.status = opts?.status;
    this.code = opts?.code;
    this.retryAfterSec = opts?.retryAfterSec;
  }
}

export interface EnvelopeMeta {
  timestamp: string;
  cache_hit?: boolean;
  cached_at?: string | null;
  stale?: boolean;
  source?: string | null;
  data_status?: string | null;
}

/** Parse a `Retry-After` header value into seconds (delta or HTTP date). */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.floor(seconds), 60);
  const at = Date.parse(value);
  if (!Number.isNaN(at)) return Math.max(0, Math.min(Math.round((at - Date.now()) / 1000), 60));
  return undefined;
}

async function fetchEnvelope<T>(
  path: string,
  options?: FetchOptions,
): Promise<{ data: T; meta: EnvelopeMeta; retryAfterSec?: number }> {
  if (!API_BASE) {
    throw new Error(API_CONFIG_ERROR ?? 'API is not configured.');
  }
  const { timeoutMs = REQUEST_TIMEOUT_MS, signal: externalSignal, ...init } = options ?? {};
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // Combine the caller-provided signal (unmount / stale request) with the
  // internal timeout so either one cancels the fetch.
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      const aborted = new Error(
        timedOut
          ? 'Request timed out — the API did not respond in time.'
          : 'Request aborted.',
      );
      aborted.name = 'AbortError';
      throw aborted;
    }
    throw new ApiError('Network error — is the API reachable?');
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }

  let result: ApiResponse<T>;
  try {
    result = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(
      `API error: ${response.status} ${response.statusText}`,
      { status: response.status, retryAfterSec: parseRetryAfter(response.headers.get('Retry-After')) },
    );
  }

  if (!response.ok || !result.success) {
    throw new ApiError(result.error?.message || `API error: ${response.status} ${response.statusText}`, {
      status: response.status,
      code: result.error?.code,
      retryAfterSec: parseRetryAfter(response.headers.get('Retry-After')),
    });
  }

  return { data: result.data, meta: result.meta ?? { timestamp: '' } };
}

async function fetchApi<T>(path: string, options?: FetchOptions): Promise<T> {
  return (await fetchEnvelope<T>(path, options)).data;
}

/**
 * Single canonical layer-data path builder (T3.6): the SWR cache key and
 * the fetched URL derive from this one representation, so equivalent
 * parameters can never produce divergent keys. Mirrors the previous inline
 * builder exactly (falsy values omitted, same param order).
 */
export function buildLayerDataPath(
  layerId: string,
  params?: { bbox?: string; limit?: number; min_severity?: string },
): string {
  const query = new URLSearchParams();
  if (params?.bbox) query.set('bbox', params.bbox);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.min_severity) query.set('min_severity', params.min_severity);
  const qs = query.toString();
  return `/layers/${layerId}/data${qs ? `?${qs}` : ''}`;
}

export const api = {
  // Layers
  getLayers: (opts?: RequestOptions) =>
    fetchApi<{ layers: import('@/types').LayerMetadata[] }>('/layers', opts),

  getLayerData: (
    layerId: string,
    params?: { bbox?: string; limit?: number; min_severity?: string },
    opts?: RequestOptions,
  ) => {
    return fetchApi<import('@/types').LayerData>(buildLayerDataPath(layerId, params), opts);
  },

  /**
   * Envelope variant for the SWR data client (T3.6): same request as
   * getLayerData, but preserves `meta` (server `cache_hit`) and surfaces
   * `ApiError` (status/code/Retry-After) for the retry policy. Existing
   * callers keep getLayerData untouched.
   */
  fetchLayerDataPath: (path: string, opts?: RequestOptions) =>
    fetchEnvelope<import('@/types').LayerData>(path, opts),

  getLayerDataEnvelope: (
    layerId: string,
    params?: { bbox?: string; limit?: number; min_severity?: string },
    opts?: RequestOptions,
  ) => {
    return fetchEnvelope<import('@/types').LayerData>(buildLayerDataPath(layerId, params), opts);
  },

  /**
   * Phase 6 scene-search envelope variant: `path` is the canonical key built
   * by `buildSceneSearchPath` (hooks/useSceneSearch), so the SWR key and the
   * fetched URL can never diverge (same pattern as fetchLayerDataPath).
   */
  fetchScenesPath: (path: string, opts?: RequestOptions) =>
    fetchEnvelope<import('@/types').SceneSearchPayload>(path, opts),

  /**
   * Phase 7 scene-raster envelope variant: `path` is the canonical key
   * built by `buildSceneRasterPath` (hooks/useSceneRaster) — same
   * SWR-key/URL coupling as fetchScenesPath.
   */
  fetchSceneRasterPath: (path: string, opts?: RequestOptions) =>
    fetchEnvelope<import('@/types').SceneRasterPayload>(path, opts),

  getLayerHeatmap: (
    layerId: string,
    params?: { resolution?: number; time_range?: string },
    opts?: RequestOptions,
  ) => {
    const query = new URLSearchParams();
    if (params?.resolution) query.set('resolution', params.resolution.toString());
    if (params?.time_range) query.set('time_range', params.time_range);
    const qs = query.toString();
    return fetchApi<import('@/types').HeatmapData>(
      `/layers/${layerId}/heatmap${qs ? `?${qs}` : ''}`,
      opts,
    );
  },

  // Events
  getEvent: (eventId: string, opts?: RequestOptions) =>
    fetchApi<import('@/types').EventDetail>(`/events/${encodeURIComponent(eventId)}`, opts),

  // Search
  search: (query: string, type?: string, limit?: number, opts?: RequestOptions) => {
    const params = new URLSearchParams();
    params.set('q', query);
    if (type) params.set('type', type);
    if (limit) params.set('limit', limit.toString());
    return fetchApi<{ query: string; results: import('@/types').SearchResult[] }>(
      `/search?${params.toString()}`,
      opts,
    );
  },

  // Stats (T2.7: real provider-derived overview; per-source statuses in `sources`)
  getStats: (opts?: RequestOptions) => fetchApi<import('@/types').GlobalStats>('/stats', opts),

  getHistorical: (metric: string, period?: string, opts?: RequestOptions) => {
    const params = new URLSearchParams();
    params.set('metric', metric);
    if (period) params.set('period', period);
    return fetchApi<import('@/types').HistoricalStats>(
      `/stats/historical?${params.toString()}`,
      opts,
    );
  },

  // Health
  getHealth: (opts?: RequestOptions) =>
    fetchApi<{ status: string; service: string; version: string; timestamp: string; started_at: string }>('/health', opts),

  // Geocode (T2.6: honest UNAVAILABLE when no compliant provider applies —
  // fields are null in that case, never a fabricated region)
  reverseGeocode: (lat: number, lon: number, opts?: RequestOptions) => {
    return fetchApi<{
      lat: number;
      lon: number;
      name: string | null;
      country: string | null;
      country_code: string | null;
      region: string | null;
      timezone: string | null;
    }>(
      `/geocode/reverse?lat=${lat}&lon=${lon}`,
      opts,
    );
  },

  // Timezones (T2.6: offline IANA lookup; `timezone` null only when
  // no reliable zone can be established)
  getTimezone: (lat: number, lon: number, opts?: RequestOptions) => {
    return fetchApi<{
      timezone: string | null;
      offset: string | null;
      local_time: string | null;
      approximate: boolean;
    }>(
      `/timezones?lat=${lat}&lon=${lon}`,
      opts,
    );
  },

  // GIBS Imagery
  getGibsCapabilities: (opts?: RequestOptions) =>
    fetchApi<{ layers: Array<{ id: string; name: string; projection: string; format: string }> }>(
      '/imagery/gibs/capabilities',
      opts,
    ),

  /** Direct tile URL (backend 302-redirects to NASA GIBS). Pure builder, no fetch. */
  gibsTileUrl: (layer: string, z: number, x: number, y: number): string =>
    `${API_BASE}/imagery/gibs/tile/${encodeURIComponent(layer)}/${z}/${x}/${y}`,
};
