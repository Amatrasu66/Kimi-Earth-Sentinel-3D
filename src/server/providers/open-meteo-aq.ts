/**
 * Open-Meteo Air Quality provider (T2.5) — global model-based AQI.
 *
 * Contract verified against the official docs
 * (https://open-meteo.com/en/docs/air-quality-api):
 * - host `https://air-quality-api.open-meteo.com/v1`, path `/air-quality`
 * - comma-separated latitude/longitude for multi-location; the JSON body
 *   then changes from a single object to a LIST of per-location structures
 * - `current=` returns current conditions (15-min model data); we request
 *   only what the layer needs: us_aqi, pm2_5, pm10, ozone, nitrogen_dioxide
 * - no key for standard non-commercial use; attribution to CAMS + Open-Meteo
 * - model grid ~45 km global (~11 km Europe): nearby coordinates may share
 *   a cell. Our sampling grid (30°/15° spacing) never collides, so no
 *   dedup pass is needed — documented, not assumed silently.
 *
 * Sampling reuses the weather grid caps (≤200 points, 50-point batches)
 * and the shared bounded pool (concurrency 2): no second framework.
 */
import { serverConfig } from "../config";
import { fetchJsonWithTimeout, logWarn } from "../http";
import { LIVE, SIMULATED, utcnowIso, withStatus } from "../provenance";
import { BATCH_CONCURRENCY } from "./open-meteo";
import { runBatches } from "../batch-pool";
import {
  generateMockAqi,
  generateWeatherGrid,
  meetsMinSeverity,
  severityForAqi,
} from "./fallback";

export const AQ_SOURCE = "Open-Meteo Air Quality";
/** Same caps as the weather grid: ≤200 points in 50-point batches. */
export const AQ_MAX_POINTS = 200;
const AQ_BATCH_SIZE = 50;

const AQ_VARIABLES = ["us_aqi", "pm2_5", "pm10", "ozone", "nitrogen_dioxide"] as const;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchAqBatch(
  baseUrl: string,
  points: { lat: number; lon: number }[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Record<string, unknown>[]> {
  const latitudes = points.map((p) => p.lat.toFixed(4)).join(",");
  const longitudes = points.map((p) => p.lon.toFixed(4)).join(",");
  const res = await fetchJsonWithTimeout(`${baseUrl}/air-quality`, {
    params: {
      latitude: latitudes,
      longitude: longitudes,
      current: [...AQ_VARIABLES].join(","),
    },
    timeoutMs,
    signal,
  });
  if (res.status >= 400) throw new Error(`Open-Meteo Air Quality responded with status ${res.status}`);
  // Multi-location responses are a list; single-location is one object.
  if (Array.isArray(res.json)) return res.json as Record<string, unknown>[];
  if (res.json !== null && typeof res.json === "object") {
    return [res.json as Record<string, unknown>];
  }
  throw new Error("Unexpected Open-Meteo Air Quality response shape");
}

export async function getOpenMeteoAirQuality(
  bbox?: string | null,
  limit = 500,
  minSeverity?: string | null,
  opts?: { signal?: AbortSignal },
) {
  const baseUrl = serverConfig.openMeteoAqUrl;
  const timeoutMs = serverConfig.openMeteoTimeoutMs;

  let gridPoints: { lat: number; lon: number }[];
  try {
    gridPoints = generateWeatherGrid(bbox);
  } catch {
    return withStatus(
      generateMockAqi(bbox, limit, minSeverity),
      SIMULATED,
      AQ_SOURCE,
      "Invalid bounding box — showing simulated fallback data.",
    );
  }

  const wanted = gridPoints.slice(0, Math.min(limit, AQ_MAX_POINTS));
  const batchChunks = chunks(wanted, AQ_BATCH_SIZE);
  const outcomes = await runBatches(
    batchChunks,
    BATCH_CONCURRENCY,
    async (chunk, _index, signal) => {
      try {
        return { results: await fetchAqBatch(baseUrl, chunk, timeoutMs, signal) };
      } catch (error) {
        return { error };
      }
    },
    opts?.signal,
  );

  const points: Record<string, unknown>[] = [];
  let failures = 0;
  for (let c = 0; c < batchChunks.length; c += 1) {
    const chunk = batchChunks[c];
    const outcome = outcomes[c];
    if (!("results" in outcome)) {
      failures += chunk.length;
      logWarn("Open-Meteo Air Quality batch fetch failed", String((outcome as { error: unknown }).error));
      continue;
    }
    const { results } = outcome;
    for (let idx = 0; idx < chunk.length; idx += 1) {
      const pt = chunk[idx];
      // Pair by request order (the documented multi-location order) and
      // keep the requested grid coordinates so markers stay stable even
      // when the model echoes a nearby grid-cell center.
      const current = ((results[idx] ?? {}) as Record<string, unknown>).current as
        | Record<string, unknown>
        | undefined;
      const aqi = numOrNull(current?.us_aqi);
      if (aqi === null) {
        failures += 1;
        logWarn("Open-Meteo Air Quality point has no AQI, skipping", `${pt.lat},${pt.lon}`);
        continue;
      }
      const severity = severityForAqi(aqi);
      if (!meetsMinSeverity(severity, minSeverity)) continue;
      points.push({
        id: `aqi-${pt.lat}-${pt.lon}`,
        lat: pt.lat,
        lon: pt.lon,
        value: Math.round(aqi * 10) / 10,
        severity,
        timestamp: (typeof current?.time === "string" ? current.time : null) ?? utcnowIso(),
        location: null,
        parameter: "AQI",
        pollutants: {
          pm2_5: numOrNull(current?.pm2_5),
          pm10: numOrNull(current?.pm10),
          ozone: numOrNull(current?.ozone),
          nitrogen_dioxide: numOrNull(current?.nitrogen_dioxide),
        },
      });
    }
  }

  if (points.length === 0) {
    logWarn("Open-Meteo Air Quality unreachable, using fallback");
    return withStatus(
      generateMockAqi(bbox, limit, minSeverity),
      SIMULATED,
      AQ_SOURCE,
      "Open-Meteo Air Quality unavailable — showing simulated fallback data.",
    );
  }

  const payload: Record<string, unknown> = {
    layer_id: "air_quality",
    count: points.length,
    points,
    unit: "AQI",
  };
  const warnings: string[] = [];
  if (failures) warnings.push(`${failures} grid points could not be fetched.`);
  if (gridPoints.length > AQ_MAX_POINTS || limit > AQ_MAX_POINTS) {
    warnings.push(`Results bounded to ${AQ_MAX_POINTS} grid points per request.`);
  }
  if (warnings.length) payload.warnings = warnings;
  return withStatus(
    payload,
    LIVE,
    AQ_SOURCE,
    failures
      ? `Partial live coverage: ${failures} of ${wanted.length} grid points could not be fetched; showing model output for the remainder. Model estimates, not station observations.`
      : "Global model output (Open-Meteo Air Quality, CAMS) — estimates, not monitoring-station observations.",
    utcnowIso(),
  );
}
