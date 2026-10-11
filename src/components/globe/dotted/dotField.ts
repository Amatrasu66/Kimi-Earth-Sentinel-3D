/**
 * Land dot field for the dotted Earth (GLOBE-1).
 *
 * Built ONCE per session, right after the local land asset resolves —
 * never inside the animation frame. The expensive part is the
 * point-in-polygon test against 127 land polygons; doing that per frame
 * (or per rotation step) would make the render loop scale with the
 * geography instead of with the screen.
 *
 * Distribution: a Fibonacci sphere gives an even, seam-free spread over
 * the whole globe (no clustering at the poles, no grid aliasing), and the
 * candidates that fail `geoContains` are simply dropped. The result is a
 * flat `Float32Array` of packed `[lon, lat, lon, lat, …]` pairs — one
 * typed array, no per-dot objects, bounded by `candidates`.
 */
import { geoContains } from 'd3-geo';
import type { LandAsset } from './landGeo';

/**
 * Candidate budget for the Fibonacci lattice. 3600 evenly spaced samples
 * land ≈1000–1200 dots on the continents at 110m fidelity — dense enough
 * to read as a dotted Earth, sparse enough to stay a single fill call.
 */
export const DOT_FIELD_CANDIDATES = 3600;

/**
 * Sample the land polygons and return packed lon/lat pairs.
 *
 * Antarctica reaches ±90°, so the Fibonacci poles are included and
 * correctly tested; nothing is special-cased.
 */
export function buildLandDotField(
  land: LandAsset,
  candidates: number = DOT_FIELD_CANDIDATES,
): Float32Array {
  const count = Math.max(0, Math.floor(candidates));
  if (count < 2) return new Float32Array(0);

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const packed: number[] = [];
  const point: [number, number] = [0, 0];

  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2; // 1 … -1
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const lat = Math.asin(Math.min(1, Math.max(-1, y))) * (180 / Math.PI);
    const lon = Math.atan2(Math.sin(theta) * ringRadius, Math.cos(theta) * ringRadius) * (180 / Math.PI);
    point[0] = lon;
    point[1] = lat;
    if (geoContains(land, point)) {
      packed.push(lon, lat);
    }
  }

  return Float32Array.from(packed);
}

/** Number of dots in a packed field (pairs, not scalars). */
export function dotFieldCount(field: Float32Array): number {
  return Math.floor(field.length / 2);
}
