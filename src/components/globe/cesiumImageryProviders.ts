/**
 * Cesium imagery-provider factory (Phase 4).
 *
 * Lazy-chunk only: this module (and the `cesium` runtime it drives) is
 * imported exclusively by `CesiumEarth`, which itself loads behind the
 * `?renderer=cesium` dynamic boundary. Never import it from the initial
 * route graph. The `cesium` imports below are type-only and erased at
 * runtime — the live namespace arrives as a parameter (same seam as
 * `loadCesiumRuntime`, so tests substitute a fake without WebGL).
 *
 * The factory separates provider *creation* from *attachment*: it builds
 * imagery providers from validated layer ids and verified constants, while
 * `CesiumEarth` owns the Viewer lifecycle (add/remove/alpha/show). There is
 * deliberately no code path that turns user input into a URL — the only
 * remote endpoint is the pinned `GIBS_WMTS_URL` constant, and unknown layer
 * ids throw instead of producing a provider.
 */
import type {
  Credit,
  GridImageryProvider,
  WebMapTileServiceImageryProvider,
} from 'cesium';
import type { Color as CesiumColor } from 'cesium';
import {
  CESIUM_GRID_CELLS,
  CESIUM_GRID_GLOW_COLOR,
  CESIUM_GRID_LINE_ALPHA,
  CESIUM_GRID_LINE_COLOR,
  GIBS_CREDIT_TEXT,
  GIBS_FORMAT,
  GIBS_LAYER_ID,
  GIBS_MAXIMUM_LEVEL,
  GIBS_STYLE,
  GIBS_TILE_MATRIX_SET_ID,
  GIBS_WMTS_URL,
  buildGibsTimeDimension,
} from './cesiumConfig';
import {
  CESIUM_GRATICULE_OVERLAY_LAYER,
  GIBS_TRUE_COLOR_BASE_LAYER,
  isSupportedBaseLayerId,
} from './imageryLayers';

/** The slice of the Cesium namespace the factory needs (test seam). */
export interface CesiumRuntimeSurface {
  WebMapTileServiceImageryProvider: typeof WebMapTileServiceImageryProvider;
  GridImageryProvider: typeof GridImageryProvider;
  Credit: typeof Credit;
  Color: typeof CesiumColor;
}

/** Thrown when a layer id cannot be resolved to a verified provider. */
export class UnsupportedImageryLayerError extends Error {
  readonly layerId: unknown;
  constructor(layerId: unknown) {
    super(
      `Unsupported imagery layer: ${String(layerId)} — no verified provider. ` +
        `The previous working layer is kept.`,
    );
    this.name = 'UnsupportedImageryLayerError';
    this.layerId = layerId;
  }
}

/**
 * Build the imagery provider for a supported base layer. Validates the id
 * against the registry first; unknown ids throw (the caller keeps the
 * previous working layer and surfaces the failure). The endpoint, layer,
 * style, format, tiling, and TIME semantics all come from the verified
 * `cesiumConfig` constants — never from the `layerId` argument.
 */
export function createBaseImageryProvider(
  cesium: CesiumRuntimeSurface,
  layerId: unknown,
  now: Date = new Date(),
): WebMapTileServiceImageryProvider {
  if (!isSupportedBaseLayerId(layerId) || layerId !== GIBS_TRUE_COLOR_BASE_LAYER.id) {
    throw new UnsupportedImageryLayerError(layerId);
  }
  return new cesium.WebMapTileServiceImageryProvider({
    url: GIBS_WMTS_URL,
    layer: GIBS_LAYER_ID,
    style: GIBS_STYLE,
    format: GIBS_FORMAT,
    tileMatrixSetID: GIBS_TILE_MATRIX_SET_ID,
    maximumLevel: GIBS_MAXIMUM_LEVEL,
    dimensions: buildGibsTimeDimension(now),
    credit: new cesium.Credit(GIBS_CREDIT_TEXT),
  });
}

/**
 * Build the graticule overlay provider (Phase 3 construction, extracted
 * unchanged: 8 cells, faint lines, transparent glow and background).
 */
export function createGraticuleProvider(
  cesium: CesiumRuntimeSurface,
): GridImageryProvider {
  return new cesium.GridImageryProvider({
    cells: CESIUM_GRID_CELLS,
    color: cesium.Color.fromCssColorString(CESIUM_GRID_LINE_COLOR).withAlpha(
      CESIUM_GRID_LINE_ALPHA,
    ),
    glowColor: cesium.Color.fromCssColorString(CESIUM_GRID_GLOW_COLOR),
    backgroundColor: cesium.Color.TRANSPARENT,
  });
}

/** The overlay this factory knows how to build. */
export function isSupportedOverlayLayerId(layerId: unknown): boolean {
  return layerId === CESIUM_GRATICULE_OVERLAY_LAYER.id;
}
