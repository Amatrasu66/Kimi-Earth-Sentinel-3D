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
import { getAirQualityData } from "../providers/airnow";
import { generateMockLayerData } from "../providers/fallback";
import { getHeatmap } from "../providers/heatmap";
import { getEonetEvents } from "../providers/nasa-eonet";
import { getFireData } from "../providers/nasa-firms";
import { getWeatherData } from "../providers/open-meteo";
import { getEarthquakeData } from "../providers/usgs";

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

const SERVICE_MAP: Record<string, ServiceFn> = {
  earthquakes: (bbox, limit, minSeverity) => getEarthquakeData(bbox, limit, minSeverity),
  disasters: (bbox, limit, minSeverity) => getEonetEvents(bbox, limit, minSeverity),
  temperature: (bbox, limit, minSeverity) => getWeatherData("temperature", bbox, limit, minSeverity, "temperature"),
  precipitation: (bbox, limit, minSeverity) =>
    getWeatherData("precipitation", bbox, limit, minSeverity, "precipitation"),
  clouds: (bbox, limit, minSeverity) => getWeatherData("cloudcover", bbox, limit, minSeverity, "clouds"),
  wind: (bbox, limit, minSeverity) => getWeatherData("wind", bbox, limit, minSeverity, "wind"),
  air_quality: (bbox, limit, minSeverity) => getAirQualityData(bbox, limit, minSeverity),
  wildfires: (bbox, limit, minSeverity) => getFireData(bbox, limit, minSeverity),
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

function payloadStatus(data: unknown): string | null {
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
  const fetchFn = async (): Promise<LayerPayload> => {
    const serviceFn = SERVICE_MAP[layerId];
    if (!serviceFn) {
      const mock = generateMockLayerData(layerId, bbox, limit, minSeverity);
      return withStatus(
        mock,
        SIMULATED,
        source,
        "No live provider for this layer — showing simulated fallback data.",
      ) as LayerPayload;
    }
    return (await serviceFn(bbox, limit, minSeverity)) as LayerPayload;
  };
  return resolveWithCache(key, ttlForLayer(layerId), fetchFn);
}

export function getHeatmapPayload(layerId: string, resolution = 128, timeRange = "24h") {
  const key = heatmapCacheKey(layerId, resolution, timeRange);
  return resolveWithCache(key, HEATMAP_TTL, async () => getHeatmap(layerId, resolution, timeRange));
}

export { utcnowIso };
