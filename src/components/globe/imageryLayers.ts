/**
 * Imagery layer registry (Phase 4).
 *
 * Pure module: no `cesium` import, no browser APIs at module scope, so it
 * is safe to import from the initial route graph (`url-state.ts` validates
 * the `?imagery=` parameter against this registry) and from the lazy
 * Cesium chunk alike. Live Cesium objects (`Viewer`, `ImageryLayer`,
 * providers) never appear here — only serializable metadata plus pure
 * validation helpers. Runtime construction lives in
 * `./cesiumImageryProviders.ts`, which is imported exclusively inside the
 * lazy `CesiumEarth` chunk.
 *
 * Layer IDs are stable, unique, URL-safe slugs. Display names may change
 * without breaking stored preferences or shared URLs.
 */

/** A base imagery replaces the globe's surface; an overlay draws above it. */
export type ImageryLayerRole = 'base' | 'overlay';

/** Serializable description of one supported imagery layer. */
export interface ImageryLayerDescriptor {
  /** Stable unique slug — the only identity persisted in URLs/storage. */
  id: string;
  /** Human-readable name (may change; never used as an identity). */
  name: string;
  /** One-line explanation shown in the layer manager. */
  description: string;
  /** Base imagery vs independent overlay. */
  role: ImageryLayerRole;
  /** Verified provider key (see `IMAGERY_LAYER_PROVIDER_REFERENCE.md`). */
  providerId: string;
  /** Initial visibility when no valid persisted choice exists. */
  defaultVisible: boolean;
  /** Effective opacity when no valid persisted choice exists (0–1). */
  defaultOpacity: number;
  /** Whether the UI exposes an opacity control for this layer. */
  supportsOpacity: boolean;
  /**
   * Whether the UI exposes ordering for this layer. Currently false for
   * every layer: the base is pinned to the bottom by construction and the
   * single overlay renders above it, so there is no meaningful choice to
   * offer (see Phase 4 report §ordering).
   */
  supportsReordering: boolean;
  /** Required credit text (`null` when the provider requires none). */
  attribution: string | null;
  /**
   * What any displayed date means (mosaic availability vs acquisition).
   * Must never imply live observation unless the provider documents it.
   */
  temporalNote: string | null;
  /** Known product limitations stated honestly (resolution, latency…). */
  limitations: string | null;
}

/**
 * Provider keys currently verified for browser use. Anything else —
 * commercial endpoints, token-gated terrain, invented URLs — is documented
 * as a future integration in the provider reference, never exposed here.
 *
 * `microsoft-planetary-computer` (Phase 7) is a *dynamic* provider: it has
 * no fixed registry entry above because its layers are per-scene rasters
 * resolved from the selected catalogue product (see
 * `scene-raster.ts` / `cesiumSceneRaster.ts`), not selectable catalogue
 * layers. The key is listed here so provider identities stay centralized.
 */
export const SUPPORTED_IMAGERY_PROVIDERS = [
  'nasa-gibs',
  'cesium-native',
  'microsoft-planetary-computer',
] as const;

export type SupportedImageryProviderId = (typeof SUPPORTED_IMAGERY_PROVIDERS)[number];

/**
 * The single verified base imagery: NASA GIBS MODIS Terra true color.
 * Field values mirror `cesiumConfig.ts` (`GIBS_*` constants) and the server
 * allow-list (`isAllowedLayer`) — `imageryLayers.test.ts` asserts the
 * equality so this documentation cannot drift from the runtime behavior.
 */
export const GIBS_TRUE_COLOR_BASE_LAYER: ImageryLayerDescriptor = {
  id: 'gibs-modis-truecolor',
  name: 'NASA GIBS True Color (MODIS Terra)',
  description:
    'Daily global true-color composite from NASA EOSDIS GIBS. Token-free and verified against the live EPSG:3857 endpoint.',
  role: 'base',
  providerId: 'nasa-gibs',
  defaultVisible: true,
  defaultOpacity: 1,
  supportsOpacity: true,
  supportsReordering: false,
  attribution: 'Imagery © NASA EOSDIS GIBS',
  temporalNote:
    'The provider serves a daily composite keyed by UTC calendar day ' +
    '(mosaic availability date). It is not live satellite observation: ' +
    'same-day imagery appears only after processing and publishing latency.',
  limitations:
    'Global daily mosaic at ~250 m native resolution; visibly soft beyond ' +
    'regional zoom (WMTS levels 0–9). Tile errors degrade gracefully — the ' +
    'previous working layer is kept, never replaced by an unverified source.',
};

