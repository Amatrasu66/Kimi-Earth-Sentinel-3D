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
  lat: number | null;
  lon: number | null;
  timestamp: string | null;
  description?: string | null;
  severity: string;
  magnitude?: number | null;
  depth?: number | null;
  source?: { name: string; url: string };
  impact?: Record<string, unknown>;
  related_events?: Array<{ id: string; title: string; timestamp: string }>;
  geometry?: { type: string; coordinates: number[] };
  /** Live-lookup fields (present on provider details, absent on fallbacks). */
  provider?: string;
  updated_at?: string | null;
  magnitude_unit?: string | null;
  status?: string | null;
  closed_at?: string | null;
  categories?: string[] | null;
  geometry_type?: string | null;
  sources?: Array<{ id: string; url: string }>;
  felt?: number | null;
  alert?: string | null;
  tsunami?: boolean | null;
  significance?: number | null;
  /** FIRMS observation fields (present on live wildfire details, T2.3). */
  satellite?: string | null;
  instrument?: string | null;
  brightness?: number | null;
  frp?: number | null;
  confidence?: string | null;
  daynight?: string | null;
  acq_date?: string | null;
  acq_time?: string | null;
  /** Provenance: present on backend responses (live / simulated / stale). */
  data_status?: DataStatus;
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
  /** First-level administrative area (live geocoding rows, T2.6). */
  admin1?: string;
  /** ISO-3166-1 alpha2 country code (live geocoding rows, T2.6). */
  country_code?: string;
  /** Per-result source: live rows name the provider, bundled rows the index. */
  source?: string;
}

/**
 * T2.7 real statistics overview (no UI consumer yet — shape mirrors the
 * route payload). Every metric is null when its source is unavailable;
 * per-source statuses in `sources` say which. Fabricated fields from the old
 * simulated rollup (temperature anomaly, precipitation, AQI average, alert
 * counts, by_region severity) are removed — they had no provider.
 */
export interface GlobalStats {
  window: { start: string; end: string };
  global: {
    earthquakes_24h: number | null;
    max_magnitude_24h: number | null;
    max_magnitude_time: string | null;
    active_events: number | null;
    wildfire_count: number | null;
    max_brightness: number | null;
  };
  sources: {
    earthquakes: DataStatus;
    disasters: DataStatus;
    wildfires: DataStatus;
  };
  timestamp: string;
}

export interface HistoryBucket {
  start: string;
  end: string;
  count: number;
  max_magnitude: number | null;
  avg_magnitude: number | null;
  max_brightness: number | null;
  by_category: Record<string, number> | null;
}

export interface HistoricalStats {
  metric: string;
  period: string;
  granularity: string | null;
  start: string | null;
  end: string | null;
  values: HistoryBucket[];
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
