/**
 * Query-parameter validation — port of backend/app/utils/validation.py.
 * Malformed input yields 400, never 500.
 */

export const SEVERITIES = ["low", "moderate", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const TIME_RANGES = ["24h", "48h", "7d", "30d"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

export const LAYERS_WITHOUT_BBOX = new Set(["air_quality"]);

export const MAX_LIMIT = 2000;
export const DEFAULT_LIMIT = 500;
export const MAX_HEATMAP_RESOLUTION = 512;
export const DEFAULT_HEATMAP_RESOLUTION = 128;

/**
 * Strict decimal-integer shape for count-like params. `Number()` alone
 * accepts hex (`0x10`), scientific (`1e3`), and float spellings (`5.0`) —
 * none of which are legitimate counts, and all of which complicate reasoning
 * about fan-out/allocation caps. Plain ASCII digits only (after trim).
 */
function parseStrictInt(
  raw: string,
  kind: string,
  maximum: number,
): { value: number | null; error: string | null } {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) {
    return { value: null, error: `Invalid ${kind} ${JSON.stringify(raw)}: must be an integer between 1 and ${maximum}.` };
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    return { value: null, error: `Invalid ${kind} ${value}: must be between 1 and ${maximum}.` };
  }
  return { value, error: null };
}

export function parseLimit(
  raw: string | null | undefined,
  defaultValue = DEFAULT_LIMIT,
  maximum = MAX_LIMIT,
): { value: number | null; error: string | null } {
  if (raw === null || raw === undefined || raw === "") return { value: defaultValue, error: null };
  return parseStrictInt(raw, "limit", maximum);
}

export interface Bbox {
  min_lon: number;
  min_lat: number;
  max_lon: number;
  max_lat: number;
}

export function parseBbox(raw: string | null | undefined): { value: Bbox | null; error: string | null } {
  if (raw === null || raw === undefined || raw === "") return { value: null, error: null };
  const parts = raw.split(",");
  if (parts.length !== 4) {
    return { value: null, error: "Invalid bbox: expected 'minLon,minLat,maxLon,maxLat'." };
  }
  if (parts.some((p) => p.trim() === "")) {
    return { value: null, error: "Invalid bbox: all four values must be non-empty numbers." };
  }
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n))) {
    return { value: null, error: "Invalid bbox: all four values must be numbers." };
  }
  const [min_lon, min_lat, max_lon, max_lat] = nums;
  if (!(min_lat >= -90 && min_lat <= 90 && max_lat >= -90 && max_lat <= 90)) {
    return { value: null, error: "Invalid bbox: latitudes must be within -90..90." };
  }
  if (!(min_lon >= -180 && min_lon <= 180 && max_lon >= -180 && max_lon <= 180)) {
    return { value: null, error: "Invalid bbox: longitudes must be within -180..180." };
  }
  if (min_lon >= max_lon || min_lat >= max_lat) {
    return { value: null, error: "Invalid bbox: require minLon < maxLon and minLat < maxLat." };
  }
  return { value: { min_lon, min_lat, max_lon, max_lat }, error: null };
}

export function checkSupportedParams(layerId: string, bboxRaw?: string | null): string | null {
  if (bboxRaw && LAYERS_WITHOUT_BBOX.has(layerId)) {
    return (
      `Layer ${JSON.stringify(layerId)} does not support the 'bbox' parameter: ` +
      "its source is US-oriented and cannot honor an arbitrary global " +
      "bounding box. Omit 'bbox' to fetch this layer."
    );
  }
  return null;
}

export function parseSeverity(raw: string | null | undefined): { value: Severity | null; error: string | null } {
  if (raw === null || raw === undefined || raw === "") return { value: null, error: null };
  const value = raw.toLowerCase();
  if (!(SEVERITIES as readonly string[]).includes(value)) {
    return { value: null, error: `Invalid min_severity ${JSON.stringify(raw)}: must be one of ${SEVERITIES.join(", ")}.` };
  }
  return { value: value as Severity, error: null };
}

export function parseResolution(
  raw: string | null | undefined,
  defaultValue = DEFAULT_HEATMAP_RESOLUTION,
  maximum = MAX_HEATMAP_RESOLUTION,
): { value: number | null; error: string | null } {
  if (raw === null || raw === undefined || raw === "") return { value: defaultValue, error: null };
  return parseStrictInt(raw, "resolution", maximum);
}

export function parseTimeRange(
  raw: string | null | undefined,
  defaultValue = "24h",
): { value: string | null; error: string | null } {
  if (raw === null || raw === undefined || raw === "") return { value: defaultValue, error: null };
  if (!(TIME_RANGES as readonly string[]).includes(raw)) {
    return { value: null, error: `Invalid time_range ${JSON.stringify(raw)}: must be one of ${TIME_RANGES.join(", ")}.` };
  }
  return { value: raw, error: null };
}

export function parseLatLon(
  latRaw: string | null | undefined,
  lonRaw: string | null | undefined,
): { value: [number, number] | null; error: string | null } {
  // Mirror Flask order: numeric parse first ("must be numbers"), then
  // presence check ("required"). Empty string is not a number (float("") raises).
  const toNum = (raw: string | null | undefined): number | null | "nan" => {
    if (raw === null || raw === undefined) return null;
    if (raw.trim() === "") return "nan";
    const n = Number(raw);
    return Number.isNaN(n) ? "nan" : n;
  };
  const lat = toNum(latRaw);
  const lon = toNum(lonRaw);
  if (lat === "nan" || lon === "nan") {
    return { value: null, error: "lat and lon must be numbers." };
  }
  if (lat === null || lon === null) {
    return { value: null, error: "lat and lon are required." };
  }
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) {
    return { value: null, error: "lat must be within -90..90 and lon within -180..180." };
  }
  return { value: [lat, lon], error: null };
}

export function isValidCoordinate(lat: unknown, lon: unknown): boolean {
  if (typeof lat === "boolean" || typeof lon === "boolean") return false;
  if (typeof lat !== "number" || typeof lon !== "number") return false;
  if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * Free-text search query contract (T1.5). The 200-character cap is retained:
 * nothing in the client, docs, or tests depends on a different value, and no
 * security finding justifies shrinking it — the hardening here is trim +
 * control-character rejection. Unicode/location names pass through untouched.
 */
export const MAX_QUERY_LENGTH = 200;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

export function parseSearchQuery(
  raw: string | null | undefined,
  maximum = MAX_QUERY_LENGTH,
): { value: string | null; error: string | null } {
  const query = (raw ?? "").trim();
  if (query.length > maximum) {
    return { value: null, error: `Query must be at most ${maximum} characters.` };
  }
  if (CONTROL_CHARS_RE.test(query)) {
    return { value: null, error: "Query must not contain control characters." };
  }
  return { value: query, error: null };
}
