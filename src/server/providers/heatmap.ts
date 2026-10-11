/**
 * Real numerical heatmap grids (T2.8) — no seeded or synthetic values.
 *
 * Two grid families, one response contract (base64 LE float32, row-major,
 * `resolution` columns × `ceil(resolution/2)` rows, 2:1 equirectangular —
 * see `heatmapGridPoints`):
 *
 * MODEL layers (temperature, precipitation, clouds, wind, air_quality):
 * coarse global sampling of genuine model estimates — one Open-Meteo
 * `current=<variable>` value per cell center (canonical documented variable
 * names; the layer path's legacy aliases are equally accepted upstream but
 * new code uses the documented spellings). Each cell is a real estimate
 * with known coordinates and timestamp; unobserved cells are NaN (missing,
 * never zero). This is deliberately coarse (≥18° spacing at the cap) and
 * documented as sampling, NOT fine-grained measurement.
 *
 * EVENT layers (earthquakes, disasters, wildfires): per-cell counts of
 * genuine observations over the `time_range` window (USGS M2.5+, EONET
 * unique events, FIRMS detections) binned with the same normalizers as the
 * layer paths. Zeros inside a fully observed window are genuine zeros;
 * provider failure is NEVER a zero grid (stale → UNAVAILABLE).
 *
 * Bounds (T2.2 preserved, budget §6): at most MAX_HEATMAP_POINTS (200) cells
 * per request → `resolution` ≤ REAL_MAX_RESOLUTION (20). Higher requests are
 * served at the documented lower resolution (disclosed in-band via the
 * echoed `resolution` + status message), never silently truncated; >512
 * still 400s at validation. Batches of 50 through the shared pool at
 * concurrency 2; existing per-provider timeouts apply. Worst supported
 * payload ≈ 2 KB raw (~1 KB gzip) vs the 250 KB budget — verified in-test.
 */
import { serverConfig } from "../config";
import { fetchJsonWithTimeout, logWarn } from "../http";
import { LIVE, UNAVAILABLE, utcnowIso, withStatus } from "../provenance";
import type { DataStatus } from "../provenance";
import { runBatches } from "../batch-pool";
import { normalizeUsgs } from "./usgs";
import { normalizeEonet } from "./nasa-eonet";
import { normalizeFirmsCsv } from "./nasa-firms";
import {
  EONET_STATS_LIMIT,
  FIRMS_STATS_MAX_ROWS,
  FirmsKeyMissingError,
  StatsUnavailableError,
  USGS_STATS_LIMIT,
  fetchEonetEvents,
  fetchFirmsCsv,
  fetchQuakeFeatures,
} from "../services/stats";

/** Real-data resolution cap: 20 → 20×10 = 200 cells (see MAX_HEATMAP_POINTS). */
export const REAL_MAX_RESOLUTION = 20;
/** Point-count maximum per heatmap request (mirrors the layer fetch cap). */
export const MAX_HEATMAP_POINTS = 200;

export const UNIT_MAP: Record<string, string> = {
  temperature: "celsius",
  precipitation: "mm",
  air_quality: "AQI",
  clouds: "percent",
  wind: "km/h",
};
/** Unit for provider-observation density grids (counts, not magnitudes). */
export const COUNT_UNIT = "count";

interface ModelSpec {
  variable: string;
  unit: string;
  source: string;
  aq: boolean;
}

const MODEL_LAYERS: Record<string, ModelSpec> = {
  temperature: { variable: "temperature_2m", unit: "celsius", source: "Open-Meteo", aq: false },
  precipitation: { variable: "precipitation", unit: "mm", source: "Open-Meteo", aq: false },
  clouds: { variable: "cloud_cover", unit: "percent", source: "Open-Meteo", aq: false },
  wind: { variable: "wind_speed_10m", unit: "km/h", source: "Open-Meteo", aq: false },
  air_quality: { variable: "us_aqi", unit: "AQI", source: "Open-Meteo Air Quality", aq: true },
};

const EVENT_LAYERS = ["earthquakes", "disasters", "wildfires"] as const;

/** Clamp to the real-data maximum (defense in depth; routes key on this too). */
export function effectiveResolution(resolution: number): number {
  return Math.max(1, Math.min(Math.floor(resolution), REAL_MAX_RESOLUTION));
}

/**
 * Row-major equirectangular cell centers for an effective resolution R:
 * width R, height ceil(R/2). Cell (r,c): lon=-180+(c+0.5)*360/R,
 * lat=90-(r+0.5)*180/H. Pure — unit-tested.
 */
