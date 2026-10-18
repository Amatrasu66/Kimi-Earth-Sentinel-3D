/**
 * Sentinel scene-raster factory (Phase 7).
 *
 * Lazy-chunk only (same boundary as `cesiumImageryProviders.ts`): the
 * `cesium` imports below are type-only and erased at runtime — the live
 * namespace arrives as a parameter, so tests substitute a fake without
 * WebGL. Never import this module from the initial route graph.
 *
 * Trust boundary: the descriptor arrives from this app's own API route,
 * but it is re-validated before any provider is constructed — the tile
 * template must start with the pinned Planetary Computer Data API origin,
 * carry no credential parameters, and the rectangle/zoom fields must be
 * sane. Nothing else can become a Cesium URL, so even a compromised
 * payload cannot point the Viewer at an arbitrary host.
 */
import type {
  Credit as CesiumCredit,
  Rectangle as CesiumRectangle,
  UrlTemplateImageryProvider,
} from 'cesium';
import type { SceneRasterDescriptor } from '@/types';

/**
 * Pinned tile origin. Mirrors `PC_DATA_API_URL` in
 * `src/server/providers/scene-raster.ts` — the server only ever emits
 * templates starting with this prefix, and the client refuses anything
 * else (defense in depth, not a configurable).
 */
export const SCENE_RASTER_TILE_ORIGIN =
  'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/';

/** Provider preview images must live on the same verified host. */
export const SCENE_RASTER_PREVIEW_ORIGIN =
  'https://planetarycomputer.microsoft.com/';

/** XYZ tile size served by the verified Planetary Computer template. */
export const SCENE_RASTER_TILE_SIZE = 256;

/** Hard ceiling on descriptor zoom (server emits 0–14; corruption guard). */
export const SCENE_RASTER_MAX_ZOOM_CAP = 16;

/**
 * Stop tile retries after this many attempts per tile. Sentinel PC tiles
 * either load or fail fast; unbounded retries would keep hammering a
 * broken endpoint and hide the failure from the user.
 */
export const SCENE_RASTER_MAX_TILE_RETRIES = 2;

/** Thrown when a descriptor fails validation — no provider is constructed. */
export class UnsupportedSceneRasterError extends Error {
  readonly descriptor: unknown;
  constructor(descriptor: unknown) {
    super(
      'Unsupported scene raster descriptor — no verified provider. ' +
        'The previous map stays as-is.',
    );
    this.name = 'UnsupportedSceneRasterError';
    this.descriptor = descriptor;
  }
}

const PC_ITEM_ID_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Structural + safety validation for one descriptor. Returns true only for
 * a well-formed descriptor whose tile template and preview URL point at
 * the pinned Planetary Computer origins and carry no `token=` parameter
 * (the verified endpoint is keyless; a token would imply data the client
 * cannot be trusted with).
 */
export function isValidSceneRasterDescriptor(
  value: unknown,
): value is SceneRasterDescriptor {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Record<string, unknown>;

  if (d.provider !== 'microsoft-planetary-computer') return false;
  if (d.collection !== 'sentinel-2-l2a' && d.collection !== 'sentinel-1-grd') {
    return false;
  }
  if (typeof d.item_id !== 'string' || !PC_ITEM_ID_RE.test(d.item_id)) return false;

  if (
    typeof d.tile_url_template !== 'string' ||
    !d.tile_url_template.startsWith(SCENE_RASTER_TILE_ORIGIN)
  ) {
    return false;
  }
  if (
    !d.tile_url_template.includes('{z}') ||
    !d.tile_url_template.includes('{x}') ||
    !d.tile_url_template.includes('{y}')
  ) {
    return false;
  }
  // No credential material may reach a tile URL.
  if (/[?&]token=/i.test(d.tile_url_template)) return false;

  if (
    d.preview_url !== null &&
    (typeof d.preview_url !== 'string' ||
      !d.preview_url.startsWith(SCENE_RASTER_PREVIEW_ORIGIN))
  ) {
    return false;
  }

  const bbox = d.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4) return false;
  if (bbox.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return false;
  const [west, south, east, north] = bbox as number[];
  if (west < -180 || east > 180 || south < -90 || north > 90) return false;
  if (!(west < east) || !(south < north)) return false;

  const minZoom = d.min_zoom;
  const maxZoom = d.max_zoom;
  if (!Number.isInteger(minZoom) || !Number.isInteger(maxZoom)) return false;
  const min = minZoom as number;
  const max = maxZoom as number;
  if (min < 0 || max < min || max > SCENE_RASTER_MAX_ZOOM_CAP) return false;

  return true;
}

/**
 * The slice of the Cesium namespace the factory needs (test seam, same
 * pattern as `CesiumRuntimeSurface` in `cesiumImageryProviders.ts`).
 */
export interface CesiumSceneRasterSurface {
  UrlTemplateImageryProvider: typeof UrlTemplateImageryProvider;
  Credit: typeof CesiumCredit;
  Rectangle: typeof CesiumRectangle;
}

/**
 * Build the imagery provider for a validated scene-raster descriptor.
 * Unknown/malformed descriptors throw (the caller keeps the previous
 * working layer and surfaces the failure). `creditText` is the display
 * attribution from the resolution payload when available.
 */
export function createSceneRasterImageryProvider(
  cesium: CesiumSceneRasterSurface,
  descriptor: unknown,
  creditText?: string | null,
): UrlTemplateImageryProvider {
  if (!isValidSceneRasterDescriptor(descriptor)) {
    throw new UnsupportedSceneRasterError(descriptor);
  }
  const [west, south, east, north] = descriptor.bbox;
  return new cesium.UrlTemplateImageryProvider({
    url: descriptor.tile_url_template,
    tileWidth: SCENE_RASTER_TILE_SIZE,
    tileHeight: SCENE_RASTER_TILE_SIZE,
    minimumLevel: descriptor.min_zoom,
    maximumLevel: descriptor.max_zoom,
    rectangle: cesium.Rectangle.fromDegrees(west, south, east, north),
    credit: creditText ? new cesium.Credit(creditText) : undefined,
    hasAlpha: true,
  });
}
