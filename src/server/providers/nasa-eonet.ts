/**
 * NASA EONET disasters provider — port of backend/app/services/nasa_eonet.py.
 */
import { serverConfig } from "../config";
import { fetchJsonWithTimeout, logError, logWarn } from "../http";
import { LIVE, SIMULATED, utcnowIso, withStatus } from "../provenance";
import { isValidCoordinate } from "../validation";
import { generateMockDisasters } from "./fallback";

export const SOURCE = "NASA EONET";

const SEVERITY_ORDER = ["low", "moderate", "high", "critical"];

export function severityForCategories(categories: { id?: string }[]): string {
  const ids = new Set(categories.map((c) => c?.id));
  if (ids.has("severeStorms") || ids.has("volcanoes")) return "high";
  if (ids.has("floods") || ids.has("wildfires")) return "moderate";
  return "low";
}

export function meetsMinSeverity(severity: string, minSeverity?: string | null): boolean {
  if (!minSeverity) return true;
  if (!SEVERITY_ORDER.includes(minSeverity) || !SEVERITY_ORDER.includes(severity)) return true;
  return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(minSeverity);
}

interface EonetEvent {
  id?: string | number;
  title?: string;
  categories?: { id?: string; title?: string }[];
  geometries?: { date?: string; coordinates?: unknown }[];
  sources?: { id?: string }[];
}

export function normalizeEonet(data: unknown, limit: number, minSeverity?: string | null) {
  if (typeof data !== "object" || data === null || !Array.isArray((data as { events?: unknown }).events)) {
    throw new Error("Unexpected EONET response shape");
  }
  const events = (data as { events: EonetEvent[] }).events;
  const points: Record<string, unknown>[] = [];
  for (const event of events.slice(0, limit)) {
    if (typeof event !== "object" || event === null) throw new Error("Unexpected EONET event shape");
    const categories = Array.isArray(event.categories) ? event.categories : [];
    const catTitle =
      categories.length > 0 && categories[0]?.title ? (categories[0].title as string) : "Unknown";
    const geometries = Array.isArray(event.geometries) ? event.geometries : [];
    if (geometries.length === 0) continue;
    const latestGeo = geometries[geometries.length - 1];
    const coords = latestGeo?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const [lon, lat] = coords as [unknown, unknown];
    if (typeof lat !== "number" || typeof lon !== "number" || !isValidCoordinate(lat, lon)) continue;
    const severity = severityForCategories(categories);
    if (!meetsMinSeverity(severity, minSeverity)) continue;
    points.push({
      id: `eonet-${event.id ?? points.length}`,
      lat,
      lon,
      type: catTitle.toLowerCase().replace(/ /g, "_"),
      severity,
      title: event.title ?? "Unknown Event",
      timestamp: latestGeo?.date ?? utcnowIso(),
      description: `${catTitle} event reported by NASA EONET`,
      sources: (Array.isArray(event.sources) ? event.sources : []).map((s) => s?.id ?? "eonet"),
      categories: categories.map((c) => c?.title ?? ""),
    });
  }
  return { layer_id: "disasters", count: points.length, points };
}

export async function getEonetEvents(
  bbox?: string | null,
  limit = 500,
  minSeverity?: string | null,
) {
  const params: Record<string, string | number> = { status: "open", limit };
  if (bbox) params.bbox = bbox;
  let data: unknown;
  try {
    const res = await fetchJsonWithTimeout(`${serverConfig.nasaEonetUrl}/events`, {
      params,
      timeoutMs: serverConfig.nasaEonetTimeoutMs,
    });
    if (res.status >= 400) throw new Error(`EONET responded with status ${res.status}`);
    data = res.json;
  } catch (e) {
    logWarn("EONET provider unreachable, using fallback", String(e));
    const fallback = generateMockDisasters(bbox, limit);
    return withStatus(fallback, SIMULATED, SOURCE, "NASA EONET unavailable — showing simulated fallback data.");
  }
  try {
    const payload = normalizeEonet(data, limit, minSeverity);
    return withStatus(payload, LIVE, SOURCE, undefined, utcnowIso());
  } catch (e) {
    logError("EONET response normalization failed", String(e));
    const fallback = generateMockDisasters(bbox, limit);
    return withStatus(fallback, SIMULATED, SOURCE, "NASA EONET response malformed — showing simulated fallback data.");
  }
}
