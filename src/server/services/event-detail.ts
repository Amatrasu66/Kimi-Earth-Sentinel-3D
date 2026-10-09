/**
 * Live event-detail lookups — port of backend/app/services/event_detail.py.
 */
import { serverConfig } from "../config";
import { fetchJsonWithTimeout, fetchTextWithTimeout, logError, logWarn } from "../http";
import {
  LIVE,
  SIMULATED,
  utcnowIso,
  withStatus,
  type DataStatus,
} from "../provenance";
import { isValidCoordinate } from "../validation";
import { getMockEventDetail } from "../providers/fallback";
import {
  findFirmsObservation,
  parseFireEventId,
  severityForBrightness as severityForFirmsBrightness,
  type FirmsObservation,
} from "../providers/nasa-firms";
import { severityForCategories } from "../providers/nasa-eonet";
import { severityForMagnitude } from "../providers/usgs";
import { resolveWithCache } from "./layers";

export const PROVIDER_USGS = "usgs";
export const PROVIDER_EONET = "eonet";
export const PROVIDER_FIRMS = "firms";
export const EVENT_DETAIL_TTL = 300;

const USGS_ID_RE = /^[A-Za-z0-9]{4,64}$/;

export class EventNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventNotFound";
  }
}

export function resolveProvider(eventId: string): "usgs" | "eonet" | null {
  if (eventId.startsWith("eonet-") && eventId.length > "eonet-".length) return PROVIDER_EONET;
  if (eventId.startsWith("fire-") || eventId.startsWith("usgs-")) return null;
  if (USGS_ID_RE.test(eventId)) return PROVIDER_USGS;
  return null;
}

export function eventCacheKey(provider: string, eventId: string): string {
  return `event:${provider}:${eventId}`;
}

function msToIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const ms = Number(value);
  if (Number.isNaN(ms)) return null;
  return utcnowIso(new Date(ms));
}

// --- USGS ---

async function fetchUsgsEvent(baseUrl: string, eventId: string, timeoutMs: number): Promise<unknown> {
  const res = await fetchJsonWithTimeout(
    `${baseUrl}/earthquakes/feed/v1.0/detail/${eventId}.geojson`,
    { timeoutMs },
  );
  if (res.status === 404) throw new EventNotFound(`USGS event ${JSON.stringify(eventId)} not found.`);
  if (res.status >= 400) throw new Error(`USGS detail responded with status ${res.status}`);
  return res.json;
}

function normalizeUsgsEvent(feature: unknown, eventId: string): Record<string, unknown> {
  if (typeof feature !== "object" || feature === null) throw new Error("Unexpected USGS detail response shape");
  const rec = feature as Record<string, unknown>;
  const props = rec.properties as Record<string, unknown> | undefined;
  if (!props || typeof props !== "object") throw new Error("Unexpected USGS detail response shape");
  const geometry = (rec.geometry ?? {}) as { type?: string; coordinates?: unknown };
  const coords = geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) throw new Error("USGS detail has no usable coordinates");
  const [lon, lat] = coords as [unknown, unknown];
  if (typeof lat !== "number" || typeof lon !== "number" || !isValidCoordinate(lat, lon)) {
    throw new Error("USGS detail coordinates out of range");
  }
  const mag = props.mag as number | null | undefined;
  const tsunami = props.tsunami as number | null | undefined;
  return {
    id: (rec.id as string | undefined) ?? eventId,
    layer_id: "earthquakes",
    provider: "USGS",
    type: (props.type as string | undefined) ?? "earthquake",
    title: (props.title as string | undefined) ?? (mag != null ? `M${mag} earthquake` : "Earthquake"),
    description: null,
    lat,
    lon,
    depth: coords.length > 2 ? (coords[2] as number) : null,
    timestamp: msToIso(props.time),
    updated_at: msToIso(props.updated),
    severity: mag != null ? severityForMagnitude(mag) : "low",
    magnitude: mag ?? null,
    magnitude_unit: (props.magType as string | undefined) ?? null,
    status: (props.status as string | undefined) ?? null,
    closed_at: null,
    source: { name: "USGS", url: (props.url as string | undefined) ?? "" },
    categories: null,
    geometry_type: geometry.type ?? null,
    felt: (props.felt as number | undefined) ?? null,
    alert: (props.alert as string | undefined) ?? null,
    tsunami: tsunami != null ? Boolean(tsunami) : null,
    significance: (props.sig as number | undefined) ?? null,
  };
}

