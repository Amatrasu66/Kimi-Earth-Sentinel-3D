/**
 * Centralized API configuration (Phase 20).
 *
 * Development: VITE_API_BASE_URL=http://localhost:5001/api/v1
 * Production:  VITE_API_BASE_URL=https://<render-backend>.onrender.com/api/v1
 *
 * VITE_API_URL is honoured as a legacy fallback. No component may hardcode
 * a host — everything goes through API_BASE below.
 */
const rawBase =
  import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:5001/api/v1';

export const API_BASE = String(rawBase).replace(/\/+$/, '');

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

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  } catch (err) {
    throw new Error(
      err instanceof DOMException && err.name === 'AbortError'
        ? 'Request timed out — the API did not respond in time.'
        : 'Network error — is the API reachable?',
    );
  } finally {
    clearTimeout(timeout);
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
  getLayers: () => fetchApi<{ layers: import('@/types').LayerMetadata[] }>('/layers'),

  getLayerData: (layerId: string, params?: { bbox?: string; limit?: number; min_severity?: string }) => {
    const query = new URLSearchParams();
    if (params?.bbox) query.set('bbox', params.bbox);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.min_severity) query.set('min_severity', params.min_severity);
    const qs = query.toString();
    return fetchApi<import('@/types').LayerData>(`/layers/${layerId}/data${qs ? `?${qs}` : ''}`);
  },

  getLayerHeatmap: (layerId: string, params?: { resolution?: number; time_range?: string }) => {
    const query = new URLSearchParams();
    if (params?.resolution) query.set('resolution', params.resolution.toString());
    if (params?.time_range) query.set('time_range', params.time_range);
    const qs = query.toString();
    return fetchApi<import('@/types').HeatmapData>(`/layers/${layerId}/heatmap${qs ? `?${qs}` : ''}`);
  },

  // Events
  getEvent: (eventId: string) =>
    fetchApi<import('@/types').EventDetail>(`/events/${encodeURIComponent(eventId)}`),

  // Search
  search: (query: string, type?: string, limit?: number) => {
    const params = new URLSearchParams();
    params.set('q', query);
    if (type) params.set('type', type);
    if (limit) params.set('limit', limit.toString());
    return fetchApi<{ query: string; results: import('@/types').SearchResult[] }>(
      `/search?${params.toString()}`,
    );
  },

  // Stats
  getStats: () => fetchApi<import('@/types').GlobalStats>('/stats'),

  getHistorical: (metric: string, period?: string, aggregation?: string) => {
    const params = new URLSearchParams();
    params.set('metric', metric);
    if (period) params.set('period', period);
    if (aggregation) params.set('aggregation', aggregation);
    return fetchApi<{
      metric: string;
      period: string;
      aggregation: string;
      values: Array<{ date: string; [key: string]: number | string }>;
    }>(`/stats/historical?${params.toString()}`);
  },

  // Health
  getHealth: () =>
    fetchApi<{ status: string; service: string; version: string; timestamp: string }>('/health'),

  // Geocode
  reverseGeocode: (lat: number, lon: number) => {
    return fetchApi<{ name: string; country: string; region: string; timezone: string }>(
      `/geocode/reverse?lat=${lat}&lon=${lon}`,
    );
  },

  // GIBS Imagery
  getGibsCapabilities: () =>
    fetchApi<{ layers: Array<{ id: string; name: string; projection: string; format: string }> }>(
      '/imagery/gibs/capabilities',
    ),
};
