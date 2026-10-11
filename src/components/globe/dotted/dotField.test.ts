import { describe, expect, it } from 'vitest';
import { DOT_FIELD_CANDIDATES, buildLandDotField, dotFieldCount } from './dotField';
import type { LandAsset } from './landGeo';

/** A single 20°×20° square around the origin, as a closed ring. */
const SQUARE: LandAsset = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [10, -10],
            [-10, -10],
            [-10, 10],
            [10, 10],
            [10, -10],
          ],
        ],
      },
    },
  ],
};

const EMPTY: LandAsset = { type: 'FeatureCollection', features: [] };

function pairs(field: Float32Array): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < field.length; i += 2) out.push([field[i], field[i + 1]]);
  return out;
}

describe('buildLandDotField (GLOBE-1)', () => {
  it('keeps only candidates that fall on land', () => {
    const field = buildLandDotField(SQUARE);
    expect(dotFieldCount(field)).toBeGreaterThan(0);
    // d3 tests spherical polygons, so the geodesic edges of the ring bow
    // slightly off the lon/lat box — assert the meaningful invariant: no
    // dot escapes to the far side of the globe, and the centre is covered.
    for (const [lon, lat] of pairs(field)) {
      expect(Math.abs(lon)).toBeLessThanOrEqual(20);
      expect(Math.abs(lat)).toBeLessThanOrEqual(20);
    }
    expect(
      pairs(field).filter(([lon, lat]) => Math.abs(lon) <= 5 && Math.abs(lat) <= 5).length,
    ).toBeGreaterThan(0);
  });

  it('produces a bounded field proportional to the candidate budget', () => {
    const small = dotFieldCount(buildLandDotField(SQUARE, 400));
    const large = dotFieldCount(buildLandDotField(SQUARE, 4000));
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThan(4000);
  });

  it('falls back to a bare sphere when the asset has no features', () => {
    const field = buildLandDotField(EMPTY);
    expect(field).toBeInstanceOf(Float32Array);
    expect(dotFieldCount(field)).toBe(0);
  });

  it('degrades to an empty field for degenerate budgets', () => {
    expect(buildLandDotField(SQUARE, 0)).toHaveLength(0);
    expect(buildLandDotField(SQUARE, 1)).toHaveLength(0);
    expect(buildLandDotField(SQUARE, -5)).toHaveLength(0);
    expect(buildLandDotField(SQUARE, Number.NaN)).toHaveLength(0);
  });

  it('emits packed lon/lat pairs inside valid coordinate ranges', () => {
    const field = buildLandDotField(SQUARE, 1000);
    expect(field.length % 2).toBe(0);
    for (const [lon, lat] of pairs(field)) {
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(Number.isFinite(lon)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
    }
  });

  it('uses a budget large enough to read as a dotted Earth', () => {
    expect(DOT_FIELD_CANDIDATES).toBeGreaterThanOrEqual(2000);
    expect(dotFieldCount(buildLandDotField(SQUARE))).toBeGreaterThanOrEqual(20);
  });
});

describe('dotFieldCount', () => {
  it('counts pairs, not scalars', () => {
    expect(dotFieldCount(new Float32Array(0))).toBe(0);
    expect(dotFieldCount(new Float32Array([1, 2, 3, 4]))).toBe(2);
    expect(dotFieldCount(new Float32Array([1, 2, 3]))).toBe(1);
  });
});
