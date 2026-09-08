import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { filterValidPoints, isValidCoordinate, latLonToVector3 } from './geo';
import type { DataPoint } from '@/types';

const point = (id: string, lat: unknown, lon: unknown): DataPoint =>
  ({ id, lat, lon, severity: 'low', timestamp: '2026-01-01T00:00:00Z' }) as DataPoint;

describe('isValidCoordinate', () => {
  it('accepts in-range finite numbers', () => {
    expect(isValidCoordinate(35.6, 139.6)).toBe(true);
    expect(isValidCoordinate(-90, -180)).toBe(true);
    expect(isValidCoordinate(90, 180)).toBe(true);
  });

  it('rejects NaN, Infinity, out-of-range, and non-numbers', () => {
    expect(isValidCoordinate(Number.NaN, 0)).toBe(false);
    expect(isValidCoordinate(0, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(0, 181)).toBe(false);
    expect(isValidCoordinate('35', 139)).toBe(false);
    expect(isValidCoordinate(null, undefined)).toBe(false);
  });
});

describe('filterValidPoints (canonical marker mapping)', () => {
  it('keeps index alignment after dropping invalid records', () => {
    const points = [
      point('a', 10, 20),
      point('bad-1', Number.NaN, 20),
      point('b', -45, 170),
      point('bad-2', 10, 999),
      point('c', 0, 0),
    ];
    const valid = filterValidPoints(points);
    // Rendered instance N must equal data point N in this array.
    expect(valid.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    valid.forEach((p, i) => expect(valid[i]).toBe(p));
  });
});

describe('latLonToVector3', () => {
  it('maps equator/prime-meridian to +X with the given radius', () => {
    const v = latLonToVector3(0, 0, 5);
    expect(v.x).toBeCloseTo(5);
    expect(v.y).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(0, 10);
  });

  it('produces unit-sphere * radius vectors', () => {
    for (const [lat, lon] of [[45, 90], [-33.8, 151.2], [0, -122]] as const) {
      const v = latLonToVector3(lat, lon, 5);
      expect(v.length()).toBeCloseTo(5);
      expect(v).toBeInstanceOf(THREE.Vector3);
    }
  });
});
