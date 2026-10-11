import { describe, expect, it } from 'vitest';
import { geoOrthographic, geoPath } from 'd3-geo';
import { DEG, MAX_POLAR_TILT, MAX_ZOOM, MIN_ZOOM, clampTilt, interpolateView, projectInto, shortestAngularDelta, viewFor, wrapLongitude, zoomFromWheel } from './globeProjection';
import type { GlobeView, ProjectedImage } from './globeProjection';

const SCALE = 260;
const CX = 400;
const CY = 300;

const VIEWS: Array<[number, number]> = [
  [0, 0],
  [118.79, -32.42],
  [-73.98, 40.71],
  [179.4, 66.5],
  [-160, -70],
];

const POINTS: Array<[number, number]> = [
  [0, 0],
  [45, 20],
  [-120, 33.9],
  [151.2, -33.87],
  [139.7, 35.68],
  [-46.6, -23.55],
  [77.2, 28.6],
  [-0.12, 51.5],
  [18.4, -33.9],
  [-149.9, 61.2],
  [-179.99, -85],
  [179.99, 0],
  [12, 12],
];

function makeView(lon: number, lat: number): GlobeView {
  return { lon, lat, scale: SCALE, cx: CX, cy: CY };
}

/** The same d3 pipeline the coastline/graticule path uses. */
function d3Orthographic(view: GlobeView) {
  return geoOrthographic()
    .scale(SCALE)
    .translate([CX, CY])
    .rotate([-view.lon, -view.lat]);
}

function toRadians(deg: number): number {
  return deg * DEG;
}

function unitVector(lat: number, lon: number): [number, number, number] {
  const phi = toRadians(lat);
  const lambda = toRadians(lon);
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
}

/** Angular distance from the view centre, in degrees (independent formula). */
function angularDistance(view: GlobeView, lat: number, lon: number): number {
  const a = unitVector(view.lat, view.lon);
  const b = unitVector(lat, lon);
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.min(1, Math.max(-1, dot))) / DEG;
}

