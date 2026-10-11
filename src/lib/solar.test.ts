import { describe, expect, it } from 'vitest';
import { latLonToVector3 } from './geo';
import {
  getSubsolarPoint,
  getSunDirection,
  subsolarPointToSunDirection,
} from './solar';

/**
 * Reference vectors below are INDEPENDENT of the implementation: they were
 * produced with the NOAA solar-calculator day-angle formulation
 * (γ = 2π/365·(dayOfYear − 1 + (hour − 12)/24),
 *  eqTime = 229.18·(0.000075 + 0.001868·cosγ − 0.032077·sinγ
 *           − 0.014615·cos2γ − 0.040849·sin2γ),
 *  decl from the 7-term Fourier series, subsolar lon = −eqTime/4 − 15·(h−12)
 *  wrapped to ±180) — a different derivation from the shipped J2000
 * mean-longitude/anomaly + GMST/RA ephemeris, so agreement corroborates the
 * code rather than repeating it. NOAA references (rounded to 3 dp):
 *
 *   2026-03-20T12:00Z → lat −0.263, lon +2.003
 *   2026-06-21T12:00Z → lat +23.455, lon +0.359
 *   2026-12-21T12:00Z → lat −23.424, lon −0.484
 *
 * Tolerance ±0.5°: the shipped series deviates ≤ ~0.25° from NOAA at these
 * instants (worst at the March equinox, where declination moves fastest),
 * so 0.5° gives ~2× margin while staying twice as tight as the PRD's 1°
 * terminator budget. A wrong UTC offset (±1 h = 15°), flipped longitude
 * sign, swapped solstice, or transposed axis all miss by ≫ 0.5°.
 */
const REF_TOLERANCE_DEG = 0.5;

const EQUINOX_MAR = new Date('2026-03-20T12:00:00Z');
const SOLSTICE_JUN = new Date('2026-06-21T12:00:00Z');
const SOLSTICE_DEC = new Date('2026-12-21T12:00:00Z');

describe('getSubsolarPoint reference vectors (independent NOAA values)', () => {
  it('matches the March-equinox reference (declination ≈ 0, lon ≈ +2° east)', () => {
    const p = getSubsolarPoint(EQUINOX_MAR);
    expect(Math.abs(p.latitude - -0.263)).toBeLessThanOrEqual(REF_TOLERANCE_DEG);
    expect(Math.abs(p.longitude - 2.003)).toBeLessThanOrEqual(REF_TOLERANCE_DEG);
  });

  it('matches the June-solstice reference (lat ≈ +23.46°)', () => {
    const p = getSubsolarPoint(SOLSTICE_JUN);
    expect(Math.abs(p.latitude - 23.455)).toBeLessThanOrEqual(REF_TOLERANCE_DEG);
    expect(Math.abs(p.longitude - 0.359)).toBeLessThanOrEqual(REF_TOLERANCE_DEG);
  });

  it('matches the December-solstice reference (lat ≈ −23.42°)', () => {
    const p = getSubsolarPoint(SOLSTICE_DEC);
    expect(Math.abs(p.latitude - -23.424)).toBeLessThanOrEqual(REF_TOLERANCE_DEG);
    expect(Math.abs(p.longitude - -0.484)).toBeLessThanOrEqual(REF_TOLERANCE_DEG);
  });
});

