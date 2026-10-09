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

async function fetchApi<T>(path: string, options?: FetchOptions): Promise<T> {
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
    throw new Error('Network error — is the API reachable?');
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }

  let result: ApiResponse<T>;
  try {
    result = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || `API error: ${response.status} ${response.statusText}`);
  }

  return result.data;
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
    const query = new URLSearchParams();
    if (params?.bbox) query.set('bbox', params.bbox);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.min_severity) query.set('min_severity', params.min_severity);
    const qs = query.toString();
    return fetchApi<import('@/types').LayerData>(
      `/layers/${layerId}/data${qs ? `?${qs}` : ''}`,
      opts,
    );
  },

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

  // Stats
  getStats: (opts?: RequestOptions) => fetchApi<import('@/types').GlobalStats>('/stats', opts),

  getHistorical: (metric: string, period?: string, aggregation?: string, opts?: RequestOptions) => {
    const params = new URLSearchParams();
    params.set('metric', metric);
    if (period) params.set('period', period);
    if (aggregation) params.set('aggregation', aggregation);
    return fetchApi<{
      metric: string;
      period: string;
      aggregation: string;
      values: Array<{ date: string; [key: string]: number | string }>;
    }>(`/stats/historical?${params.toString()}`, opts);
  },

  // Health
  getHealth: (opts?: RequestOptions) =>
    fetchApi<{ status: string; service: string; version: string; timestamp: string; started_at: string }>('/health', opts),

  // Geocode
  reverseGeocode: (lat: number, lon: number, opts?: RequestOptions) => {
    return fetchApi<{ name: string; country: string; region: string; timezone: string }>(
      `/geocode/reverse?lat=${lat}&lon=${lon}`,
      opts,
    );
  },

  // Timezones (simulated longitude approximation — see backend)
  getTimezone: (lat: number, lon: number, opts?: RequestOptions) => {
    return fetchApi<{ timezone: string; offset_hours: number; name: string }>(
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
