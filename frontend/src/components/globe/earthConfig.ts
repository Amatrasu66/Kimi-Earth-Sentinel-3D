/**
 * Shared Earth renderer constants + status types.
 *
 * Kept in a component-free module so both `WebGPUEarth` (WebGPU/TSL)
 * and `EarthRenderer` (selector/diagnostics) can import them without
 * tripping the react-refresh only-export-components rule.
 */

/** Earth sphere radius — identical in both renderers so markers align. */
export const EARTH_RADIUS = 5;

/** Sun direction until wired to UTC solar position (see README roadmap). */
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
}
