/**
 * Open-Meteo provider — port of backend/app/services/open_meteo.py.
 * Batched comma-separated forecasts (≤50 locations/request, ≤200 points),
 * serial chunks to stay under rate limits.
 */
import { serverConfig } from "../config";
import { fetchJsonWithTimeout, logWarn } from "../http";
import { LIVE, SIMULATED, utcnowIso, withStatus } from "../provenance";
import {
  generateMockWeather,
  generateWeatherGrid,
  meetsMinSeverity,
  severityForMetric,
  unitForMetric,
} from "./fallback";

export const SOURCE = "Open-Meteo";
export const MAX_FETCH_POINTS = 200;
const BATCH_SIZE = 50;

export const METRIC_FIELDS: Record<string, string> = {
  temperature: "temperature_2m",
  precipitation: "precipitation",
  cloudcover: "cloudcover",
  wind: "windspeed_10m",
};

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchBatch(
  baseUrl: string,
  points: { lat: number; lon: number }[],
  field: string,
  timeoutMs: number,
): Promise<Record<string, unknown>[]> {
  const latitudes = points.map((p) => p.lat.toFixed(4)).join(",");
  const longitudes = points.map((p) => p.lon.toFixed(4)).join(",");
  const res = await fetchJsonWithTimeout(`${baseUrl}/forecast`, {
    params: {
      latitude: latitudes,
      longitude: longitudes,
      current: field,
      temperature_unit: "celsius",
      windspeed_unit: "kmh",
    },
    timeoutMs,
  });
  if (res.status >= 400) throw new Error(`Open-Meteo responded with status ${res.status}`);
  if (res.json !== null && typeof res.json === "object" && !Array.isArray(res.json)) {
    return [res.json as Record<string, unknown>];
  }
  if (!Array.isArray(res.json)) throw new Error("Unexpected Open-Meteo response shape");
  return res.json as Record<string, unknown>[];
}

export async function getWeatherData(
  metric = "temperature",
  bbox?: string | null,
  limit = 500,
  minSeverity?: string | null,
  layerId?: string | null,
) {
  const layer = layerId ?? metric;
  const field = METRIC_FIELDS[metric] ?? "temperature_2m";
  const baseUrl = serverConfig.openMeteoUrl;
  const timeoutMs = serverConfig.requestTimeoutMs;

  let gridPoints: { lat: number; lon: number }[];
  try {
    gridPoints = generateWeatherGrid(bbox);
  } catch {
    return withStatus(
      generateMockWeather(metric, null, limit, layer, minSeverity),
      SIMULATED,
      SOURCE,
      "Invalid bounding box — showing simulated fallback data.",
    );
  }

  const points: Record<string, unknown>[] = [];
  let failures = 0;
  const truncated = gridPoints.length > MAX_FETCH_POINTS;
  for (const chunk of chunks(gridPoints.slice(0, Math.min(limit, MAX_FETCH_POINTS)), BATCH_SIZE)) {
    let results: Record<string, unknown>[];
    try {
      results = await fetchBatch(baseUrl, chunk, field, timeoutMs);
    } catch (e) {
      failures += chunk.length;
      logWarn("Open-Meteo batch fetch failed", String(e));
      continue;
    }
    chunk.forEach((pt, idx) => {
      try {
        const result = results[idx] ?? {};
        const current = ((result as Record<string, unknown>).current ?? {}) as Record<string, unknown>;
        const val = typeof current[field] === "number" ? (current[field] as number) : 0;
        const severity = severityForMetric(metric, val);
        if (!meetsMinSeverity(severity, minSeverity)) return;
        points.push({
          id: `wx-${pt.lat.toFixed(2)}-${pt.lon.toFixed(2)}`,
          lat: pt.lat,
          lon: pt.lon,
          value: Math.round(val * 10) / 10,
          severity,
          timestamp: (current.time as string | undefined) ?? utcnowIso(),
          unit: unitForMetric(metric),
        });
      } catch (e) {
        failures += 1;
        logWarn("Open-Meteo point parse failed", String(e));
      }
    });
  }

  if (points.length === 0) {
    logWarn("Open-Meteo provider unreachable, using fallback");
    return withStatus(
      generateMockWeather(metric, bbox, limit, layer, minSeverity),
      SIMULATED,
      SOURCE,
      "Open-Meteo unavailable — showing simulated fallback data.",
    );
  }

  const payload: Record<string, unknown> = {
    layer_id: layer,
    count: points.length,
    points,
    unit: unitForMetric(metric),
  };
  const warnings: string[] = [];
  if (failures) warnings.push(`${failures} grid points could not be fetched.`);
  if (truncated || limit > MAX_FETCH_POINTS) {
    warnings.push(`Results bounded to ${MAX_FETCH_POINTS} grid points per request.`);
  }
  if (warnings.length) payload.warnings = warnings;
  return withStatus(payload, LIVE, SOURCE, undefined, utcnowIso());
}
