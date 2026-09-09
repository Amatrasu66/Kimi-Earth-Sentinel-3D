export type DataStatusKind = 'live' | 'simulated' | 'stale' | 'unavailable';

/** Provenance block returned with every layer payload (see backend utils/provenance.py). */
export interface DataStatus {
  status: DataStatusKind;
  source: string;
  fetched_at: string;
  message?: string | null;
}

export interface DataPoint {
  id: string;
  lat: number;
  lon: number;
  value?: number;
  magnitude?: number;
  depth?: number;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  timestamp: string;
  title?: string;
  description?: string;
  location?: string;
  type?: string;
  unit?: string;
  url?: string;
  [key: string]: unknown;
}

export interface LayerMetadata {
  id: string;
  name: string;
  description: string;
  icon: string;
  source: string;
  refresh_interval: number;
  enabled: boolean;
  color_scale?: string[];
  unit?: string;
}

export interface LayerData {
  layer_id: string;
  count: number;
  points: DataPoint[];
  stats?: Record<string, unknown>;
  unit?: string;
  warnings?: string[];
  /** Provenance: always present on backend responses (Phase 6). */
  data_status?: DataStatus;
}

export interface HeatmapData {
  layer_id: string;
  resolution: number;
  grid: string;
  min_value: number;
  max_value: number;
  unit: string;
  timestamp: string;
  data_status?: DataStatus;
}

export interface EventDetail {
  id: string;
  layer_id: string;
  type: string;
  title: string;
  lat: number;
  lon: number;
  timestamp: string;
  description?: string;
  severity: string;
  magnitude?: number;
  depth?: number;
  source?: { name: string; url: string };
  impact?: Record<string, unknown>;
  related_events?: Array<{ id: string; title: string; timestamp: string }>;
  geometry?: { type: string; coordinates: number[] };
}

export interface SearchResult {
  id: string;
  type: 'location' | 'event';
  name: string;
  lat: number;
  lon: number;
  country?: string;
  population?: number;
  snippet?: string;
  layer?: string;
  timestamp?: string;
}

export interface GlobalStats {
  global: {
    active_events: number;
    earthquakes_24h: number;
    avg_temperature_anomaly: number;
    precipitation_status: string;
    air_quality_avg: number;
    wildfire_count: number;
    severe_weather_alerts: number;
  };
  by_region: Record<string, {
    events: number;
    severity_index: number;
    top_threat: string;
  }>;
  timestamp: string;
}

export type SeverityLevel = 'low' | 'moderate' | 'high' | 'critical';

export const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  low: '#FFC31F',
  moderate: '#FF8C00',
  high: '#FF4500',
  critical: '#FF0000',
};

export const LAYER_IDS = [
  'earthquakes',
  'disasters',
  'wildfires',
  'temperature',
  'precipitation',
  'air_quality',
  'clouds',
  'wind',
] as const;

// Layer-system extension points (Phase 13):
// - Today exactly one layer is active at a time (`activeLayer` in App).
// - To composite layers (e.g. Temperature + Earthquakes), replace
//   `activeLayer: LayerId | null` with `visibleLayers: LayerId[]` plus a
//   per-layer `opacity` map; MarkerSystem already renders any DataPoint[]
//   so it can take concatenated points with per-layer instance colors.
// - Legends, severity filters and time ranges are per-layer concerns;
//   see DataPanel for the current single-layer implementation to extend.

export type LayerId = (typeof LAYER_IDS)[number];