async function liveUsgsDetail(eventId: string) {
  const timeoutMs = serverConfig.usgsTimeoutMs;
  let feature: unknown;
  try {
    feature = await fetchUsgsEvent(serverConfig.usgsApiUrl, eventId, timeoutMs);
  } catch (e) {
    if (e instanceof EventNotFound) throw e;
    logWarn("USGS event detail unreachable, using fallback", String(e));
    return withStatus(
      getMockEventDetail(eventId),
      SIMULATED,
      "USGS",
      "USGS event detail unavailable — showing simulated fallback data.",
    );
  }
  try {
    const payload = normalizeUsgsEvent(feature, eventId);
    return withStatus(payload, LIVE, "USGS", undefined, utcnowIso());
  } catch (e) {
    logError("USGS event detail normalization failed", String(e));
    return withStatus(
      getMockEventDetail(eventId),
      SIMULATED,
      "USGS",
      "USGS event detail malformed — showing simulated fallback data.",
    );
  }
}

// --- EONET ---

async function fetchEonetEvent(baseUrl: string, eonetId: string, timeoutMs: number): Promise<unknown> {
  const res = await fetchJsonWithTimeout(`${baseUrl}/events/${eonetId}`, { timeoutMs });
  if (res.status === 404) throw new EventNotFound(`EONET event ${JSON.stringify(eonetId)} not found.`);
  if (res.status >= 400) throw new Error(`EONET detail responded with status ${res.status}`);
  return res.json;
}

function latestGeometry(geometries: unknown): Record<string, unknown> {
  const list = Array.isArray(geometries) ? geometries.filter((g) => typeof g === "object" && g !== null) : [];
  if (list.length === 0) return {};
  return list.reduce((a: Record<string, unknown>, b: Record<string, unknown>) =>
    String(a.date ?? "") >= String(b.date ?? "") ? a : b,
  ) as Record<string, unknown>;
}

function normalizeEonetEvent(event: unknown, markerId: string): Record<string, unknown> {
  if (typeof event !== "object" || event === null || !("id" in event)) {
    throw new Error("Unexpected EONET event response shape");
  }
  const rec = event as Record<string, unknown>;
  const categories = (Array.isArray(rec.categories) ? rec.categories : []) as { title?: string; id?: string }[];
  const catTitles = categories.filter((c) => c?.title).map((c) => c.title as string);
  const catTitle = catTitles[0] ?? "Unknown";
  const rawSources = (Array.isArray(rec.sources) ? rec.sources : []) as { id?: string; url?: string }[];
  const sources = rawSources.filter((s) => typeof s === "object" && s !== null).map((s) => ({
    id: s.id ?? "eonet",
    url: s.url ?? "",
  }));
  const latest = latestGeometry(rec.geometries);
  const geomType = latest.type as string | undefined;
  const coords = latest.coordinates;
  let lat: number | null = null;
  let lon: number | null = null;
  if (
    geomType === "Point" &&
    Array.isArray(coords) &&
    coords.length >= 2 &&
    typeof coords[0] === "number" &&
    typeof coords[1] === "number" &&
    isValidCoordinate(coords[1], coords[0])
  ) {
    lon = coords[0];
    lat = coords[1];
  }
  const closed = rec.closed as string | null | undefined;
  return {
    id: markerId,
    layer_id: "disasters",
    provider: "NASA EONET",
    type: catTitle.toLowerCase().replace(/ /g, "_"),
    title: (rec.title as string | undefined) ?? "Unknown Event",
    description: (rec.description as string | undefined) ?? null,
    lat,
    lon,
    timestamp: (latest.date as string | undefined) ?? null,
    updated_at: null,
    severity: severityForCategories(categories),
    magnitude: (latest.magnitudeValue as number | undefined) ?? null,
    magnitude_unit: (latest.magnitudeUnit as string | undefined) ?? null,
    status: closed ? "closed" : "open",
    closed_at: closed ?? null,
    source: { name: "NASA EONET", url: (rec.link as string | undefined) ?? "" },
    categories: catTitles.length ? catTitles : null,
    geometry_type: geomType ?? null,
    sources,
    felt: null,
    alert: null,
    tsunami: null,
    significance: null,
  };
}

