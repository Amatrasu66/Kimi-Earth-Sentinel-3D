/**
 * Shared CesiumJS proof-of-concept configuration (Phase 2).
 *
 * Pure module: no `cesium` import, no browser APIs at module scope, so the
 * initial route can never pay for the Cesium runtime through this file and
 * unit tests need no WebGL context. Everything Cesium-specific is resolved
 * against the installed `cesium@1.146.0` package (see
 * docs/architecture/CESIUM_COMPATIBILITY_AND_PROVIDERS.md).
 *
 * Imagery decision (verified 2026-10-15 against the live GIBS
 * GetCapabilities documents):
 * - The repo allow-list (`src/server/providers/imagery.ts`) covers the
 *   geographic (EPSG:4326) endpoint whose `250m` TileMatrixSet uses
 *   non-quadtree grids (L0 2x1, L1 3x2, L2 5x3, ...). Probe: L1 col-3
 *   returns HTTP 400, so Cesium's quadtree tiling schemes cannot address
 *   that endpoint exactly beyond level 0.
 * - The *same allow-listed layer* is therefore served through the
 *   EPSG:3857 endpoint, whose `GoogleMapsCompatible_Level9` set is an exact
 *   quadtree (256 px, levels 0-9, 2^n grids) matching Cesium's default
 *   `WebMercatorTilingScheme`. Tile probes at L0/L1/L2/L5/L9 all returned
 *   HTTP 200 `image/jpeg` with `Access-Control-Allow-Origin: *`, no key.
 * Layer discipline is preserved (allow-listed id only, no arbitrary URLs);
 * only the projection endpoint differs, which `buildTileUrl` does not cover.
 */

/** Runtime base URL for Cesium workers/assets; must match the served path. */
export const CESIUM_BASE_URL = '/cesium';

/** Source directory inside the installed package (mirrors the copy script). */
export const CESIUM_BUILD_DIR = 'node_modules/cesium/Build/Cesium';

/** The four static directories the copy script serves under /cesium. */
export const CESIUM_STATIC_DIRS = ['Workers', 'ThirdParty', 'Assets', 'Widgets'] as const;

/** KVP endpoint for the token-free default imagery (verified live). */
export const GIBS_WMTS_URL =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi';

/**
 * Default imagery layer. MUST stay within the server allow-list
 * (`isAllowedLayer` in `src/server/providers/imagery.ts` — asserted by
 * `cesiumConfig.test.ts`, not imported here to keep this module client-safe).
 */
export const GIBS_LAYER_ID = 'MODIS_Terra_CorrectedReflectance_TrueColor';

export const GIBS_STYLE = 'default';
export const GIBS_FORMAT = 'image/jpeg';

/** Verified against the live epsg3857 GetCapabilities (quadtree, L0-L9). */
export const GIBS_TILE_MATRIX_SET_ID = 'GoogleMapsCompatible_Level9';
export const GIBS_MAXIMUM_LEVEL = 9;

/** Attribution for the default imagery (GIBS credit requirement). */
export const GIBS_CREDIT_TEXT = 'Imagery © NASA EOSDIS GIBS';

/**
 * Whole-Earth home view: explicit so the initial camera is deterministic and
 * unit-testable (Cesium's own default also shows the globe; this pins ours).
 */
export const CESIUM_HOME_VIEW: {
  longitudeDegrees: number;
  latitudeDegrees: number;
  heightMeters: number;
} = {
  longitudeDegrees: 0,
  latitudeDegrees: 20,
  heightMeters: 20_000_000,
};

/** Search fly-to duration mirrors the legacy 1400 ms flight (motion.ts). */
export const CESIUM_FLY_TO_DURATION_SECONDS = 1.4;

/**
 * Low-power mappings — documented Cesium options only:
 * - `viewer.resolutionScale` (CesiumWidget get/set): 1 is full; 0.5 mirrors
 *   the repo DPR-cap-1 policy (halving render pixels vs DPR 2 displays).
 * - `scene.globe.maximumScreenSpaceError`: Cesium default is 2; 4 loads
 *   coarser imagery/terrain levels (less tile work).
 * `requestRenderMode` is deliberately NOT used: it changes render-loop
 * semantics (manual invalidation) and would surprise the shared contract.
 */
export const FULL_RESOLUTION_SCALE = 1;
export const LOW_POWER_RESOLUTION_SCALE = 0.5;
export const DEFAULT_MAXIMUM_SCREEN_SPACE_ERROR = 2;
export const LOW_POWER_MAXIMUM_SCREEN_SPACE_ERROR = 4;

/**
 * Dynamically import the Cesium runtime plus widget CSS (client-only chunk).
 * Separated from the component for testability — tests substitute a fake
 * namespace without needing WebGL. Call only after `window.CESIUM_BASE_URL`
 * is set; the return type is type-only and erased at runtime.
 */
export async function loadCesiumRuntime(): Promise<typeof import('cesium')> {
  const cesium = await import('cesium');
  await import('cesium/Build/Cesium/Widgets/widgets.css');
  return cesium;
}

/**
 * Build the WMTS `dimensions` for the daily GIBS layer (`{ Time }`, verified
 * against the installed provider source: static dimensions become KVP params).
 * Invalid input falls back to today (UTC) rather than sending a bad TIME that
 * would fail every tile.
 */
export function buildGibsTimeDimension(now: Date = new Date()): { Time: string } {
  const day =
    Number.isFinite(now.getTime())
      ? now.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? { Time: day }
    : { Time: new Date().toISOString().slice(0, 10) };
}
