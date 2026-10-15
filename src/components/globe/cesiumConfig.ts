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
 *
 * Phase 3 extends this module with the scientific-visual baseline (uniform
 * lighting, theme background, base-color fix), the geographic reference
 * grid constants, the low-power MSAA mapping, a documented imagery-provider
 * descriptor, and a pure fly-to resolver. Values remain plain constants and
 * pure functions — no `cesium` import — so the initial route never pays for
 * the runtime through this file and unit tests need no WebGL context.
 */
import { isValidCoordinate } from '@/lib/geo';

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

/**
 * Documented descriptor for the default imagery (Phase 3 §7.3). The Viewer
 * consumes the individual constants above; this object is the single place
 * the provider's operational envelope is written down.
 * `cesiumConfig.test.ts` asserts every field against those constants and
 * the server allow-list, so this documentation cannot drift from behavior.
 */
export interface GibsProviderDescriptor {
  providerName: string;
  productId: string;
  endpoint: string;
  projection: string;
  tileMatrixSet: string;
  style: string;
  format: string;
  timeDimension: { name: string; meaning: string };
  attribution: string;
  /** WMTS level range; ≈250 m/px native at the top level (global daily product). */
  supportedZoomRange: string;
  authentication: 'none';
  fallback: string;
}

export const GIBS_PROVIDER_DESCRIPTOR: GibsProviderDescriptor = {
  providerName: 'NASA EOSDIS GIBS (Global Imagery Browse Services)',
  productId: GIBS_LAYER_ID,
  endpoint: GIBS_WMTS_URL,
  projection:
    'EPSG:3857 (Web Mercator); GoogleMapsCompatible quadtree matching Cesium WebMercatorTilingScheme',
  tileMatrixSet: GIBS_TILE_MATRIX_SET_ID,
  style: GIBS_STYLE,
  format: GIBS_FORMAT,
  timeDimension: {
    name: 'Time',
    meaning:
      'UTC calendar day of the MODIS Terra CorrectedReflectance TrueColor daily composite (250 m). ' +
      'A daily composite — not real-time: same-day imagery appears only after processing and ' +
      'publishing latency, and the globe never claims a live satellite observation.',
  },
  attribution: GIBS_CREDIT_TEXT,
  supportedZoomRange: 'WMTS levels 0–9 (quadtree); visibly soft beyond regional zoom',
  authentication: 'none',
  fallback:
    'Recoverable: tile errors surface as imagery-degraded status text; the Viewer and the ' +
    'allow-listed layer are never replaced by an unverified provider.',
};

/**
 * Scene visual baseline (Phase 3 §9) — public Scene/Globe properties only:
 * - `GLOBE_ENABLE_LIGHTING: false` keeps uniform (day-side) illumination:
 *   no day/night terminator, so continents stay readable at every camera
 *   orientation and the view never implies a real-time sun position.
 * - `CESIUM_SCENE_BACKGROUND_COLOR` matches the app's deep-space veil
 *   (#020202), so the globe sits in the same visual space as the shell.
 * - `CESIUM_GLOBE_BASE_COLOR` replaces Cesium's default `Color(0, 0, 0.5)`
 *   navy for not-yet-streamed imagery, which read as ocean-blue "land".
 *   Deep slate, not near-black: the sphere silhouette must stay discernible
 *   before tiles stream (an invisible globe is "excessive darkening" —
 *   §9.1), yet it must not mimic ocean-blue imagery.
 * Sky atmosphere and ground atmosphere stay at their Cesium defaults
 * (enabled, restrained) — no custom shader injection.
 */
export const GLOBE_ENABLE_LIGHTING = false;
export const CESIUM_SCENE_BACKGROUND_COLOR = '#020202';
export const CESIUM_GLOBE_BASE_COLOR = '#1a2a3c';

/**
 * Geographic reference grid (Phase 3 §10): Cesium's built-in
 * `GridImageryProvider` draws the graticule in the `GeographicTilingScheme`,
 * so it is aligned to the ellipsoid by construction (cell and tile
 * boundaries fall on the 180°/2^n lattice), respects the same depth/camera
 * rules as imagery (no z-fighting, no entity clutter), and its density
 * refines with zoom (cells halve per level). Lines are deliberately faint —
 * a reference layer must never compete with the imagery — and the feature
 * is off by default, so it costs nothing until enabled.
 */
export const CESIUM_GRID_CELLS = 8;
export const CESIUM_GRID_LINE_COLOR = '#dbe9ff';
export const CESIUM_GRID_LINE_ALPHA = 0.16;
/** Glow pass is built in; a fully transparent color disables it visually. */
export const CESIUM_GRID_GLOW_COLOR = '#00000000';

/**
 * MSAA mapping (Phase 3 §13.3): the Cesium scene default is 4 samples;
 * 1 disables multisampling. `Scene.msaaSamples` is a documented public
 * property consumed by the render loop when framebuffers are created
 * (verified in the installed 1.146.0 source), so the low-power sync effect
 * can flip it on a live Viewer.
 */
export const FULL_MSAA_SAMPLES = 4;
export const LOW_POWER_MSAA_SAMPLES = 1;

/** A validated fly-to plan for one search-selected destination. */
export interface FlyToViewPlan {
  longitudeDegrees: number;
  latitudeDegrees: number;
  heightMeters: number;
  /** 0 when reduced motion jumps immediately instead of animating. */
  durationSeconds: number;
  animate: boolean;
}

/**
 * Resolve one fly-to request (Phase 3 §11.4) into a deterministic camera
 * plan. Pure math — no Cesium types — so reference destinations are
 * unit-tested directly. Invalid or missing targets resolve to null (the
 * camera never moves on bad input); a non-finite or non-positive altitude
 * falls back to the pinned home-view height. Reduced motion turns the
 * flight into an immediate view change at the same destination.
 */
export function resolveFlyToView(options: {
  target: { lat: number; lon: number } | null | undefined;
  currentHeightMeters: number;
  reducedMotion: boolean;
}): FlyToViewPlan | null {
  const { target } = options;
  if (!target || !isValidCoordinate(target.lat, target.lon)) return null;
  const height =
    Number.isFinite(options.currentHeightMeters) && options.currentHeightMeters > 0
      ? options.currentHeightMeters
      : CESIUM_HOME_VIEW.heightMeters;
  return {
    longitudeDegrees: target.lon,
    latitudeDegrees: target.lat,
    heightMeters: height,
    durationSeconds: options.reducedMotion ? 0 : CESIUM_FLY_TO_DURATION_SECONDS,
    animate: !options.reducedMotion,
  };
}