/**
 * The single verified overlay: the Cesium-native geographic reference
 * grid. Visibility persistence keeps its established behavior
 * (`sentinel:globe-grid:v1`, owned by `useGlobeGrid`) — this descriptor
 * only gives the layer manager a stable identity and honest metadata.
 */
export const CESIUM_GRATICULE_OVERLAY_LAYER: ImageryLayerDescriptor = {
  id: 'cesium-graticule',
  name: 'Geographic grid',
  description:
    'Latitude/longitude reference lines drawn by the Cesium-native grid provider. Off by default; never alters imagery or camera state.',
  role: 'overlay',
  providerId: 'cesium-native',
  defaultVisible: false,
  defaultOpacity: 1,
  supportsOpacity: true,
  supportsReordering: false,
  attribution: null,
  temporalNote: null,
  limitations:
    'Reference geometry only — it carries no observation data and its ' +
    'density refines with zoom by provider construction.',
};

/** Every layer the UI may expose. No other layer is supported. */
export const IMAGERY_LAYER_REGISTRY: readonly ImageryLayerDescriptor[] = [
  GIBS_TRUE_COLOR_BASE_LAYER,
  CESIUM_GRATICULE_OVERLAY_LAYER,
];

/** Base layers in selection order (today: exactly one verified choice). */
export const BASE_IMAGERY_LAYERS: readonly ImageryLayerDescriptor[] =
  IMAGERY_LAYER_REGISTRY.filter((layer) => layer.role === 'base');

/** Overlays in display order (today: the graticule only). */
export const OVERLAY_LAYERS: readonly ImageryLayerDescriptor[] =
  IMAGERY_LAYER_REGISTRY.filter((layer) => layer.role === 'overlay');

/** The base imagery used when no valid selection exists. */
export const DEFAULT_BASE_LAYER_ID = GIBS_TRUE_COLOR_BASE_LAYER.id;

/** URL query parameter carrying the selected base imagery. */
export const IMAGERY_URL_PARAM = 'imagery';

/** Look up a descriptor by id (`undefined` for unknown ids). */
export function findLayerDescriptor(layerId: string): ImageryLayerDescriptor | undefined {
  return IMAGERY_LAYER_REGISTRY.find((layer) => layer.id === layerId);
}

/** Whether `layerId` names a supported base imagery. */
export function isSupportedBaseLayerId(layerId: unknown): layerId is string {
  return (
    typeof layerId === 'string' &&
    BASE_IMAGERY_LAYERS.some((layer) => layer.id === layerId)
  );
}

/**
 * Resolve a user-controlled base-layer id to a supported one. Unknown,
 * removed, or malformed ids fall back to the verified default — they never
 * crash the app and never trigger arbitrary network requests.
 */
export function resolveBaseLayerId(layerId: unknown): string {
  return isSupportedBaseLayerId(layerId) ? layerId : DEFAULT_BASE_LAYER_ID;
}

/**
 * Parse the `?imagery=` URL value. Valid supported ids pass through;
 * everything else (missing, unknown, malformed) parses to `null`, which
 * means "established default" and serializes back to "parameter omitted".
 */
export function parseImageryUrlValue(raw: string | null | undefined): string | null {
  return typeof raw === 'string' && isSupportedBaseLayerId(raw) ? raw : null;
}

/** Clamp any input to a valid 0–1 opacity, falling back on invalid input. */
export function clampLayerOpacity(value: unknown, fallback = 1): number {
  const numeric = typeof value === 'string' ? Number(value) : (value as number);
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) return fallback;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

/**
 * Validate a persisted or URL-supplied opacity. Returns the clamped value,
 * or `null` when the input is unusable (caller applies the layer default).
 * `null`/`undefined`/empty input means "no choice stored", not 0.
 */
export function parseLayerOpacity(raw: unknown, fallback: number): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const numeric = typeof raw === 'string' ? Number(raw) : (raw as number);
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) return fallback;
  if (numeric < 0 || numeric > 1) return fallback;
  return numeric;
}
