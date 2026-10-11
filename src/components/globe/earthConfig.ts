/**
 * Shared Earth renderer constants + status types.
 *
 * Kept in a component-free module so both `WebGPUEarth` (WebGPU/TSL)
 * and `EarthRenderer` (selector/diagnostics) can import constants without
 * pulling component code into non-component modules.
 */

/** Earth sphere radius — identical in both renderers so markers align. */
export const EARTH_RADIUS = 5;

/**
 * Default camera distance — identical in both renderers so framing matches.
 *
 * Derived from the shell geometry, not chosen by eye: with fov 45 the
 * globe fills `EARTH_RADIUS / (tan(22.5°) * distance)` of the viewport
 * height. At 16.4 the sphere is ~74% of viewport height, i.e. ~86–89% of
 * the usable stage (viewport minus 56px header, 38px dock, padding) on
 * 720p–900p desktop — breathing room above and below, never cropped by
 * chrome. Users can still zoom 7–30 via OrbitControls.
 */
export const DEFAULT_CAMERA_DISTANCE = 16.4;

/**
 * Deterministic initial sun direction (T2.4).
 *
 * Rendered on the server and on the first client pass so markup stays
 * hydration-identical; `useSunDirection` replaces it with the live UTC solar
 * position immediately after client mount and refreshes it every 60 s. Both
 * renderer paths fall back to this tuple when no live value is supplied.
 */
export const DEFAULT_SUN_DIRECTION: [number, number, number] = [6, 2.5, 4];

export interface EarthTextureStatus {
  loaded: number;
  total: number;
}

export interface EarthStatus {
  phase: 'loading' | 'ready' | 'error';
  renderer: 'webgpu';
  textures: EarthTextureStatus;
  error?: string;
  /**
   * Frames submitted to the GPU so far. Present once the render loop has
   * produced at least one frame — proof the scene is actually rendering,
   * not merely that `renderer.init()` resolved. Session 5: the badge must
   * never report success on init alone.
   */
  frames?: number;
}
