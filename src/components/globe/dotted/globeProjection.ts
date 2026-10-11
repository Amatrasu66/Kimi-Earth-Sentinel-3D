/**
 * Globe view math for the dotted Earth (GLOBE-1) — allocation-free,
 * d3-orthographic-equivalent, and fully unit-testable.
 *
 * Why a hand-rolled point projection instead of calling
 * `geoOrthographic()(point)` per dot per frame:
 *
 * - `projection(point)` bypasses d3's clip pipeline, so back-hemisphere
 *   points project to *mirrored* positions instead of being rejected —
 *   the disc would fill with land dots from the far side of the Earth.
 *   The correct visibility test is the rotated depth component, which is
 *   exactly what `projectInto` returns.
 * - the full path allocates a fresh `[x, y]` per call (~thousands per
 *   frame). Writing into a caller-owned `ProjectedImage` avoids that.
 *
 * The formulas below are a line-for-line equivalent of
 * `d3-geo/src/rotation.js` (`rotationLambda` + `rotationPhiGamma` with
 * gamma = 0) followed by `orthographicRaw` + `scaleTranslate`, which is
 * precisely the pipeline `geoPath` uses for the coastline and graticule
 * strokes. `globeProjection.test.ts` asserts parity against a real
 * `geoOrthographic()` instance for representative coordinates.
 */

export const DEG = Math.PI / 180;

/** Polar tilt is clamped so the poles can never flip the projection. */
export const MAX_POLAR_TILT = 85;

/** Zoom bounds for wheel/pointer zoom, expressed as a multiplier of fit size. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

export interface GlobeView {
  /** Centre longitude in degrees (the meridian at screen centre). */
  lon: number;
  /** Centre latitude in degrees (the parallel at screen centre). */
  lat: number;
  /** Projection scale in pixels — also the on-screen disc radius. */
  scale: number;
  /** Screen centre. */
  cx: number;
  cy: number;
}

export interface ProjectedImage {
  x: number;
  y: number;
}

/** Normalise a longitude delta into (-180, 180]. */
export function wrapLongitude(delta: number): number {
  const wrapped = ((((delta + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/** Clamp the view latitude so the projection never inverts at the poles. */
export function clampTilt(latitude: number): number {
  if (!Number.isFinite(latitude)) return 0;
  return Math.min(MAX_POLAR_TILT, Math.max(-MAX_POLAR_TILT, latitude));
}

/** Centre view that puts `(lat, lon)` at the middle of the disc. */
export function viewFor(lat: number, lon: number): { lon: number; lat: number } {
  return { lon: wrapLongitude(lon), lat: clampTilt(lat) };
}

/**
 * Rotate + orthographic-project `(lat, lon)` through `view`.
 *
 * Returns `false` when the point is on the far hemisphere (nothing is
 * written to `out` in that case), which is the visibility predicate the
 * marker/dot loops use — no per-point allocation, no polygon maths.
 */
export function projectInto(
  view: GlobeView,
  lat: number,
  lon: number,
  out: ProjectedImage,
): boolean {
  const lambda = wrapLongitude(lon - view.lon) * DEG;
  const phi = lat * DEG;
  const deltaPhi = -view.lat * DEG;

  const cosPhi = Math.cos(phi);
  const x = Math.cos(lambda) * cosPhi;
  const y = Math.sin(lambda) * cosPhi;
  const z = Math.sin(phi);

  const cosDeltaPhi = Math.cos(deltaPhi);
  const sinDeltaPhi = Math.sin(deltaPhi);

  const k = z * cosDeltaPhi + x * sinDeltaPhi;
  const lambdaRotated = Math.atan2(y, x * cosDeltaPhi - z * sinDeltaPhi);
  const phiRotated = Math.asin(Math.min(1, Math.max(-1, k)));

  // Depth towards the viewer: positive only on the near hemisphere.
  const depth = Math.cos(phiRotated) * Math.cos(lambdaRotated);
  if (depth <= 0) return false;

  out.x = view.cx + view.scale * Math.cos(phiRotated) * Math.sin(lambdaRotated);
  out.y = view.cy - view.scale * Math.sin(phiRotated);
  return true;
}

/**
 * Wheel delta → new zoom, exponential so the response is symmetric in
 * both directions and clamped to [MIN_ZOOM, MAX_ZOOM].
 */
export function zoomFromWheel(current: number, deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return current;
  const next = current * Math.exp(-deltaY * 0.0015);
  if (!Number.isFinite(next)) return current;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
}

/**
 * Shortest signed angular delta between two longitudes, in (-180, 180].
 * Used so a fly-to never spins the long way round the Earth.
 */
export function shortestAngularDelta(from: number, to: number): number {
  return wrapLongitude(to - from);
}

/**
 * Interpolated view for a fly-to flight: longitude takes the short way
 * round, latitude is linear, both end exactly on the requested target.
 */
export function interpolateView(
  from: { lon: number; lat: number },
  to: { lon: number; lat: number },
  t: number,
): { lon: number; lat: number } {
  const k = Math.min(1, Math.max(0, t));
  const lon = from.lon + shortestAngularDelta(from.lon, to.lon) * k;
  return {
    // Re-wrap so the flight lands on the requested target verbatim instead
    // of an equivalent but out-of-range angle (170 → -170 must end at -170).
    lon: k >= 1 ? wrapLongitude(to.lon) : lon,
    lat: from.lat + (to.lat - from.lat) * k,
  };
}
