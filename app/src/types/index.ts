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

export type LayerId = (typeof LAYER_IDS)[number];