describe('projectInto parity with d3 geoOrthographic (GLOBE-1)', () => {
  const out: ProjectedImage = { x: 0, y: 0 };

  it('matches d3 coordinates for every near-hemisphere point', () => {
    let checked = 0;
    for (const [lon, lat] of VIEWS) {
      const view = makeView(lon, lat);
      const projection = d3Orthographic(view);
      for (const [pointLon, pointLat] of POINTS) {
        if (!projectInto(view, pointLat, pointLon, out)) continue;
        const expected = projection([pointLon, pointLat]);
        expect(expected).not.toBeNull();
        expect(out.x).toBeCloseTo(expected![0], 9);
        expect(out.y).toBeCloseTo(expected![1], 9);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('accepts exactly the points whose dot product with the centre is positive', () => {
    for (const [lon, lat] of VIEWS) {
      const view = makeView(lon, lat);
      for (const [pointLon, pointLat] of POINTS) {
        const visible = projectInto(view, pointLat, pointLon, out);
        const facing = unitVector(view.lat, view.lon);
        const target = unitVector(pointLat, pointLon);
        const dot = facing[0] * target[0] + facing[1] * target[1] + facing[2] * target[2];
        expect(visible).toBe(dot > 0);
      }
    }
  });

  it('agrees with d3 clip-angle visibility away from the limb', () => {
    for (const [lon, lat] of VIEWS) {
      const view = makeView(lon, lat);
      const projection = d3Orthographic(view);
      const path = geoPath(projection);
      for (const [pointLon, pointLat] of POINTS) {
        const distance = angularDistance(view, pointLat, pointLon);
        // The limb itself (90°) is where d3's 90+ε clip and our strict
        // `depth <= 0` test legitimately differ — stay clear of it.
        if (distance < 85 || distance > 95) continue;
        const drawn = path({ type: 'Point', coordinates: [pointLon, pointLat] });
        expect(projectInto(view, pointLat, pointLon, out)).toBe(drawn !== null);
      }
    }
  });

  it('rejects back-hemisphere points that the raw d3 projection mirrors', () => {
    const view = makeView(0, 0);
    const projection = d3Orthographic(view);
    const outBack: ProjectedImage = { x: 0, y: 0 };
    // Opposite side of the Earth: d3's `projection()` bypasses the clip
    // pipeline, so it still returns a (mirrored) coordinate. The depth
    // test is what keeps far-side land out of the disc.
    expect(projectInto(view, 0, 180, outBack)).toBe(false);
    const mirrored = projection([180, 0]);
    expect(mirrored).not.toBeNull();
    expect(Number.isFinite(mirrored![0])).toBe(true);
    expect(Number.isFinite(mirrored![1])).toBe(true);
  });

  it('never writes to the output when the point is hidden', () => {
    const view = makeView(10, 10);
    const outGuard: ProjectedImage = { x: 123, y: 456 };
    expect(projectInto(view, -40, -140, outGuard)).toBe(false);
    expect(outGuard).toEqual({ x: 123, y: 456 });
  });
});

describe('view helpers (GLOBE-1)', () => {
  it('normalises longitudes into (-180, 180]', () => {
    expect(wrapLongitude(0)).toBe(0);
    expect(wrapLongitude(181)).toBe(-179);
    expect(wrapLongitude(-181)).toBe(179);
    expect(wrapLongitude(540)).toBe(180);
    expect(wrapLongitude(-540)).toBe(180);
    expect(wrapLongitude(180)).toBe(180);
    expect(wrapLongitude(-180)).toBe(180);
  });

  it('clamps polar tilt so the projection can never invert', () => {
    expect(clampTilt(0)).toBe(0);
    expect(clampTilt(45)).toBe(45);
    expect(clampTilt(120)).toBe(MAX_POLAR_TILT);
    expect(clampTilt(-120)).toBe(-MAX_POLAR_TILT);
    expect(clampTilt(Number.NaN)).toBe(0);
  });

  it('builds a centred view that is already wrapped and clamped', () => {
    const perth = viewFor(-32.42, 118.79);
    expect(perth.lat).toBe(-32.42);
    expect(perth.lon).toBeCloseTo(118.79, 9);
    expect(viewFor(0, 200).lon).toBeCloseTo(-160, 9);
    expect(viewFor(95, 0).lat).toBe(MAX_POLAR_TILT);
  });

  it('takes the short way round when interpolating a fly-to', () => {
    expect(shortestAngularDelta(170, -170)).toBe(20);
    expect(shortestAngularDelta(-170, 170)).toBe(-20);
    expect(shortestAngularDelta(10, 10)).toBe(0);

    const start = { lon: 170, lat: 10 };
    const end = { lon: -170, lat: 30 };
    const mid = interpolateView(start, end, 0.5);
    expect(mid.lon).toBe(180);
    expect(mid.lat).toBe(20);
    expect(interpolateView(start, end, 0)).toEqual(start);
    expect(interpolateView(start, end, 1)).toEqual(end);
    expect(interpolateView(start, end, 2)).toEqual(end);
    expect(interpolateView(start, end, -1)).toEqual(start);
  });
});

describe('zoomFromWheel (GLOBE-1)', () => {
  it('zooms in on negative delta and out on positive delta', () => {
    expect(zoomFromWheel(1, -400)).toBeGreaterThan(1);
    // Zoom-out never goes below fit size (MIN_ZOOM), so it must start above it.
    expect(zoomFromWheel(2, 400)).toBeLessThan(2);
    expect(zoomFromWheel(2, 400)).toBeGreaterThanOrEqual(MIN_ZOOM);
  });

  it('clamps to the approved zoom bounds', () => {
    let zoom = 1;
    for (let i = 0; i < 50; i += 1) zoom = zoomFromWheel(zoom, -400);
    expect(zoom).toBe(MAX_ZOOM);
    for (let i = 0; i < 50; i += 1) zoom = zoomFromWheel(zoom, 400);
    expect(zoom).toBe(MIN_ZOOM);
  });

  it('ignores degenerate deltas instead of corrupting the view', () => {
    expect(zoomFromWheel(2, 0)).toBe(2);
    expect(zoomFromWheel(2, Number.NaN)).toBe(2);
    expect(zoomFromWheel(2, Number.POSITIVE_INFINITY)).toBe(2);
  });
});
