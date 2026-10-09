/**
 * Air Quality provider selection (T2.5) — port of backend/app/services/airnow.py.
 *
 * Strategy: Open-Meteo Air Quality is the global model-based source (no key).
 * AirNow stays as an optional U.S. station-observation source behind its key,
 * using the existing fixed central-U.S. query — per-point AirNow fan-out is
 * deliberately avoided (unverified service quotas; key-bearing requests stay
 * minimal). U.S.-covering bboxes with a key try AirNow first, then fall back
 * to the model; everything else goes straight to the model.
 */
import { serverConfig } from "../config";
import { fetchJsonWithTimeout, logError, logWarn } from "../http";
import { LIVE, utcnowIso, withStatus } from "../provenance";
import { isValidCoordinate } from "../validation";
import { meetsMinSeverity, severityForAqi } from "./fallback";
import { getOpenMeteoAirQuality } from "./open-meteo-aq";

export const SOURCE = "AirNow";

/**
 * U.S. observation suitability envelope (contiguous US + AK/HI/territories).
 * AirNow's fixed query is central-U.S., so only bboxes fully inside this
 * envelope may attempt it — never mistaken for worldwide coverage.
 */
const US_LAT_MIN = 17;
const US_LAT_MAX = 72;
const US_LON_MIN = -180;
const US_LON_MAX = -60;

export function isUsCoverage(bbox?: string | null): boolean {
  if (!bbox) return false; // global request → global model
  const parts = bbox.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [minLon, minLat, maxLon, maxLat] = parts;
  return (
    minLat >= US_LAT_MIN &&
    maxLat <= US_LAT_MAX &&
    minLon >= US_LON_MIN &&
    maxLon <= US_LON_MAX
  );
}

export function normalizeAirnow(items: unknown, limit: number, minSeverity?: string | null) {
  if (!Array.isArray(items)) throw new Error("Unexpected AirNow response shape");
  const points: Record<string, unknown>[] = [];
  for (const item of items) {
    if (points.length >= limit) break;
    const rec = (item ?? {}) as Record<string, unknown>;
    // T2.5: never invent coordinates or AQI — skip incomplete records.
    if (typeof rec.Latitude !== "number" || typeof rec.Longitude !== "number") continue;
    const { Latitude: lat, Longitude: lon } = rec;
    if (!isValidCoordinate(lat, lon)) continue;
    if (typeof rec.AQI !== "number") continue;
    const aqi = rec.AQI;
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
  bbox?: string | null,
  limit = 500,
  minSeverity?: string | null,
) {
  const apiKey = serverConfig.airnowApiKey;
  // 1. Suitable U.S. coverage + key → station observations.
  if (apiKey && isUsCoverage(bbox)) {
    const observations = await tryAirNowObservations(apiKey, limit, minSeverity);
    if (observations) {
      return withStatus(
        observations,
        LIVE,
        SOURCE,
        "U.S. monitoring-station observations (AirNow).",
        utcnowIso(),
      );
    }
  }
  // 2–4. Global model (keyless): default path and AirNow-failure fallback.
  // Model failure yields labelled SIMULATED via the shared stale policy.
  return getOpenMeteoAirQuality(bbox, limit, minSeverity);
}

/**
 * Single fixed central-U.S. observation query (unchanged endpoint/params).
 * Returns the normalized payload, or null when AirNow cannot serve — the
 * caller falls through to the Open-Meteo model instead of fabricating.
 */
async function tryAirNowObservations(
  apiKey: string,
  limit: number,
  minSeverity?: string | null,
): Promise<Record<string, unknown> | null> {
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
    logWarn("AirNow provider unreachable, trying Open-Meteo model", String(e));
    return null;
  }
  try {
    return normalizeAirnow(items, limit, minSeverity) as Record<string, unknown>;
  } catch (e) {
    logError("AirNow response normalization failed, trying Open-Meteo model", String(e));
    return null;
  }
}
