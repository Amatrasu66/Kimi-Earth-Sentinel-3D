/**
 * USGS earthquakes provider — port of backend/app/services/usgs.py.
 * Fetches the last 30 days (M2.5+) and normalizes to canonical points.
 */
import { serverConfig } from "../config";
import { fetchJsonWithTimeout, logError, logWarn } from "../http";
import { LIVE, SIMULATED, utcnowIso, withStatus } from "../provenance";
import { isValidCoordinate } from "../validation";
import { generateMockEarthquakes, severityForMagnitude } from "./fallback";

export const SOURCE = "USGS";

const SEVERITY_FLOORS: Record<string, number> = {
  low: 2.5,
  moderate: 4.5,
  high: 6.0,
  critical: 7.0,
};

export { severityForMagnitude };

interface UsgsFeature {
  id?: string;
  properties?: Record<string, unknown>;
  geometry?: { coordinates?: unknown } | null;
}

function formatTime(ms: unknown): string {
  const n = typeof ms === "number" ? ms : 0;
  return utcnowIso(new Date(n));
}

export function normalizeUsgs(data: unknown, limit: number): Record<string, unknown> {
  if (typeof data !== "object" || data === null || !Array.isArray((data as { features?: unknown }).features)) {
    throw new Error("Unexpected USGS response shape");
  }
  const features = (data as { features: UsgsFeature[] }).features;
  const points: Record<string, unknown>[] = [];
  const severityCounts: Record<string, number> = { low: 0, moderate: 0, high: 0, critical: 0 };
  let maxMag = 0;
  for (const feature of features.slice(0, limit)) {
    if (typeof feature !== "object" || feature === null) throw new Error("Unexpected USGS feature shape");
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const mag = props.mag as number | null | undefined;
    if (mag === null || mag === undefined) continue;
    if (typeof mag !== "number") throw new Error("Unexpected USGS magnitude shape");
    const coords = ((feature.geometry ?? {}) as { coordinates?: unknown }).coordinates as unknown;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const [lon, lat] = coords as [unknown, unknown];
    if (typeof lat !== "number" || typeof lon !== "number" || !isValidCoordinate(lat, lon)) continue;
    if (mag > maxMag) maxMag = mag;
    const severity = severityForMagnitude(mag);
    severityCounts[severity] += 1;
    points.push({
      id: (feature.id as string | undefined) ?? `usgs-${points.length}`,
      lat,
      lon,
      magnitude: mag,
      depth: coords.length > 2 ? (coords[2] as number) : 10,
      severity,
      timestamp: formatTime(props.time),
      location: (props.place as string | undefined) ?? "Unknown location",
      url: (props.url as string | undefined) ?? "",
    });
  }
  return {
    layer_id: "earthquakes",
    count: points.length,
    points,
    stats: {
      total_24h: points.filter((p) => (p.magnitude as number) >= 2.5).length,
      max_magnitude: Math.round(maxMag * 10) / 10,
      by_severity: severityCounts,
    },
  };
}

export async function getEarthquakeData(
  bbox?: string | null,
  limit = 500,
  minSeverity?: string | null,
): Promise<Record<string, unknown> & { data_status: unknown }> {
  const timeoutMs = serverConfig.usgsTimeoutMs;
  const baseUrl = serverConfig.usgsApiUrl;
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const params: Record<string, string | number> = {
    format: "geojson",
    starttime: fmt(start),
    endtime: fmt(now),
    minmagnitude: 2.5,
    orderby: "time",
    limit,
  };
  if (bbox) {
    const parts = bbox.split(",");
    if (parts.length === 4) {
      params.minlongitude = parts[0];
      params.minlatitude = parts[1];
      params.maxlongitude = parts[2];
      params.maxlatitude = parts[3];
    }
  }
  if (minSeverity) params.minmagnitude = SEVERITY_FLOORS[minSeverity] ?? 2.5;

  let data: unknown;
  try {
    const res = await fetchJsonWithTimeout(`${baseUrl}/fdsnws/event/1/query`, { params, timeoutMs });
    if (res.status >= 400) throw new Error(`USGS responded with status ${res.status}`);
    data = res.json;
  } catch (e) {
    logWarn("USGS provider unreachable, using fallback", String(e));
    const fallback = generateMockEarthquakes(bbox, limit);
    return withStatus(fallback, SIMULATED, SOURCE, "USGS unavailable — showing simulated fallback data.");
  }

  try {
    const payload = normalizeUsgs(data, limit);
    return withStatus(payload, LIVE, SOURCE, undefined, utcnowIso());
  } catch (e) {
    logError("USGS response normalization failed", String(e));
    const fallback = generateMockEarthquakes(bbox, limit);
    return withStatus(fallback, SIMULATED, SOURCE, "USGS response malformed — showing simulated fallback data.");
  }
}
