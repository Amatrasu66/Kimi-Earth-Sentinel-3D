import type { DataPoint, DataStatus, LayerId } from '@/types';

/** Human-readable value + unit per layer (Phase 12 — no raw values without context). */
export function formatPointValue(point: DataPoint, layerId: LayerId | null): string | null {
  if (point.magnitude !== undefined) return `M${point.magnitude}`;
  if (point.value === undefined) return null;
  const unit = point.unit ?? unitForLayer(layerId);
  switch (layerId) {
    case 'temperature':
      return `${point.value} °C`;
    case 'precipitation':
      return `${point.value} mm`;
    case 'clouds':
      return `${point.value} %`;
    case 'air_quality':
      return `AQI ${point.value}`;
    case 'wind':
      return `${point.value} km/h`;
    case 'wildfires':
      return `brightness ${point.value}`;
    default:
      return unit ? `${point.value} ${unit}` : String(point.value);
  }
}

export function unitForLayer(layerId: LayerId | null): string | undefined {
  switch (layerId) {
    case 'temperature':
      return '°C';
    case 'precipitation':
      return 'mm';
    case 'clouds':
      return '%';
    case 'air_quality':
      return 'AQI';
    case 'wind':
      return 'km/h';
    case 'wildfires':
      return 'brightness';
    case 'earthquakes':
      return 'magnitude';
    default:
      return undefined;
  }
}

export function metricLabelForLayer(layerId: LayerId | null): string {
  switch (layerId) {
    case 'temperature':
      return 'Temperature';
    case 'precipitation':
      return 'Precipitation';
    case 'clouds':
      return 'Cloud cover';
    case 'air_quality':
      return 'Air quality';
    case 'wind':
      return 'Wind speed';
    case 'wildfires':
      return 'Fire brightness';
    case 'earthquakes':
      return 'Magnitude';
    case 'disasters':
      return 'Event';
    default:
      return 'Value';
  }
}

/** "Updated 2 min ago" style relative time; falls back to locale date. */
export function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return 'unknown';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'unknown';
  const secs = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** "12.34°N, 56.78°W" — handles all hemispheres (BottomBar fix). */
export function formatCoordinates(lat: number, lon: number): string {
  const latStr = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lonStr}`;
}

export function statusLabel(status: DataStatus | undefined): string {
  switch (status?.status) {
    case 'live':
      return 'LIVE';
    case 'simulated':
      return 'SIMULATED';
    case 'stale':
      return 'STALE';
    case 'unavailable':
      return 'UNAVAILABLE';
    default:
      return 'UNKNOWN';
  }
}
