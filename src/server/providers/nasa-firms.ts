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