describe('getSubsolarPoint hemispheres and UTC dependence', () => {
  it('places the June solstice firmly north and December firmly south', () => {
    // Wide margins (a sign flip or solstice swap misses by ~47°).
    expect(getSubsolarPoint(SOLSTICE_JUN).latitude).toBeGreaterThan(20);
    expect(getSubsolarPoint(SOLSTICE_DEC).latitude).toBeLessThan(-20);
  });

  it('keeps the March equinox near the equator (no zero-at-equinox assumption)', () => {
    const p = getSubsolarPoint(EQUINOX_MAR);
    expect(Math.abs(p.latitude)).toBeLessThan(1.5);
  });

  it('gets the longitude sign right: east of Greenwich at March noon, west in December', () => {
    // Solar noon at Greenwich falls ~12:08 UTC on 2026-03-20 (equation of
    // time ≈ −8 min), so at 12:00 UTC the Sun is still ~2° EAST; on
    // 2026-12-21 (EoT ≈ +2 min) it is ~0.5° WEST. A sign flip fails both.
    const mar = getSubsolarPoint(EQUINOX_MAR);
    const dec = getSubsolarPoint(SOLSTICE_DEC);
    expect(mar.longitude).toBeGreaterThan(0);
    expect(mar.longitude).toBeLessThan(5);
    expect(dec.longitude).toBeLessThan(0);
    expect(dec.longitude).toBeGreaterThan(-5);
  });

  it('shifts longitude ~15°/hour of UTC (12 h apart ≈ 180°)', () => {
    const noon = getSubsolarPoint(new Date('2026-03-20T12:00:00Z'));
    const midnight = getSubsolarPoint(new Date('2026-03-20T00:00:00Z'));
    // Shortest-arc distance on the circle; a UTC-offset bug (±1 h) moves
    // this by 15°, far outside the ±3° window.
    const arc = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    expect(arc(noon.longitude, midnight.longitude)).toBeGreaterThan(177);
    expect(arc(noon.longitude, midnight.longitude)).toBeLessThanOrEqual(180);
    // Declination barely moves in 12 h outside fast equinox drift.
    expect(Math.abs(noon.latitude - midnight.latitude)).toBeLessThan(1);
  });

  it('shifts longitude ~90° over 6 h (June solstice morning → noon)', () => {
    const morning = getSubsolarPoint(new Date('2026-06-21T06:00:00Z'));
    const noon = getSubsolarPoint(SOLSTICE_JUN);
    const arc = Math.abs(((noon.longitude - morning.longitude + 540) % 360) - 180);
    expect(arc).toBeGreaterThan(87);
    expect(arc).toBeLessThan(93);
  });
});

describe('getSubsolarPoint normalization, boundaries, invalid input', () => {
  it('always normalizes longitude to [-180, 180] with finite components', () => {
    // 49 hourly instants spanning two days across the antimeridian region.
    const start = Date.UTC(2025, 11, 31, 0, 0, 0);
    for (let h = 0; h < 49; h += 1) {
      const p = getSubsolarPoint(new Date(start + h * 3_600_000));
      expect(Number.isFinite(p.latitude)).toBe(true);
      expect(Number.isFinite(p.longitude)).toBe(true);
      expect(p.latitude).toBeGreaterThanOrEqual(-23.5);
      expect(p.latitude).toBeLessThanOrEqual(23.5);
      expect(p.longitude).toBeGreaterThanOrEqual(-180);
      expect(p.longitude).toBeLessThanOrEqual(180);
    }
  });

  it('handles the leap day and year boundary without special-casing', () => {
    // Independent NOAA spot values: 2024-02-29T18:00Z → (−7.499, −86.819);
    // 2026-01-01T00:00Z → (−23.095, −179.330). Asserted with wide ±1.5°
    // windows — enough to catch calendar arithmetic bugs, loose enough to
    // stay independent of implementation precision.
    const leap = getSubsolarPoint(new Date('2024-02-29T18:00:00Z'));
    expect(leap.latitude).toBeGreaterThan(-9);
    expect(leap.latitude).toBeLessThan(-6);
    expect(leap.longitude).toBeGreaterThan(-88.5);
    expect(leap.longitude).toBeLessThan(-85.5);

    const boundary = getSubsolarPoint(new Date('2026-01-01T00:00:00Z'));
    expect(boundary.latitude).toBeGreaterThan(-24.5);
    expect(boundary.latitude).toBeLessThan(-21.5);
    expect(boundary.longitude).toBeGreaterThanOrEqual(-180);
    expect(boundary.longitude).toBeLessThanOrEqual(180);
    expect(Math.abs(boundary.longitude)).toBeGreaterThan(170);
  });

  it('throws TypeError on invalid dates (never a silent 0/0 terminator)', () => {
    expect(() => getSubsolarPoint(new Date(Number.NaN))).toThrow(TypeError);
    expect(() => getSubsolarPoint(new Date('not-a-date'))).toThrow(TypeError);
    expect(() => getSunDirection(new Date(Number.NaN))).toThrow(TypeError);
  });

  it('is deterministic: same instant → identical result, no hidden clock', () => {
    expect(getSubsolarPoint(EQUINOX_MAR)).toEqual(getSubsolarPoint(new Date(EQUINOX_MAR.getTime())));
    expect(getSunDirection(SOLSTICE_JUN)).toEqual(getSunDirection(new Date(SOLSTICE_JUN.getTime())));
  });
});

