import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  filterValidPoints,
  isValidCoordinate,
  latLonToVec3,
  latLonToVec3Into,
  quaternionForLatLon,
  setFromUnitVectors,
} from './geo';
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

describe('latLonToVec3', () => {
  it('maps equator/prime-meridian to +X with the given radius', () => {
    const v = latLonToVec3(0, 0, 5);
    expect(v.x).toBeCloseTo(5, 10);
    expect(v.y).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(0, 10);
  });

  it('produces unit-sphere * radius vectors', () => {
    for (const [lat, lon] of [[45, 90], [-33.8, 151.2], [0, -122]] as const) {
      const v = latLonToVec3(lat, lon, 5);
      expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(5, 10);
    }
  });

  it('writes into a caller-owned object with Into (no allocation)', () => {
    const out = { x: 0, y: 0, z: 0 };
    const returned = latLonToVec3Into(out, 10, 20, 5);
    expect(returned).toBe(out);
    const fresh = latLonToVec3(10, 20, 5);
    expect(out).toEqual(fresh);
  });
});

describe('quaternionForLatLon (T4.5 three-free port)', () => {
  // THREE is imported here for PARITY ONLY — this test file never ships,
  // so three.js stays out of the production initial bundle while the
  // port is still verified against the real implementation.
  it('matches THREE.Quaternion.setFromUnitVectors across a coordinate grid', () => {
    const lats = [-90, -45, -23.4, 0, 12, 45, 66.5, 90];
    const lons = [-180, -122, -45, 0, 20, 139.6, 180];
    for (const lat of lats) {
      for (const lon of lons) {
        const q = quaternionForLatLon(lat, lon);
        const v = new THREE.Vector3();
        // Mirror of the old implementation: unit vector then setFromUnitVectors.
        const phi = ((90 - lat) * Math.PI) / 180;
        const theta = ((lon + 180) * Math.PI) / 180;
        v.set(
          -Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta),
        ).normalize();
        const expected = new THREE.Quaternion().setFromUnitVectors(
          v,
          new THREE.Vector3(0, 0, 1),
        );
        expect(q.x).toBeCloseTo(expected.x, 10);
        expect(q.y).toBeCloseTo(expected.y, 10);
        expect(q.z).toBeCloseTo(expected.z, 10);
        expect(q.w).toBeCloseTo(expected.w, 10);
        // Unit quaternion invariant.
        expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 10);
      }
    }
  });

  it('handles the antiparallel guard exactly like three.js', () => {
    const out = { x: 0, y: 0, z: 0, w: 0 };
    setFromUnitVectors(out, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 });
    const expected = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0, 1),
    );
    expect(out.x).toBeCloseTo(expected.x, 10);
    expect(out.y).toBeCloseTo(expected.y, 10);
    expect(out.z).toBeCloseTo(expected.z, 10);
    expect(out.w).toBeCloseTo(expected.w, 10);
  });
});