async function liveEonetDetail(markerId: string) {
  const eonetId = markerId.slice("eonet-".length);
  const timeoutMs = serverConfig.nasaEonetTimeoutMs;
  let event: unknown;
  try {
    event = await fetchEonetEvent(serverConfig.nasaEonetUrl, eonetId, timeoutMs);
  } catch (e) {
    if (e instanceof EventNotFound) throw e;
    logWarn("EONET event detail unreachable, using fallback", String(e));
    return withStatus(
      getMockEventDetail(markerId),
      SIMULATED,
      "NASA EONET",
      "NASA EONET event detail unavailable — showing simulated fallback data.",
    );
  }
  try {
    const payload = normalizeEonetEvent(event, markerId);
    return withStatus(payload, LIVE, "NASA EONET", undefined, utcnowIso());
  } catch (e) {
    logError("EONET event detail normalization failed", String(e));
    return withStatus(
      getMockEventDetail(markerId),
      SIMULATED,
      "NASA EONET",
      "NASA EONET event detail malformed — showing simulated fallback data.",
    );
  }
}

// --- Simulated-only ids ---

function simulatedFireDetail(eventId: string, message: string) {
  const event = getMockEventDetail(eventId) as Record<string, unknown>;
  event.layer_id = "wildfires";
  event.type = "wildfire";
  event.source = { name: "NASA FIRMS", url: serverConfig.nasaFirmsUrl };
  return withStatus(event, SIMULATED, "NASA FIRMS", message);
}

function simulatedEventDetail(eventId: string) {
  const event = getMockEventDetail(eventId) as Record<string, unknown>;
  if (eventId.startsWith("fire-")) {
    return simulatedFireDetail(
      eventId,
      "No live individual-event lookup for FIRMS fire observations — showing reference detail for this marker.",
    );
  }
  const source = ((event.source ?? {}) as { name?: string }).name ?? "fallback";
  return withStatus(
    event,
    SIMULATED,
    source,
    "No live event lookup for this marker — showing simulated detail.",
  );
}

// --- Live FIRMS wildfire detail (T2.3) ---

export function isFireEventId(eventId: string): boolean {
  return eventId.startsWith("fire-");
}

/**
 * Combine FIRMS acq_date (YYYY-MM-DD) + acq_time (HHMM) into an ISO UTC
 * timestamp. Returns null when either field is missing or malformed — the
 * existing missing-field convention — instead of fabricating a time.
 */
export function firmsAcqTimestamp(acqDate: string, acqTime: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acqDate)) return null;
  const digits = acqTime.replace(/\D/g, "");
  if (digits.length === 0 || digits.length > 4) return null;
  const padded = digits.padStart(4, "0");
  const hh = Number(padded.slice(0, 2));
  const mm = Number(padded.slice(2));
  if (hh > 23 || mm > 59) return null;
  return `${acqDate}T${padded.slice(0, 2)}:${padded.slice(2)}:00Z`;
}

