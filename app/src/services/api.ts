const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api/v1';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    timestamp: string;
    cache_hit?: boolean;
    source?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const result: ApiResponse<T> = await response.json();
  
  if (!result.success) {
    throw new Error(result.error?.message || 'Unknown API error');
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
    return fetchApi<import('@/types').LayerData>(`/layers/${layerId}/data?${query.toString()}`);
  },

  getLayerHeatmap: (layerId: string, params?: { resolution?: number; time_range?: string }) => {
    const query = new URLSearchParams();
    if (params?.resolution) query.set('resolution', params.resolution.toString());
    if (params?.time_range) query.set('time_range', params.time_range);
    return fetchApi<{ layer_id: string; resolution: number; grid: string; min_value: number; max_value: number; unit: string; timestamp: string }>(`/layers/${layerId}/heatmap?${query.toString()}`);
  },

  // Events
  getEvent: (eventId: string) => fetchApi<import('@/types').EventDetail>(`/events/${eventId}`),

  // Search
  search: (query: string, type?: string, limit?: number) => {
    const params = new URLSearchParams();
    params.set('q', query);
    if (type) params.set('type', type);
    if (limit) params.set('limit', limit.toString());
    return fetchApi<{ query: string; results: import('@/types').SearchResult[] }>(`/search?${params.toString()}`);
  },

  // Stats
  getStats: () => fetchApi<import('@/types').GlobalStats>('/stats'),
  
  getHistorical: (metric: string, period?: string, aggregation?: string) => {
    const params = new URLSearchParams();
    params.set('metric', metric);
    if (period) params.set('period', period);
    if (aggregation) params.set('aggregation', aggregation);
    return fetchApi<{ metric: string; period: string; aggregation: string; values: Array<{ date: string; [key: string]: number | string }> }>(`/stats/historical?${params.toString()}`);
  },

  // Health
  getHealth: () => fetchApi<{ status: string; version: string; apis: Record<string, string> }>('/health'),

  // Geocode
  reverseGeocode: (lat: number, lon: number) => {
    return fetchApi<{ name: string; country: string; region: string; timezone: string }>(`/geocode/reverse?lat=${lat}&lon=${lon}`);
  },

  // GIBS Imagery
  getGibsCapabilities: () => fetchApi<{ layers: Array<{ id: string; name: string; projection: string; format: string }> }>('/imagery/gibs/capabilities'),
};
