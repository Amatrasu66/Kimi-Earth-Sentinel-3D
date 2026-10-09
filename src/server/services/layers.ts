/**
 * Application service for layer payloads — port of
 * backend/app/services/layer_service.py.
 */
import { getCache } from "../cache";
import { getLayer } from "../models/layers";
import {
  LIVE,
  SIMULATED,
  STALE,
  ttlForLayer,
  utcnowIso,
  withStatus,
  type DataStatus,
} from "../provenance";
import { generateMockLayerData } from "../providers/fallback";

type LayerPayload = Record<string, unknown> & { data_status?: DataStatus };

export const FALLBACK_TTL = 60;
export const HEATMAP_TTL = 3600;

type ServiceFn = (
  bbox?: string | null,
  limit?: number,
  minSeverity?: string | null,
  // Provider adapters return withStatus(...) payloads; keep loose to avoid
  // over-constraining each adapter's declared return type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

// Per-layer lazy provider loaders. The previous static SERVICE_MAP pulled
// every adapter (USGS, EONET, FIRMS, Open-Meteo, AirNow, heatmap) into each
// route's server module graph; now a data request for layer X compiles and
// loads only provider X. Same functions, same caching/provenance/error
// semantics — only the import timing changes.
type ServiceLoader = () => Promise<ServiceFn>;

async function loadEarthquakes(): Promise<ServiceFn> {
  const { getEarthquakeData } = await import("../providers/usgs");
  return (bbox, limit, minSeverity) => getEarthquakeData(bbox, limit, minSeverity);
}

async function loadDisasters(): Promise<ServiceFn> {
  const { getEonetEvents } = await import("../providers/nasa-eonet");
  return (bbox, limit, minSeverity) => getEonetEvents(bbox, limit, minSeverity);
}

function loadWeather(
  metric: "temperature" | "precipitation" | "cloudcover" | "wind",
  layerId: string,
): ServiceLoader {
  return async () => {
    const { getWeatherData } = await import("../providers/open-meteo");
    return (bbox, limit, minSeverity) => getWeatherData(metric, bbox, limit, minSeverity, layerId);
  };
}

async function loadAirQuality(): Promise<ServiceFn> {
  const { getAirQualityData } = await import("../providers/airnow");
  return (bbox, limit, minSeverity) => getAirQualityData(bbox, limit, minSeverity);
}

async function loadWildfires(): Promise<ServiceFn> {
  const { getFireData } = await import("../providers/nasa-firms");
  return (bbox, limit, minSeverity) => getFireData(bbox, limit, minSeverity);
}

const SERVICE_LOADERS: Record<string, ServiceLoader> = {
  earthquakes: loadEarthquakes,
  disasters: loadDisasters,
  temperature: loadWeather("temperature", "temperature"),
  precipitation: loadWeather("precipitation", "precipitation"),
  clouds: loadWeather("cloudcover", "clouds"),
  wind: loadWeather("wind", "wind"),
  air_quality: loadAirQuality,
  wildfires: loadWildfires,
};

export function layerCacheKey(
  layerId: string,
  bbox: string | null | undefined,
  limit: number,
  minSeverity: string | null | undefined,
): string {
  return `layer:${layerId}:bbox=${bbox || "-"}:limit=${limit}:sev=${minSeverity || "-"}`;
}

export function heatmapCacheKey(layerId: string, resolution: number, timeRange: string): string {
  return `heatmap:${layerId}:res=${resolution}:range=${timeRange}`;
}

export function payloadStatus(data: unknown): string | null {
  if (typeof data === "object" && data !== null) {
    return ((data as LayerPayload).data_status?.status as string | undefined) ?? null;
  }
  return null;
}

function fetchedAt(data: unknown): string | null | undefined {
  if (typeof data === "object" && data !== null) {
    return (data as LayerPayload).data_status?.fetched_at;
  }
  return undefined;
}

function asStale(data: LayerPayload): LayerPayload {
  const stale: LayerPayload = { ...data };
  const status: DataStatus = { ...((data.data_status ?? {}) as DataStatus) };
  const at = status.fetched_at;
  status.status = STALE;
  status.message = at
    ? `Provider refresh failed — showing cached data fetched at ${at}.`
    : "Provider refresh failed — showing cached data.";
  stale.data_status = status;
  return stale;
}

export async function resolveWithCache(
  key: string,
  ttl: number,
  fetchFn: () => Promise<LayerPayload>,
): Promise<{ data: LayerPayload; cacheHit: boolean; stale: boolean }> {
  const cache = getCache();
  const fresh = cache.get(key) as [LayerPayload, string | null | undefined] | null;
  if (fresh !== null) return { data: fresh[0], cacheHit: true, stale: false };

  // Only unexpected exceptions propagate (programming bugs stay visible).
  const data = await fetchFn();
  if (payloadStatus(data) === LIVE) {
    cache.set(key, [data, fetchedAt(data)], ttl);
    return { data, cacheHit: false, stale: false };
  }

  const expired = cache.getStale(key) as [LayerPayload, string | null | undefined] | null;
  if (expired !== null && payloadStatus(expired[0]) === LIVE) {
    return { data: asStale(expired[0]), cacheHit: true, stale: true };
  }

  cache.set(key, [data, fetchedAt(data)], Math.min(FALLBACK_TTL, ttl));
  return { data, cacheHit: false, stale: false };
}

export function getLayerPayload(
  layerId: string,
  bbox?: string | null,
  limit = 500,
  minSeverity?: string | null,
) {
  const layer = getLayer(layerId);
  const source = layer ? layer.source : layerId;
  const key = layerCacheKey(layerId, bbox, limit, minSeverity);
  // Development-only timing: provider fetch duration. Set only on cache
  // misses (fetchFn never runs for cache hits), so 0 means "served cached".
  let providerMs = 0;
  const fetchFn = async (): Promise<LayerPayload> => {
    const loader = SERVICE_LOADERS[layerId];
    if (!loader) {
      const mock = generateMockLayerData(layerId, bbox, limit, minSeverity);
      return withStatus(
        mock,
        SIMULATED,
        source,
        "No live provider for this layer — showing simulated fallback data.",
      ) as LayerPayload;
    }
    const started = Date.now();
    try {
      const serviceFn = await loader();
      return (await serviceFn(bbox, limit, minSeverity)) as LayerPayload;
    } finally {
      providerMs = Date.now() - started;
    }
  };
  const totalStarted = Date.now();
  return resolveWithCache(key, ttlForLayer(layerId), fetchFn).then((result) => {
    // Compact dev log: timings + provenance only. No payload data, no keys,
    // no per-point logging. Silent in production.
    if (process.env.NODE_ENV !== "production") {
      const status = payloadStatus(result.data);
      console.log(
        `[earth-sentinel] [layer:${layerId}] total=${Date.now() - totalStarted}ms ` +
          `provider=${providerMs}ms cache_hit=${result.cacheHit} stale=${result.stale} ` +
          `status=${status ?? "unknown"}`,
      );
    }
    return result;
  });
}

export function getHeatmapPayload(layerId: string, resolution = 128, timeRange = "24h") {
  const key = heatmapCacheKey(layerId, resolution, timeRange);
  return resolveWithCache(key, HEATMAP_TTL, async () => {
    const { getHeatmap } = await import("../providers/heatmap");
    return getHeatmap(layerId, resolution, timeRange);
  });
}

export { utcnowIso };
