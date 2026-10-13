import type { DataPoint } from '@/types';

/**
 * Plain 3D vector — deliberately NOT a THREE.Vector3 (T4.5).
 *
 * `src/lib/geo.ts` sits in the initial-route import graph (the default
 * dotted renderer uses `filterValidPoints`), so importing `three` here
 * pinned the entire three.js core into the first-load bundle for two
 * vector helpers. These plain interfaces carry the same math with zero
 * GPU-library weight; the lazy 3D renderers convert to THREE objects at
 * their own boundary (per data change, never per frame).
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Plain unit quaternion (x, y, z, w). */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Valid latitude: -90 <= lat <= 90. Valid longitude: -180 <= lon <= 180. */
export function isValidCoordinate(lat: unknown, lon: unknown): lat is number {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * One canonical valid-points array (Phase 5). Every consumer — instance
 * count, marker positions, raycasting, hover, click — must use THIS array
 * so rendered instance N always equals data point N, even when the raw
 * payload contains invalid coordinate records.
 */
export function filterValidPoints(points: DataPoint[]): DataPoint[] {
  return points.filter((p) => isValidCoordinate(p.lat, p.lon));
}

/** Geographic (lat, lon, degrees) → unit-sphere * radius vector. */
export function latLonToVec3(lat: number, lon: number, radius: number): Vec3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

/**
 * Write lat/lon into an existing object (avoids per-frame allocation).
 * Accepts any `{ x, y, z }` — including a THREE.Vector3, which satisfies
 * this interface structurally.
 */
export function latLonToVec3Into(out: Vec3, lat: number, lon: number, radius: number): Vec3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  out.x = -radius * Math.sin(phi) * Math.cos(theta);
  out.y = radius * Math.cos(phi);
  out.z = radius * Math.sin(phi) * Math.sin(theta);
  return out;
}

/**
 * Shortest-arc quaternion rotating one unit vector onto another —
 * a line-for-line port of `THREE.Quaternion.setFromUnitVectors`
 * (including its antiparallel guard), so results match the GPU
 * renderers' math exactly. `geo.test.ts` asserts parity against the
 * real three.js implementation across a coordinate grid.
 */
export function setFromUnitVectors(out: Quat, from: Vec3, to: Vec3): Quat {
  const r0 = from.x * to.x + from.y * to.y + from.z * to.z + 1;
  if (r0 < Number.EPSILON) {
    if (Math.abs(from.x) > Math.abs(from.z)) {
      out.x = -from.y;
      out.y = from.x;
      out.z = 0;
      out.w = 0;
    } else {
      out.x = 0;
      out.y = -from.z;
      out.z = from.y;
      out.w = 0;
    }
  } else {
    out.x = from.y * to.z - from.z * to.y;
    out.y = from.z * to.x - from.x * to.z;
    out.z = from.x * to.y - from.y * to.x;
    out.w = r0;
  }
  const len = Math.hypot(out.x, out.y, out.z, out.w) || 1;
  out.x /= len;
  out.y /= len;
  out.z /= len;
  out.w /= len;
  return out;
}

const PLUS_Z: Vec3 = { x: 0, y: 0, z: 1 };

/**
 * Quaternion rotating the globe group so (lat, lon) faces the camera
 * (camera looks down -Z at the origin, so the point must map to +Z).
 * Used by search fly-to; slerp towards it for a smooth transition.
 * Plain-data twin of the old THREE.Quaternion version — callers in the
 * lazy 3D paths convert with `new THREE.Quaternion(q.x, q.y, q.z, q.w)`.
 */
export function quaternionForLatLon(lat: number, lon: number): Quat {
  const v = latLonToVec3(lat, lon, 1);
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  v.x /= len;
  v.y /= len;
  v.z /= len;
  return setFromUnitVectors({ x: 0, y: 0, z: 0, w: 1 }, v, PLUS_Z);
}