export function heatmapGridPoints(resolution: number): { lat: number; lon: number }[] {
  const width = Math.max(1, Math.floor(resolution));
  const height = Math.max(1, Math.ceil(width / 2));
  const points: { lat: number; lon: number }[] = [];
  for (let r = 0; r < height; r += 1) {
    for (let c = 0; c < width; c += 1) {
      points.push({
        lat: 90 - ((r + 0.5) * 180) / height,
        lon: -180 + ((c + 0.5) * 360) / width,
      });
    }
  }
  return points;
}

/** Row index for a latitude in an H-row grid; always in range (clamped). */
export function rowForLat(lat: number, height: number): number {
  return Math.max(0, Math.min(height - 1, Math.floor(((90 - lat) * height) / 180)));
}

/** Column index for a longitude in a W-column grid; always in range (clamped). */
export function colForLon(lon: number, width: number): number {
  return Math.max(0, Math.min(width - 1, Math.floor(((lon + 180) * width) / 360)));
}

/** Float32 little-endian → base64 (the preserved response encoding). Pure. */
export function encodeGrid(values: ArrayLike<number>): string {
  const grid = Float32Array.from(values, (v) => (typeof v === "number" ? v : Number.NaN));
  return Buffer.from(grid.buffer, grid.byteOffset, grid.byteLength).toString("base64");
}

