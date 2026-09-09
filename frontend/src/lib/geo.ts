import * as THREE from 'three';
import type { DataPoint } from '@/types';

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

const _v = new THREE.Vector3();

/** Geographic (lat, lon, degrees) → unit-sphere * radius vector. */
export function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/** Write lat/lon into an existing vector (avoids per-frame allocation). */
export function latLonToVector3Into(
  out: THREE.Vector3,
  lat: number,
  lon: number,
  radius: number,
): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return out.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Quaternion rotating the globe group so (lat, lon) faces the camera
 * (camera looks down -Z at the origin, so the point must map to +Z).
 * Used by search fly-to; slerp towards it for a smooth transition.
 */
export function quaternionForLatLon(lat: number, lon: number): THREE.Quaternion {
  latLonToVector3Into(_v, lat, lon, 1).normalize();
  return new THREE.Quaternion().setFromUnitVectors(_v.clone(), new THREE.Vector3(0, 0, 1));
}