function buildFirmsDetail(obs: FirmsObservation, eventId: string): Record<string, unknown> {
  const when = firmsAcqTimestamp(obs.acqDate, obs.acqTime);
  const platform = obs.satellite || "unknown satellite";
  return {
    id: eventId,
    layer_id: "wildfires",
    provider: "NASA FIRMS",
    type: "wildfire",
    title: "Wildfire Hotspot",
    lat: obs.lat,
    lon: obs.lon,
    timestamp: when,
    description:
      `NASA FIRMS hotspot observed by ${platform}` +
      (obs.instrument ? ` (${obs.instrument})` : "") +
      (when ? ` at ${when}` : "") +
      ". Brightness and FRP describe the thermal signal, not fire size or burned area.",
    severity: severityForFirmsBrightness(obs.bright),
    brightness: obs.bright,
    frp: obs.frp,
    confidence: obs.confidence || null,
    daynight: obs.daynight || null,
    satellite: obs.satellite || null,
    instrument: obs.instrument || null,
    acq_date: obs.acqDate || null,
    acq_time: obs.acqTime || null,
    source: { name: "NASA FIRMS", url: serverConfig.nasaFirmsUrl },
    geometry: { type: "Point", coordinates: [obs.lon, obs.lat] },
  };
}

async function liveFirmsDetail(eventId: string) {
  const coords = parseFireEventId(eventId);
  const apiKey = coords ? serverConfig.nasaFirmsApiKey : null;
  if (!coords || !apiKey) {
    // Unreachable via the route (malformed fire ids are rejected with 400
    // and keyless instances never fetch), but safe for direct callers:
    // fall back exactly as before, never fabricate.
    return {
      data: simulatedEventDetail(eventId) as Record<string, unknown> & {
        data_status: DataStatus;
      },
      cacheHit: false,
      stale: false,
    };
  }
  const key = eventCacheKey(PROVIDER_FIRMS, eventId);
  return resolveWithCache(key, EVENT_DETAIL_TTL, async () => {
    let csvText: string;
    try {
      const res = await fetchTextWithTimeout(
        `${serverConfig.nasaFirmsUrl}/area/csv/VIIRS_NOAA20_NRT/${apiKey}/WORLD/1`,
        { timeoutMs: serverConfig.nasaFirmsTimeoutMs },
      );
      if (res.status >= 400) throw new Error(`FIRMS detail responded with status ${res.status}`);
      csvText = res.text;
    } catch (e) {
      logWarn("FIRMS event detail unreachable, using fallback", String(e));
      return simulatedFireDetail(
        eventId,
        "NASA FIRMS event detail unavailable — showing simulated fallback data.",
      );
    }
    const obs = findFirmsObservation(csvText, coords.lat, coords.lon);
    if (!obs) {
      return simulatedFireDetail(
        eventId,
        "Marker observation not found in the current FIRMS feed — showing simulated reference detail.",
      );
    }
    return withStatus(buildFirmsDetail(obs, eventId), LIVE, "NASA FIRMS", undefined, utcnowIso());
  });
}

export async function getEventDetail(eventId: string) {
  const provider = resolveProvider(eventId);
  if (provider === null) {
    // T2.3: fire-<lat>-<lon> markers re-associate their source observation
    // from a fresh feed fetch; everything else keeps the simulated path.
    if (isFireEventId(eventId)) return liveFirmsDetail(eventId);
    return { data: simulatedEventDetail(eventId) as Record<string, unknown> & { data_status: DataStatus }, cacheHit: false, stale: false };
  }
  const key = eventCacheKey(provider, eventId);
  if (provider === PROVIDER_USGS) {
    return resolveWithCache(key, EVENT_DETAIL_TTL, liveUsgsDetail.bind(null, eventId));
  }
  return resolveWithCache(key, EVENT_DETAIL_TTL, liveEonetDetail.bind(null, eventId));
}
