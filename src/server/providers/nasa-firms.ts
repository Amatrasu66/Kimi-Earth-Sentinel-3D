/**
 * NASA FIRMS wildfires provider — port of backend/app/services/nasa_firms.py.
 * Uses a robust CSV parser (handles quoted fields / embedded commas) instead
 * of the fragile naive `line.split(",")` from the Python implementation,
 * while preserving the normalized output contract.
 */
import { serverConfig } from "../config";
import { fetchTextWithTimeout, logError, logWarn } from "../http";
import { LIVE, SIMULATED, utcnowIso, withStatus } from "../provenance";
import { isValidCoordinate } from "../validation";
import {
  bboxContains,
  generateMockFires,
  meetsMinSeverity,
  severityForBrightness,
} from "./fallback";

export const SOURCE = "NASA FIRMS";

export { severityForBrightness, meetsMinSeverity, bboxContains };

/** A single parsed FIRMS active-fire observation (VIIRS NRT columns). */
export interface FirmsObservation {
  lat: number;
  lon: number;
  bright: number;
  acqDate: string;
  acqTime: string;
  satellite: string;
  instrument: string;
  confidence: string;
  version: string;
  brightTi5: number | null;
  frp: number | null;
  daynight: string;
  scan: number | null;
  track: number | null;
  type: string;
}

const COORD_NUM = "-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?";
const FIRE_ID_RE = new RegExp(`^fire-(${COORD_NUM})-(${COORD_NUM})$`);

/**
 * T2.3 marker identity: wildfire markers carry `fire-<lat>-<lon>` ids built
 * from the observation's parsed coordinates (`normalizeFirmsCsv`), so the
 * detail lookup can re-associate the exact observation without embedding
 * payloads in the id. The numeric groups exclude `-`, so negative
 * coordinates (e.g. `fire-34.1--118.2`) split unambiguously. Returns null
 * for malformed ids.
 */
export function parseFireEventId(eventId: string): { lat: number; lon: number } | null {
  const match = FIRE_ID_RE.exec(eventId);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!isValidCoordinate(lat, lon)) return null;
  return { lat, lon };
}

function numOrNull(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function strOrEmpty(value: string | undefined): string {
  return value ?? "";
}

/**
 * T2.3: locate one observation in a FIRMS CSV feed by marker coordinates.
 * Column positions resolve by header name (VIIRS `bright_ti4` or MODIS
 * `brightness`). Numeric coordinate equality reuses the same parse path as
 * the marker-id builder, so identical observations compare equal. When
 * several rows share coordinates (repeat overpasses), the latest
 * acquisition wins. Returns null when nothing usable matches.
 */
export function findFirmsObservation(
  csvText: string,
  lat: number,
  lon: number,
): FirmsObservation | null {
  const rows = parseCsvRows(csvText.trim());
  if (rows.length < 2) return null;
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string, fallback: number): number => {
    const idx = header.indexOf(name);
    return idx >= 0 ? idx : fallback;
  };
  const latIdx = col("latitude", 0);
  const lonIdx = col("longitude", 1);
  const brightIdx =
    header.indexOf("bright_ti4") >= 0
      ? header.indexOf("bright_ti4")
      : header.indexOf("brightness") >= 0
        ? header.indexOf("brightness")
        : 2;
  const scanIdx = col("scan", -1);
  const trackIdx = col("track", -1);
  const dateIdx = col("acq_date", -1);
  const timeIdx = col("acq_time", -1);
  const satIdx = col("satellite", -1);
  const instIdx = col("instrument", -1);
  const confIdx = col("confidence", -1);
  const verIdx = col("version", -1);
  const ti5Idx = col("bright_ti5", -1);
  const frpIdx = col("frp", -1);
  const dnIdx = col("daynight", -1);
  const typeIdx = col("type", -1);
  const cell = (parts: string[], idx: number): string | undefined =>
    idx >= 0 ? parts[idx] : undefined;

  let best: FirmsObservation | null = null;
  let bestAcq = "";
  for (const parts of rows.slice(1)) {
    if (parts.length < 3) continue;
    const rowLat = Number(parts[latIdx]);
    const rowLon = Number(parts[lonIdx]);
    if (rowLat !== lat || rowLon !== lon) continue;
    const bright = numOrNull(parts[brightIdx]);
    // Brightness drives severity/value: a row without it cannot produce an
    // honest live detail (never defaulted here, unlike the marker list).
    if (bright === null) continue;
    if (!isValidCoordinate(rowLat, rowLon)) continue;
    const acqDate = strOrEmpty(cell(parts, dateIdx));
    const acqTime = strOrEmpty(cell(parts, timeIdx));
    const acqKey = `${acqDate}T${acqTime}`;
    if (best !== null && acqKey <= bestAcq) continue;
    bestAcq = acqKey;
    best = {
      lat: rowLat,
      lon: rowLon,
      bright,
      acqDate,
      acqTime,
      satellite: strOrEmpty(cell(parts, satIdx)),
      instrument: strOrEmpty(cell(parts, instIdx)),
      confidence: strOrEmpty(cell(parts, confIdx)),
      version: strOrEmpty(cell(parts, verIdx)),
      brightTi5: numOrNull(cell(parts, ti5Idx)),
      frp: numOrNull(cell(parts, frpIdx)),
      daynight: strOrEmpty(cell(parts, dnIdx)),
      scan: numOrNull(cell(parts, scanIdx)),
      track: numOrNull(cell(parts, trackIdx)),
      type: strOrEmpty(cell(parts, typeIdx)),
    };
  }
  return best;
}

