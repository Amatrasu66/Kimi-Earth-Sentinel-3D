/**
 * AirNow AQI provider — port of backend/app/services/airnow.py.
 * US-only fixed central-US query; bbox is rejected at the route layer.
 */
import { serverConfig } from "../config";
import { fetchJsonWithTimeout, logError, logWarn } from "../http";
import { LIVE, SIMULATED, utcnowIso, withStatus } from "../provenance";
import { isValidCoordinate } from "../validation";
import { generateMockAqi, meetsMinSeverity, severityForAqi } from "./fallback";

export const SOURCE = "AirNow";

export function normalizeAirnow(items: unknown, limit: number, minSeverity?: string | null) {
  if (!Array.isArray(items)) throw new Error("Unexpected AirNow response shape");
  const points: Record<string, unknown>[] = [];
  for (const item of items) {
    if (points.length >= limit) break;
    const rec = (item ?? {}) as Record<string, unknown>;
    const lat = typeof rec.Latitude === "number" ? rec.Latitude : 39.0;
    const lon = typeof rec.Longitude === "number" ? rec.Longitude : -98.5;
    if (!isValidCoordinate(lat, lon)) continue;
    const aqi = typeof rec.AQI === "number" ? rec.AQI : 0;
    const severity = severityForAqi(aqi);
    if (!meetsMinSeverity(severity, minSeverity)) continue;
    points.push({
      id: `aqi-${lat}-${lon}`,
      lat,
      lon,
      value: aqi,
      severity,
      timestamp: utcnowIso(),
      location: (rec.ReportingArea as string | undefined) ?? "Unknown",
      parameter: (rec.ParameterName as string | undefined) ?? "PM2.5",
    });
  }
  return { layer_id: "air_quality", count: points.length, points, unit: "AQI" };
}

export async function getAirQualityData(
  _bbox?: string | null,
  limit = 500,
  minSeverity?: string | null,
) {
  const apiKey = serverConfig.airnowApiKey;
  if (!apiKey) {
    return withStatus(
      generateMockAqi(undefined, limit, minSeverity),
      SIMULATED,
      SOURCE,
      "No AirNow API key configured — showing simulated fallback data.",
    );
  }
  let items: unknown;
  try {
    const res = await fetchJsonWithTimeout(`${serverConfig.airnowApiUrl}/latLong/current/`, {
      params: {
        format: "application/json",
        latitude: 39.0,
        longitude: -98.5,
        distance: 500,
        API_KEY: apiKey,
      },
      timeoutMs: serverConfig.airnowTimeoutMs,
    });
    if (res.status >= 400) throw new Error(`AirNow responded with status ${res.status}`);
    if (!Array.isArray(res.json)) throw new Error("Unexpected AirNow response shape");
    items = res.json;
  } catch (e) {
    logWarn("AirNow provider unreachable, using fallback", String(e));
    return withStatus(
      generateMockAqi(undefined, limit, minSeverity),
      SIMULATED,
      SOURCE,
      "AirNow unavailable — showing simulated fallback data.",
    );
  }
  try {
    const payload = normalizeAirnow(items, limit, minSeverity);
    return withStatus(payload, LIVE, SOURCE, undefined, utcnowIso());
  } catch (e) {
    logError("AirNow response normalization failed", String(e));
    return withStatus(
      generateMockAqi(undefined, limit, minSeverity),
      SIMULATED,
      SOURCE,
      "AirNow response malformed — showing simulated fallback data.",
    );
  }
}
