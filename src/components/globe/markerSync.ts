/**
 * Shared instanced-marker writer for the two 3D globe paths (T4.3).
 *
 * Both the WebGL/R3F path (`Globe.tsx` MarkerSystem) and the imperative
 * WebGPU path (`WebGPUEarth.tsx` syncMarkers) must uphold the same
 * contract: instance index N always maps to `validPoints[N]` (the
 * canonical array from `filterValidPoints`), positions come from the
 * shared lat/lon projection, and colors come from the severity scale.
 * A single writer keeps the two renderers from diverging.
 *
 * Capacity: the server accepts `limit` up to `MAX_LIMIT` (2000) and every
 * provider slices to it, so a marker store must hold 2000 instances. The
 * WebGPU path previously allocated capacity 1 and then set
 * `count = points.length` — writes past index 0 land outside the instance
 * buffer (silently ignored by the typed array) while the mesh claims to
 * draw N instances. Preallocate `MARKER_CAPACITY` once instead of
 * reallocating per update.
 *
 * No clustering or thinning lives here: T4.3 measured nothing that
 * justifies it (see `docs/audit/marker-scalability.md`), so every valid
 * point is drawn. If a future measurement justifies a cap, the clamp
 * below is the place — with a truthful "Showing N of M" notice, never
 * silent drops.
 */
import * as THREE from 'three';
import { latLonToVector3Into } from '@/lib/geo';
import { MAX_LIMIT } from '@/server/validation';
import { SEVERITY_COLORS } from '@/types';
import type { DataPoint, SeverityLevel } from '@/types';

/** Marker store capacity — mirrors the server `limit` contract exactly. */
export const MARKER_CAPACITY = MAX_LIMIT;

/** Caller-owned scratch objects: no per-point allocation during a sync. */
export interface MarkerScratch {
  dummy: THREE.Object3D;
  color: THREE.Color;
  vec: THREE.Vector3;
}

/**
 * Structural marker target so both `three` (WebGL) and `three/webgpu`
 * InstancedMesh instances satisfy it without cross-import type friction.
 */
export interface MarkerSyncTarget {
  count: number;
  instanceMatrix: { count: number; needsUpdate: boolean };
  instanceColor: { needsUpdate: boolean } | null;
  setMatrixAt(index: number, matrix: THREE.Matrix4): void;
  setColorAt(index: number, color: THREE.Color): void;
}

/**
 * Write `points` (already filtered by `filterValidPoints`) into the
 * instance buffers, clamp to the allocated capacity, and return the
 * number of drawn instances. Index order is preserved, so picking code
 * that resolves `validPoints[instanceId]` stays correct.
 */
export function writeMarkersToInstancedMesh(
  target: MarkerSyncTarget,
  points: DataPoint[],
  radius: number,
  scratch: MarkerScratch,
): number {
  const capacity = Math.max(0, target.instanceMatrix?.count ?? 0);
  const drawn = Math.min(points.length, capacity);
  const { dummy, color, vec } = scratch;
  for (let i = 0; i < drawn; i += 1) {
    const point = points[i];
    latLonToVector3Into(vec, point.lat, point.lon, radius);
    dummy.position.copy(vec);
    dummy.lookAt(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    target.setMatrixAt(i, dummy.matrix);
    color.set(SEVERITY_COLORS[point.severity as SeverityLevel] ?? SEVERITY_COLORS.low);
    target.setColorAt(i, color);
  }
  target.count = drawn;
  target.instanceMatrix.needsUpdate = true;
  if (target.instanceColor) target.instanceColor.needsUpdate = true;
  return drawn;
}