/** Base64 LE float32 → numbers (test/verification helper; mirrors the client decode). */
export function decodeGrid(base64: string): number[] {
  if (!base64) return [];
  const bytes = Buffer.from(base64, "base64");
  const grid = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  return Array.from(grid);
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface CellSample {
  value: number | null;
}

async function fetchModelCells(
  spec: ModelSpec,
  points: { lat: number; lon: number }[],
  opts?: { signal?: AbortSignal },
): Promise<{ cells: CellSample[]; failures: number; fetchedAt: string }> {
  const baseUrl = spec.aq ? serverConfig.openMeteoAqUrl : serverConfig.openMeteoUrl;
  const path = spec.aq ? "air-quality" : "forecast";
  const timeoutMs = serverConfig.openMeteoTimeoutMs;
  const baseParams: Record<string, string | number> = { current: spec.variable };
  if (!spec.aq) {
    baseParams.temperature_unit = "celsius";
    baseParams.windspeed_unit = "kmh";
  }
  const pointChunks = chunks(points, 50);
  const outcomes = await runBatches(
    pointChunks,
    2,
    async (chunk, _index, signal) => {
      try {
        const res = await fetchJsonWithTimeout(`${baseUrl}/${path}`, {
          params: {
            ...baseParams,
            latitude: chunk.map((p) => p.lat.toFixed(4)).join(","),
            longitude: chunk.map((p) => p.lon.toFixed(4)).join(","),
          },
          timeoutMs,
          signal,
        });
        if (res.status >= 400) throw new Error(`Open-Meteo ${path} responded with status ${res.status}`);
        if (Array.isArray(res.json)) return { results: res.json as Record<string, unknown>[] };
        if (res.json !== null && typeof res.json === "object") {
          return { results: [res.json as Record<string, unknown>] };
        }
        throw new Error(`Unexpected Open-Meteo ${path} response shape`);
      } catch (error) {
        return { error };
      }
    },
    opts?.signal,
  );
  // Re-associate by chunk index so coordinate/value pairing survives partial
  // failure (the same ordering guarantee as the layer paths).
  const cells: CellSample[] = points.map(() => ({ value: null }));
  let failures = 0;
  let offset = 0;
  for (let c = 0; c < pointChunks.length; c += 1) {
    const chunk = pointChunks[c];
    const outcome = outcomes[c];
    if (!("results" in outcome)) {
      failures += chunk.length;
      logWarn(`Open-Meteo heatmap batch failed (${spec.variable})`, String((outcome as { error: unknown }).error));
      offset += chunk.length;
      continue;
    }
    const { results } = outcome;
    for (let idx = 0; idx < chunk.length; idx += 1) {
      const current = ((results[idx] ?? {}) as Record<string, unknown>).current as
        | Record<string, unknown>
        | undefined;
      const raw = current?.[spec.variable];
      // Missing is missing: NaN downstream, never an invented zero.
      cells[offset + idx] = {
        value: typeof raw === "number" && Number.isFinite(raw) ? raw : null,
      };
      if (cells[offset + idx].value === null) {
        failures += 1;
        logWarn("Open-Meteo heatmap point has no value, skipping", `${spec.variable} @${chunk[idx].lat},${chunk[idx].lon}`);
      }
    }
    offset += chunk.length;
  }
  return { cells, failures, fetchedAt: utcnowIso() };
}

function minMax(values: number[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/** Real-heatmap payload (the preserved response contract + optional warnings). */
export interface HeatmapPayload extends Record<string, unknown> {
  layer_id: string;
  resolution: number;
  grid: string;
  min_value: number;
  max_value: number;
  unit: string;
  timestamp: string;
  warnings?: string[];
  data_status: DataStatus;
}

interface HeatmapBody extends Record<string, unknown> {
  layer_id: string;
  resolution: number;
  grid: string;
  min_value: number;
  max_value: number;
  unit: string;
  timestamp: string;
  warnings?: string[];
}

function heatmapPayload(
  layerId: string,
  resolution: number,
  values: number[],
  unit: string,
  timestamp: string,
  source: string,
  message: string | null,
  warnings: string[],
): HeatmapPayload {
  const { min, max } = minMax(values);
  const body: HeatmapBody = {
    layer_id: layerId,
    resolution,
    grid: encodeGrid(values),
    min_value: min,
    max_value: max,
    unit,
    timestamp,
  };
  if (warnings.length) body.warnings = warnings;
  return withStatus(body, LIVE, source, message);
}

async function getModelHeatmap(
  layerId: string,
  spec: ModelSpec,
  resolution: number,
  requested: number,
  opts?: { signal?: AbortSignal },
) {
  const points = heatmapGridPoints(resolution);
  const { cells, failures, fetchedAt } = await fetchModelCells(spec, points, opts);
  const values = cells.map((c) => (c.value === null ? Number.NaN : c.value));
  if (!values.some((v) => Number.isFinite(v))) {
    throw new Error(`Open-Meteo ${spec.variable} returned no usable values`);
  }
  const warnings: string[] = [];
  if (failures) warnings.push(`${failures} of ${points.length} cells could not be fetched (NaN).`);
  const clampedNote =
    requested !== resolution
      ? ` Requested resolution ${requested} exceeds the real-data maximum ${REAL_MAX_RESOLUTION}; serving ${resolution}.`
      : "";
  const message =
    `Coarse global sampling of ${spec.source} ${spec.variable} estimates ` +
    `(one live value per ${resolution}×${Math.ceil(resolution / 2)} cell center) — not fine-grained measurement.${clampedNote}` +
    (failures ? ` Partial coverage: ${failures} of ${points.length} cells missing.` : "") +
    (spec.aq ? " CAMS model estimates, not station observations." : "");
  return { payload: heatmapPayload(layerId, resolution, values, spec.unit, fetchedAt, spec.source, message, warnings), fetchedAt };
}

const TIME_RANGE_DAYS: Record<string, number> = {
  "24h": 1,
  "48h": 2,
  "7d": 7,
  "30d": 30,
};

async function getEventHeatmap(
  layerId: string,
  resolution: number,
  requested: number,
  timeRange: string,
  now: Date,
  opts?: { signal?: AbortSignal },
) {
  const days = TIME_RANGE_DAYS[timeRange] ?? 1;
  const end = now;
  const start = new Date(end.getTime() - days * 24 * 3600 * 1000);
  const ymd = (d: Date): string => d.toISOString().slice(0, 10);
  let positions: { lat: number; lon: number }[];
  let source: string;
  if (layerId === "earthquakes") {
    const features = await fetchQuakeFeatures(start, end, opts);
    const payload = normalizeUsgs({ features }, USGS_STATS_LIMIT) as {
      points: Array<Record<string, unknown>>;
    };
    positions = payload.points.filter(
      (p): p is { lat: number; lon: number } =>
        typeof p.lat === "number" && typeof p.lon === "number",
    );
    source = "USGS";
  } else if (layerId === "disasters") {
    const events = await fetchEonetEvents("all", ymd(start), ymd(end), opts);
    const payload = normalizeEonet({ events }, EONET_STATS_LIMIT) as {
      points: Array<Record<string, unknown>>;
    };
    positions = payload.points.filter(
      (p): p is { lat: number; lon: number } =>
        typeof p.lat === "number" && typeof p.lon === "number",
    );
    source = "NASA EONET";
  } else if (layerId === "wildfires") {
    if (days > 10) {
      throw new StatsUnavailableError(
        "FIRMS area feeds support day ranges up to 10 days — no reliable 30-day wildfire grid.",
      );
    }
    const csv = await fetchFirmsCsv(days as 1 | 2 | 7, opts);
    const payload = normalizeFirmsCsv(csv, FIRMS_STATS_MAX_ROWS);
    positions = (payload.points as Array<Record<string, unknown>>).filter(
      (p): p is { lat: number; lon: number } =>
        typeof p.lat === "number" && typeof p.lon === "number",
    );
    source = "NASA FIRMS";
  } else {
    throw new Error(`No event grid for layer ${JSON.stringify(layerId)}`);
  }
  const width = Math.max(1, Math.floor(resolution));
  const height = Math.max(1, Math.ceil(width / 2));
  const counts = new Array<number>(width * height).fill(0);
  for (const p of positions) {
    counts[rowForLat(p.lat, height) * width + colForLon(p.lon, width)] += 1;
  }
  const clampedNote =
    requested !== resolution
      ? ` Requested resolution ${requested} exceeds the real-data maximum ${REAL_MAX_RESOLUTION}; serving ${resolution}.`
      : "";
  const message =
    `Per-cell counts of ${source} observations in the trailing ${timeRange} window ` +
    `(${width}×${height} cells). Zeros are observed zeros inside a fully covered window.${clampedNote}`;
  return {
    payload: heatmapPayload(layerId, resolution, counts, COUNT_UNIT, utcnowIso(), source, message, []),
    fetchedAt: utcnowIso(),
  };
}

function unavailableGrid(layerId: string, resolution: number, source: string, message: string): HeatmapPayload {
  return withStatus(
    {
      layer_id: layerId,
      resolution,
      grid: "",
      min_value: 0.0,
      max_value: 0.0,
      unit: "value",
      timestamp: utcnowIso(),
    },
    UNAVAILABLE,
    source,
    message,
  );
}

/** Provider source per layer for unavailable-grid attribution. */
function layerSource(layerId: string): string {
  const spec = MODEL_LAYERS[layerId];
  if (spec) return spec.source;
  if (layerId === "earthquakes") return "USGS";
  if (layerId === "disasters") return "NASA EONET";
  if (layerId === "wildfires") return "NASA FIRMS";
  return "none";
}

/**
 * Real-heatmap dispatcher. Unknown layers and deterministic gaps
 * (keyless FIRMS, 30d wildfires) → UNAVAILABLE payloads; transport/shape
 * failures → UNAVAILABLE payloads too — resolveWithCache turns cached
 * history into STALE, so failure is never a zero grid and never a 500.
 * NOTHING here is seeded or synthetic. `now` is injectable for tests.
 */
export async function getHeatmap(
  layerId: string,
  resolution = 128,
  timeRange = "24h",
  now: Date = new Date(),
  opts?: { signal?: AbortSignal },
): Promise<HeatmapPayload> {
  const effective = effectiveResolution(resolution);
  const spec = MODEL_LAYERS[layerId];
  if (spec) {
    try {
      const { payload } = await getModelHeatmap(layerId, spec, effective, resolution, opts);
      return payload;
    } catch (e) {
      logWarn(`Heatmap model source failed (${layerId})`, String(e));
      return unavailableGrid(layerId, effective, spec.source, `${spec.source} unavailable — no heatmap data.`);
    }
  }
  if ((EVENT_LAYERS as readonly string[]).includes(layerId)) {
    try {
      const { payload } = await getEventHeatmap(layerId, effective, resolution, timeRange, now, opts);
      return payload;
    } catch (e) {
      const source = layerSource(layerId);
      if (e instanceof StatsUnavailableError || e instanceof FirmsKeyMissingError) {
        logWarn(`Heatmap source deterministically unavailable (${layerId})`, String(e));
        return unavailableGrid(layerId, effective, source, e.message);
      }
      logWarn(`Heatmap event source failed (${layerId})`, String(e));
      return unavailableGrid(layerId, effective, source, `${source} unavailable — no heatmap data.`);
    }
  }
  return unavailableGrid(layerId, effective, "none", `No heatmap available for layer ${JSON.stringify(layerId)}.`);
}

/** Which grid family serves a layer — the executable decision matrix (§4 table). */
export function heatmapSourceFor(layerId: string): "model" | "events" | null {
  if (layerId in MODEL_LAYERS) return "model";
  if ((EVENT_LAYERS as readonly string[]).includes(layerId)) return "events";
  return null;
}