describe('subsolarPointToSunDirection (renderer 3D convention)', () => {
  it('matches the established latLonToVector3 projection exactly', () => {
    // Guards the axis/sign contract shared with markers, fly-to, and both
    // renderers: any transposed axis or flipped sign breaks these.
    const cases = [
      { latitude: 0, longitude: 0 },
      { latitude: 51.5, longitude: -0.12 },
      { latitude: -33.8, longitude: 151.2 },
      { latitude: 23.455, longitude: 0.359 },
      { latitude: -23.424, longitude: -0.484 },
      { latitude: 90, longitude: 0 },
      { latitude: -90, longitude: 123 },
    ];
    for (const point of cases) {
      const [x, y, z] = subsolarPointToSunDirection(point, 1);
      const v = latLonToVector3(point.latitude, point.longitude, 1);
      expect(x).toBeCloseTo(v.x, 10);
      expect(y).toBeCloseTo(v.y, 10);
      expect(z).toBeCloseTo(v.z, 10);
    }
  });

  it('maps equator/prime-meridian to +X and the north pole to +Y', () => {
    const [x0, y0, z0] = subsolarPointToSunDirection({ latitude: 0, longitude: 0 }, 1);
    expect(x0).toBeCloseTo(1, 10);
    expect(y0).toBeCloseTo(0, 10);
    expect(z0).toBeCloseTo(0, 10);
    const [xp, yp] = subsolarPointToSunDirection({ latitude: 90, longitude: 0 }, 1);
    expect(xp).toBeCloseTo(0, 10);
    expect(yp).toBeCloseTo(1, 10);
  });

  it('returns unit vectors at radius 1 and scales with radius', () => {
    const [x, y, z] = subsolarPointToSunDirection({ latitude: 20, longitude: -40 }, 1);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10);
    const scaled = subsolarPointToSunDirection({ latitude: 20, longitude: -40 }, 5);
    expect(Math.hypot(...scaled)).toBeCloseTo(5, 10);
  });
});

describe('getSunDirection (single authoritative calculation)', () => {
  it('equals convert(subsolar(date)) — one formula, no divergent paths', () => {
    for (const date of [EQUINOX_MAR, SOLSTICE_JUN, SOLSTICE_DEC]) {
      const direct = getSunDirection(date);
      const point = getSubsolarPoint(date);
      const composed = subsolarPointToSunDirection(point, 1);
      expect(direct).toEqual(composed);
    }
  });

  it('points TOWARD the subsolar point (never reversed)', () => {
    // Cosine similarity with the geographic unit vector must be ~+1;
    // a reversed vector would score −1.
    for (const date of [EQUINOX_MAR, SOLSTICE_JUN, SOLSTICE_DEC]) {
      const dir = getSunDirection(date);
      const point = getSubsolarPoint(date);
      const geo = latLonToVector3(point.latitude, point.longitude, 1).normalize();
      const dot = dir[0] * geo.x + dir[1] * geo.y + dir[2] * geo.z;
      expect(dot).toBeGreaterThan(0.999);
    }
  });

  it('carries the correct hemisphere in the Y component', () => {
    expect(getSunDirection(SOLSTICE_JUN)[1]).toBeGreaterThan(0.3);
    expect(getSunDirection(SOLSTICE_DEC)[1]).toBeLessThan(-0.3);
  });
});