/** Minimal RFC-4180 CSV row parser (quoted fields, escaped quotes, commas). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (ch === "\r") {
      // skip; \n handles the break
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function normalizeFirmsCsv(
  csvText: string,
  limit: number,
  bbox?: string | null,
  minSeverity?: string | null,
) {
  const rows = parseCsvRows(csvText.trim());
  const dataRows = rows.slice(1); // skip header
  const points: Record<string, unknown>[] = [];
  // Column positions follow the FIRMS VIIRS NRT header (latitude, longitude, bright_ti4, ...).
  // Resolve by header name when available for robustness.
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const latIdx = header.indexOf("latitude") >= 0 ? header.indexOf("latitude") : 0;
  const lonIdx = header.indexOf("longitude") >= 0 ? header.indexOf("longitude") : 1;
  const brightIdx =
    header.indexOf("bright_ti4") >= 0
      ? header.indexOf("bright_ti4")
      : header.indexOf("brightness") >= 0
        ? header.indexOf("brightness")
        : 2;
  for (const parts of dataRows) {
    if (points.length >= limit) break;
    if (parts.length < 3) continue;
    const lat = Number(parts[latIdx]);
    const lon = Number(parts[lonIdx]);
    const bright = parts[brightIdx] !== undefined && parts[brightIdx] !== "" ? Number(parts[brightIdx]) : 300;
    if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(bright)) continue;
    if (!isValidCoordinate(lat, lon)) continue;
    const severity = severityForBrightness(bright);
    if (!meetsMinSeverity(severity, minSeverity)) continue;
    if (!bboxContains(bbox, lat, lon)) continue;
    points.push({
      id: `fire-${lat}-${lon}`,
      lat,
      lon,
      value: Math.round(bright * 10) / 10,
      severity,
      timestamp: utcnowIso(),
      unit: "brightness",
    });
  }
  return { layer_id: "wildfires", count: points.length, points, unit: "brightness" };
}

export async function getFireData(
  bbox?: string | null,
  limit = 500,
  minSeverity?: string | null,
) {
  const apiKey = serverConfig.nasaFirmsApiKey;
  if (!apiKey) {
    return withStatus(
      generateMockFires(bbox, limit, minSeverity),
      SIMULATED,
      SOURCE,
      "No NASA FIRMS API key configured — showing simulated fallback data.",
    );
  }
  let csvText: string;
  try {
    const res = await fetchTextWithTimeout(
      `${serverConfig.nasaFirmsUrl}/area/csv/VIIRS_NOAA20_NRT/${apiKey}/WORLD/1`,
      { timeoutMs: serverConfig.nasaFirmsTimeoutMs },
    );
    if (res.status >= 400) throw new Error(`FIRMS responded with status ${res.status}`);
    csvText = res.text;
  } catch (e) {
    logWarn("FIRMS provider unreachable, using fallback", String(e));
    return withStatus(
      generateMockFires(bbox, limit, minSeverity),
      SIMULATED,
      SOURCE,
      "NASA FIRMS unavailable — showing simulated fallback data.",
    );
  }
  try {
    const payload = normalizeFirmsCsv(csvText, limit, bbox, minSeverity);
    return withStatus(payload, LIVE, SOURCE, undefined, utcnowIso());
  } catch (e) {
    logError("FIRMS response normalization failed", String(e));
    return withStatus(
      generateMockFires(bbox, limit, minSeverity),
      SIMULATED,
      SOURCE,
      "NASA FIRMS response malformed — showing simulated fallback data.",
    );
  }
}
