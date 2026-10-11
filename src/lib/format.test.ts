import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  formatAge,
  formatCoordinates,
  formatPointValue,
  formatRelativeTime,
  statusLabel,
  unitForLayer,
} from './format';
import type { DataPoint } from '@/types';

const point = (overrides: Partial<DataPoint> = {}): DataPoint =>
  ({
    id: 'p1',
    lat: 0,
    lon: 0,
    severity: 'low',
    timestamp: '2026-01-01T00:00:00Z',
    ...overrides,
  }) as DataPoint;

describe('formatPointValue', () => {
  it('never shows raw values without units', () => {
    expect(formatPointValue(point({ value: 21.5 }), 'temperature')).toBe('21.5 °C');
    expect(formatPointValue(point({ value: 12 }), 'precipitation')).toBe('12 mm');
    expect(formatPointValue(point({ value: 80 }), 'clouds')).toBe('80 %');
    expect(formatPointValue(point({ value: 95 }), 'air_quality')).toBe('AQI 95');
    expect(formatPointValue(point({ value: 40 }), 'wind')).toBe('40 km/h');
    expect(formatPointValue(point({ value: 380.2 }), 'wildfires')).toBe('brightness 380.2');
    expect(formatPointValue(point({ magnitude: 5.2 }), 'earthquakes')).toBe('M5.2');
  });

  it('returns null when there is nothing to show', () => {
    expect(formatPointValue(point(), 'temperature')).toBeNull();
  });
});

describe('unitForLayer', () => {
  it('covers every active layer', () => {
    expect(unitForLayer('temperature')).toBe('°C');
    expect(unitForLayer('earthquakes')).toBe('magnitude');
    expect(unitForLayer(null)).toBeUndefined();
  });
});

describe('formatCoordinates', () => {
  it('handles all hemispheres', () => {
    expect(formatCoordinates(12.34567, -56.789)).toBe('12.3457°N, 56.7890°W');
    expect(formatCoordinates(-33.8, 151.2)).toBe('33.8000°S, 151.2000°E');
  });
});

describe('formatRelativeTime', () => {
  afterEach(() => vi.useRealTimers());

  it('buckets recent timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    expect(formatRelativeTime('2026-06-01T11:59:30Z')).toBe('30s ago');
    expect(formatRelativeTime('2026-06-01T11:55:00Z')).toBe('5 min ago');
    expect(formatRelativeTime('2026-06-01T10:00:00Z')).toBe('2h ago');
    expect(formatRelativeTime(undefined)).toBe('unknown');
    expect(formatRelativeTime('not-a-date')).toBe('unknown');
  });
});

describe('formatAge (T3.7 provenance freshness)', () => {
  const NOW = new Date('2026-06-01T12:00:00Z').getTime();

  it('buckets valid fetched_at values against the supplied clock', () => {
    expect(formatAge('2026-06-01T11:59:55Z', NOW)).toBe('just now');
    expect(formatAge('2026-06-01T11:59:30Z', NOW)).toBe('30s ago');
    expect(formatAge('2026-06-01T11:55:00Z', NOW)).toBe('5 min ago');
    expect(formatAge('2026-06-01T10:00:00Z', NOW)).toBe('2h ago');
    expect(formatAge('2026-05-29T12:00:00Z', NOW)).toBe('3d ago');
  });

  it('returns null for missing or invalid timestamps (explicit unknown, never fabricated)', () => {
    expect(formatAge(undefined, NOW)).toBeNull();
    expect(formatAge(null, NOW)).toBeNull();
    expect(formatAge('', NOW)).toBeNull();
    expect(formatAge('not-a-date', NOW)).toBeNull();
  });

  it('never substitutes request time: age derives only from fetched_at + the given now', () => {
    // Same fetched_at, different clocks → different ages (pure in both args).
    expect(formatAge('2026-06-01T11:00:00Z', NOW)).toBe('1h ago');
    expect(formatAge('2026-06-01T11:00:00Z', NOW + 3_600_000)).toBe('2h ago');
    // Future timestamps clamp to "just now" rather than going negative.
    expect(formatAge('2026-06-01T12:05:00Z', NOW)).toBe('just now');
  });
});

describe('statusLabel', () => {
  it('maps every known status and unknown', () => {
    const base = { source: 'X', fetched_at: '2026-01-01T00:00:00Z' } as const;
    expect(statusLabel({ ...base, status: 'live' })).toBe('LIVE');
    expect(statusLabel({ ...base, status: 'simulated' })).toBe('SIMULATED');
    expect(statusLabel({ ...base, status: 'stale' })).toBe('STALE');
    expect(statusLabel({ ...base, status: 'unavailable' })).toBe('UNAVAILABLE');
    expect(statusLabel(undefined)).toBe('UNKNOWN');
  });
});
