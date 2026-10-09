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
/**
 * T2.2 bounded concurrency: at most this many forecast batches in flight.
 * No provider quota is claimed — this is a small multiple of the previous
 * serial dispatch: worst case drops from 4 sequential batch timeouts to 2
 * waves, while never fanning out unboundedly. At most 4 batches exist
 * (MAX_FETCH_POINTS / BATCH_SIZE), so the pool stays tiny by construction.
 */
export const BATCH_CONCURRENCY = 2;

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
  signal?: AbortSignal,
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
    signal,
  });
  if (res.status >= 400) throw new Error(`Open-Meteo responded with status ${res.status}`);
  if (res.json !== null && typeof res.json === "object" && !Array.isArray(res.json)) {
    return [res.json as Record<string, unknown>];
  }
  if (!Array.isArray(res.json)) throw new Error("Unexpected Open-Meteo response shape");
  return res.json as Record<string, unknown>[];
}

type BatchOutcome =
  | { results: Record<string, unknown>[] }
  | { error: unknown };

/**
 * T2.2 small worker pool: runs at most `limit` batch fetches concurrently,
 * preserves chunk order in the output, captures per-batch failures as
 * values (one bad batch never discards the others), and stops scheduling
 * new batches once `signal` aborts. Single consumer (weather batches), so
 * it stays local to this module.
 */
async function runBatches<T>(
  batchChunks: T[][],
  limit: number,
  fn: (chunk: T[], index: number, signal?: AbortSignal) => Promise<BatchOutcome>,
  signal?: AbortSignal,
): Promise<BatchOutcome[]> {
  const out: BatchOutcome[] = new Array(batchChunks.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, batchChunks.length));
  const run = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) return;
      const index = cursor;
      cursor += 1;
      if (index >= batchChunks.length) return;
      try {
        out[index] = await fn(batchChunks[index], index, signal);
      } catch (error) {
        out[index] = { error };
      }
    }
  };
  await Promise.all(Array.from({ length: workerCount }, () => run()));
  // Workers stop scheduling once the signal aborts, which can leave holes
  // for never-started batches (Array.map would skip holes, so fill via
  // Array.from) — report those as cancellations, never as silent gaps, so
  // every chunk is accounted for downstream.
  return Array.from({ length: batchChunks.length }, (_, index) => {
    const outcome = out[index];
    return outcome === undefined
      ? { error: new Error(`Batch ${index} cancelled before scheduling`) }
      : outcome;
  });
}

export async function getWeatherData(
  metric = "temperature",
  bbox?: string | null,
  limit = 500,
  minSeverity?: string | null,
  layerId?: string | null,
  opts?: { signal?: AbortSignal },
) {
  const layer = layerId ?? metric;
  const field = METRIC_FIELDS[metric] ?? "temperature_2m";
  const baseUrl = serverConfig.openMeteoUrl;
  const timeoutMs = serverConfig.openMeteoTimeoutMs;

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
  const wanted = gridPoints.slice(0, Math.min(limit, MAX_FETCH_POINTS));
  const batchChunks = chunks(wanted, BATCH_SIZE);
  // T2.2 bounded concurrency: at most BATCH_CONCURRENCY batches in flight,
  // results re-associated by chunk index so coordinate ordering is preserved.
  const outcomes = await runBatches(
    batchChunks,
    BATCH_CONCURRENCY,
    async (chunk, _index, signal) => {
      try {
        return { results: await fetchBatch(baseUrl, chunk, field, timeoutMs, signal) };
      } catch (error) {
        return { error };
      }
    },
    opts?.signal,
  );
  for (let c = 0; c < batchChunks.length; c += 1) {
    const chunk = batchChunks[c];
    const outcome = outcomes[c];
    if (!("results" in outcome)) {
      failures += chunk.length;
      logWarn("Open-Meteo batch fetch failed", String((outcome as { error: unknown }).error));
      continue;
    }
    const { results } = outcome;
    for (let idx = 0; idx < chunk.length; idx += 1) {
      const pt = chunk[idx];
      try {
        const result = results[idx] ?? {};
        const current = ((result as Record<string, unknown>).current ?? {}) as Record<string, unknown>;
        // T2.2: a successful batch that omits a point's value is a coverage
        // gap, not a zero — skip it and count it instead of inventing data.
        const raw = current[field];
        if (typeof raw !== "number") {
          failures += 1;
          logWarn("Open-Meteo point has no value, skipping", `${metric} @${pt.lat},${pt.lon}`);
          continue;
        }
        const val = raw;
        const severity = severityForMetric(metric, val);
        if (!meetsMinSeverity(severity, minSeverity)) continue;
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
    }
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
  // T2.2 partial coverage is reported through the existing message field:
  // live points stay live, but the result is never presented as complete.
  const attempted = wanted.length;
  return withStatus(
    payload,
    LIVE,
    SOURCE,
    failures
      ? `Partial live coverage: ${failures} of ${attempted} grid points could not be fetched; showing live data for the remainder.`
      : undefined,
    utcnowIso(),
  );
}
