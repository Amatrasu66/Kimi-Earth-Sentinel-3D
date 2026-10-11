/**
 * Real statistics service (T2.7) — current overview + historical series
 * derived from live provider records. No seeded series, no interpolation,
 * no inference of one metric from another.
 *
 * Sources (contracts verified 2026-10-11):
 * - Earthquakes: USGS FDSNWS Event `query` — ISO8601 `starttime`/`endtime`
 *   (inclusive, UTC assumed), `minmagnitude`, `orderby=time`, hard `limit`
 *   cap 20000/query. HTTP 204 (nodata default) means a genuine zero window,
 *   not a failure. Counting unit: event records with a finite magnitude and
 *   valid coordinates (the same filter as the layer normalizer).
 * - Disasters: NASA EONET v3 `/events` — `status=open|closed|all`,
 *   `start`/`end` YYYY-MM-DD (inclusive), `days` (server-side recency),
 *   `limit`. Counting unit: unique events (by EONET id) bearing at least one
 *   geometry record; an event with several categories/geometries is counted
 *   exactly once (primary = first category). The overview counts open events
 *   active in the trailing 30 days (`days=30`) — the unbounded all-time open
 *   set (5000+ live) would make the headline a function of the request cap.
 *   Historical buckets use the latest geometry date ("observed activity in
 *   window"). Limitation: closed events outside the queried range never
 *   appear, so past buckets count activity, not all-time presence.
 *   Geometry key: v3 `geometry` (singular); legacy `geometries` accepted.
 * - Wildfires: NASA FIRMS area CSV `.../VIIRS_NOAA20_NRT/<key>/WORLD/<days>`
 *   (days 1–10). Counting unit: detection rows (thermal observations — one
 *   fire produces many detections) with valid coordinates and finite
 *   brightness. Keyless instances and the 30-day window have no reliable
 *   record and are reported UNAVAILABLE (never simulated — a random
 *   wildfire_count would invent detections).
 *
 * Windows are strict UTC millisecond arithmetic (no calendar math, so leap
 * years and DST cannot skew them). Bucket assignment is [start, end):
 * start-inclusive, end-exclusive, aligned to UTC hour/day floors. A zero
 * count with null magnitudes is a genuine zero — distinct from UNAVAILABLE.
 *
 * Upstream economy (T2.2 preserved): /stats issues 3 parallel single-request
 * fetches (one per source, each ≤ its configured provider timeout); each
 * historical query issues exactly 1. Result processing is capped
 * (USGS_STATS_LIMIT = the service's own 20000 hard cap; FIRMS rows capped at
 * FIRMS_STATS_MAX_ROWS). No new fetch framework, no shared state, no DB.
 */
import { serverConfig } from "../config";
import { fetchJsonWithTimeout, fetchTextWithTimeout, logWarn } from "../http";
import {
  LIVE,
  UNAVAILABLE,
  makeStatus,
  utcnowIso,
  withStatus,
} from "../provenance";
import type { DataStatus, DataStatusKind } from "../provenance";
import { isValidCoordinate } from "../validation";
import { parseCsvRows } from "../providers/nasa-firms";
import { eonetGeometries } from "../providers/nasa-eonet";

/** Historical windows required by the PRD (replaces the old 7d/30d/1y set). */
export const STATS_PERIODS = ["24h", "7d", "30d"] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

/** Metrics namespace (unchanged names). temperature/air_quality have no archive → UNAVAILABLE. */
export const STATS_METRICS = ["earthquakes", "disasters", "wildfires", "temperature", "air_quality"] as const;
export type StatsMetric = (typeof STATS_METRICS)[number];

const PERIOD_MS: Record<StatsPeriod, number> = {
  "24h": 24 * 3600 * 1000,
  "7d": 7 * 24 * 3600 * 1000,
  "30d": 30 * 24 * 3600 * 1000,
};

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** USGS service hard cap per query (verified in FDSNWS docs; >20000 → 400). */
export const USGS_STATS_LIMIT = 20000;
/** EONET list cap for stats/history pulls (single request, bounded). */
export const EONET_STATS_LIMIT = 2000;
/** Upper bound on FIRMS CSV rows processed per request (count-only aggregates). */
export const FIRMS_STATS_MAX_ROWS = 200000;
/** In-memory + shared-cache TTL for stats payloads (mirrors the short layer tier). */
export const STATS_TTL = 300;

/** L1 key for the overview payload (single trailing window). */
export function statsOverviewKey(): string {
  return "stats:overview";
}

/**
 * L1 key for one historical series. Embeds every parameter that determines
 * the response contents (metric + period); windows slide with request time
 * under a short TTL with honest fetched_at.
 */
export function statsHistoryKey(metric: string, period: string): string {
  return `stats:hist:metric=${metric}:period=${period}`;
}

export const USGS_SOURCE = "USGS";
export const EONET_SOURCE = "NASA EONET";
export const FIRMS_SOURCE = "NASA FIRMS";

/** Distinct error for keyless FIRMS access (mapped to UNAVAILABLE, never simulated). */
export class FirmsKeyMissingError extends Error {
  constructor() {
    super("No NASA FIRMS API key configured");
    this.name = "FirmsKeyMissingError";
  }
}

export interface StatsWindow {
  start: Date;
  end: Date;
}

/** Trailing window [now-ms, now) — the "prior N hours/days" reading for /stats. */
export function trailingWindow(period: StatsPeriod, now: Date = new Date()): StatsWindow {
  const end = now.getTime();
  return { start: new Date(end - PERIOD_MS[period]), end: new Date(end) };
}

export type StatsGranularity = "hourly" | "daily";

/**
 * Bucket-aligned window for history: end floored to the UTC hour (24h) or
 * UTC day (7d/30d), start exactly one period earlier, buckets [b, b+size).
 */
export function bucketedWindow(
  period: StatsPeriod,
  now: Date = new Date(),
): StatsWindow & { granularity: StatsGranularity; bucketMs: number } {
  const bucketMs = period === "24h" ? HOUR_MS : DAY_MS;
  const end = Math.floor(now.getTime() / bucketMs) * bucketMs;
  return {
    start: new Date(end - PERIOD_MS[period]),
    end: new Date(end),
    granularity: period === "24h" ? "hourly" : "daily",
    bucketMs,
  };
}

/** Bucket index for t in [startMs, endMs); -1 when outside (end-exclusive). */
export function bucketIndex(timeMs: number, startMs: number, bucketMs: number, count: number): number {
  if (!(timeMs >= startMs)) return -1;
  const idx = Math.floor((timeMs - startMs) / bucketMs);
  return idx >= 0 && idx < count ? idx : -1;
}

const isoNoMillis = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");

// ---------------------------------------------------------------------------
// Earthquake records (USGS)
// ---------------------------------------------------------------------------

export interface QuakeRecord {
  mag: number;
  time: number;
}

export async function fetchQuakeFeatures(
  start: Date,
  end: Date,
  opts?: { signal?: AbortSignal },
): Promise<unknown[]> {
  const res = await fetchJsonWithTimeout(`${serverConfig.usgsApiUrl}/fdsnws/event/1/query`, {
    params: {
      format: "geojson",
      starttime: isoNoMillis(start),
      endtime: isoNoMillis(end),
      minmagnitude: 2.5,
      orderby: "time",
      limit: USGS_STATS_LIMIT,
    },
    timeoutMs: serverConfig.usgsTimeoutMs,
    signal: opts?.signal,
  });
  // 204 / empty body = genuine zero window (nodata default), not a failure.
  if (res.status === 204 || res.json === null) return [];
  if (res.status >= 400) throw new Error(`USGS responded with status ${res.status}`);
  if (
    typeof res.json !== "object" ||
    res.json === null ||
    !Array.isArray((res.json as { features?: unknown }).features)
  ) {
    throw new Error("Unexpected USGS response shape");
  }
  return (res.json as { features: unknown[] }).features;
}

/**
 * Valid USGS event records: finite magnitude + valid coordinates + finite
 * origin time. Rows failing any check are skipped (documented); nothing is
 * defaulted or invented. Same filter as the layer normalizer.
 */
export function extractQuakeRecords(features: unknown[]): QuakeRecord[] {
  const out: QuakeRecord[] = [];
  for (const feature of features.slice(0, USGS_STATS_LIMIT)) {
    if (typeof feature !== "object" || feature === null) continue;
    const f = feature as {
      properties?: Record<string, unknown>;
      geometry?: { coordinates?: unknown } | null;
    };
    const mag = f.properties?.mag;
    const time = f.properties?.time;
    if (typeof mag !== "number" || !Number.isFinite(mag)) continue;
    if (typeof time !== "number" || !Number.isFinite(time)) continue;
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const [lon, lat] = coords as [unknown, unknown];
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    if (!isValidCoordinate(lat, lon)) continue;
    out.push({ mag, time });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Disaster records (EONET)
// ---------------------------------------------------------------------------

export interface EonetRecord {
  id: string;
  /** Latest geometry date (observed activity), epoch ms. */
  time: number;
  /** First category title (primary bucket key — counted once). */
  category: string;
}

export async function fetchEonetEvents(
  status: "open" | "all",
  startDate: string | null,
  endDate: string | null,
  opts?: { signal?: AbortSignal; days?: number },
): Promise<unknown[]> {
  const params: Record<string, string | number> = { status, limit: EONET_STATS_LIMIT };
  if (startDate) params.start = startDate;
  if (endDate) params.end = endDate;
  // Server-side recency bound (EONET `days` = prior days including today).
  if (opts?.days) params.days = opts.days;
  const res = await fetchJsonWithTimeout(`${serverConfig.nasaEonetUrl}/events`, {
    params,
    timeoutMs: serverConfig.nasaEonetTimeoutMs,
    signal: opts?.signal,
  });
  if (res.status >= 400) throw new Error(`EONET responded with status ${res.status}`);
  if (
    typeof res.json !== "object" ||
    res.json === null ||
    !Array.isArray((res.json as { events?: unknown }).events)
  ) {
    throw new Error("Unexpected EONET response shape");
  }
  return (res.json as { events: unknown[] }).events;
}

/**
 * Unique geometry-bearing open/all events. Deduped by EONET id (first wins);
 * events without an id, without geometries, or without a parseable latest
 * geometry date are skipped. Multi-category events keep their first category
 * only — never double-counted.
 */
export function extractEonetRecords(events: unknown[]): EonetRecord[] {
  const seen = new Set<string>();
  const out: EonetRecord[] = [];
  for (const event of events) {
    if (typeof event !== "object" || event === null) continue;
    const e = event as {
      id?: unknown;
      categories?: unknown;
      geometries?: unknown;
    };
    if (typeof e.id !== "string" && typeof e.id !== "number") continue;
    const id = String(e.id);
    if (seen.has(id)) continue;
    seen.add(id);
    // Geometry key via the shared helper (v3 `geometry`, legacy `geometries`).
    const geometries = eonetGeometries(e as { geometry?: unknown; geometries?: unknown });
    if (geometries.length === 0) continue;
    const last = geometries[geometries.length - 1] as { date?: unknown } | null;
    const dateRaw = typeof last === "object" && last !== null ? last.date : undefined;
    if (typeof dateRaw !== "string") continue;
    const time = Date.parse(dateRaw);
    if (Number.isNaN(time)) continue;
    const categories = Array.isArray(e.categories) ? e.categories : [];
    const first = categories[0] as { title?: unknown } | undefined;
    const category =
      typeof first === "object" && first !== null && typeof first.title === "string" && first.title
        ? first.title
        : "Unknown";
    out.push({ id, time, category });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wildfire records (FIRMS)
// ---------------------------------------------------------------------------

export interface FireRecord {
  time: number;
  bright: number;
}

export async function fetchFirmsCsv(dayRange: 1 | 7, opts?: { signal?: AbortSignal }): Promise<string> {
  const apiKey = serverConfig.nasaFirmsApiKey;
  if (!apiKey) throw new FirmsKeyMissingError();
  const res = await fetchTextWithTimeout(
    `${serverConfig.nasaFirmsUrl}/area/csv/VIIRS_NOAA20_NRT/${apiKey}/WORLD/${dayRange}`,
    { timeoutMs: serverConfig.nasaFirmsTimeoutMs, signal: opts?.signal },
  );
  if (res.status >= 400) throw new Error(`FIRMS responded with status ${res.status}`);
  return res.text;
}

function parseAcqTime(acqDate: string, acqTime: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(acqDate);
  const t = /^(\d{1,2})(\d{2})$/.exec(acqTime);
  if (!d || !t) return null;
  return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
}

/**
 * FIRMS detection rows with valid coordinates, finite brightness, and a
 * parseable UTC acquisition timestamp. Row processing is capped
 * (FIRMS_STATS_MAX_ROWS); rows beyond the cap are ignored and reported via
 * the returned `truncated` flag — counts then carry that caveat instead of
 * silently undercounting.
 */
export function extractFireRecords(
  csvText: string,
  maxRows: number = FIRMS_STATS_MAX_ROWS,
): { records: FireRecord[]; truncated: boolean } {
  const rows = parseCsvRows(csvText.trim());
  if (rows.length < 2) return { records: [], truncated: false };
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
  const dateIdx = col("acq_date", -1);
  const timeIdx = col("acq_time", -1);
  const records: FireRecord[] = [];
  const dataRows = rows.slice(1);
  const truncated = dataRows.length > maxRows;
  for (const parts of dataRows.slice(0, maxRows)) {
    if (parts.length < 3) continue;
    const lat = Number(parts[latIdx]);
    const lon = Number(parts[lonIdx]);
    // An empty brightness cell is a missing measurement, not zero
    // (`Number("")` is 0 — must not become an invented reading).
    const brightRaw = parts[brightIdx];
    if (brightRaw === undefined || brightRaw === "") continue;
    const bright = Number(brightRaw);
    if (!isValidCoordinate(lat, lon)) continue;
    if (!Number.isFinite(bright)) continue;
    const time =
      dateIdx >= 0 && timeIdx >= 0 ? parseAcqTime(parts[dateIdx] ?? "", parts[timeIdx] ?? "") : null;
    if (time === null) continue;
    records.push({ time, bright });
  }
  return { records, truncated };
}

// ---------------------------------------------------------------------------
// Overview (/stats)
// ---------------------------------------------------------------------------

export interface StatsSourceStatus {
  earthquakes: DataStatus;
  disasters: DataStatus;
  wildfires: DataStatus;
}

export interface StatsOverview extends Record<string, unknown> {
  window: { start: string; end: string };
  global: {
    earthquakes_24h: number | null;
    max_magnitude_24h: number | null;
    max_magnitude_time: string | null;
    active_events: number | null;
    wildfire_count: number | null;
    max_brightness: number | null;
  };
  sources: StatsSourceStatus;
  timestamp: string;
}

interface SourceAttempt<T> {
  ok: boolean;
  value: T | null;
  source: string;
  fetchedAt: string;
  message: string | null;
}

async function attempt<T>(source: string, fn: () => Promise<T>): Promise<SourceAttempt<T>> {
  const fetchedAt = utcnowIso();
  try {
    return { ok: true, value: await fn(), source, fetchedAt, message: null };
  } catch (e) {
    logWarn(`${source} stats source failed`, String(e));
    return { ok: false, value: null, source, fetchedAt, message: String(e) };
  }
}

function statusFor(attemptResult: SourceAttempt<unknown>, unavailableMessage: string | null): DataStatus {
  if (attemptResult.ok) return makeStatus(LIVE, attemptResult.source, null, attemptResult.fetchedAt);
  return makeStatus(UNAVAILABLE, attemptResult.source, unavailableMessage ?? attemptResult.message, attemptResult.fetchedAt);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Current overview for the trailing 24h UTC window. Aggregate status rule
 * (documented — mirrors the T2.2 partial-coverage precedent): LIVE when
 * every source is live; LIVE + an explicit message naming the unavailable
 * sources when at least one source is live (failed sources stay
 * per-source-UNAVAILABLE with null metrics — never implicitly live);
 * UNAVAILABLE when nothing could be served.
 */
export async function getStatsOverview(now: Date = new Date()): Promise<
  StatsOverview & { data_status: DataStatus }
> {
  const window = trailingWindow("24h", now);
  const [quakes, disasters, fires] = await Promise.all([
    attempt(USGS_SOURCE, async () => {
      const features = await fetchQuakeFeatures(window.start, window.end);
      const records = extractQuakeRecords(features).filter(
        (r) => r.time >= window.start.getTime() && r.time < window.end.getTime(),
      );
      let max: QuakeRecord | null = null;
      for (const r of records) {
        if (!max || r.mag > max.mag) max = r;
      }
      return {
        count: records.length,
        maxMagnitude: max ? round1(max.mag) : null,
        maxTime: max ? utcnowIso(new Date(max.time)) : null,
      };
    }),
    attempt(EONET_SOURCE, async () => {
      // `days=30`: open events with observed activity in the trailing 30
      // days — a bounded, meaningful "currently active" set. The unbounded
      // all-time open set (5000+ records live) would make the headline count
      // a function of the request cap instead of the planet.
      const events = await fetchEonetEvents("open", null, null, { days: 30 });
      return {
        count: extractEonetRecords(events).length,
        truncated: events.length >= EONET_STATS_LIMIT,
      };
    }),
    attempt(FIRMS_SOURCE, async () => {
      const csv = await fetchFirmsCsv(1);
      const { records, truncated } = extractFireRecords(csv);
      const inWindow = records.filter(
        (r) => r.time >= window.start.getTime() && r.time < window.end.getTime(),
      );
      let maxBright: number | null = null;
      for (const r of inWindow) {
        if (maxBright === null || r.bright > maxBright) maxBright = r.bright;
      }
      return {
        count: inWindow.length,
        maxBrightness: maxBright === null ? null : round1(maxBright),
        truncated,
      };
    }),
  ]);

  const quakeStatus = statusFor(quakes, null);
  const disasterValue = disasters.ok && disasters.value ? disasters.value : null;
  const disasterStatus = statusFor(disasters, null);
  if (disasterValue?.truncated) {
    disasterStatus.message =
      "Open-event list hit the request cap — active_events is a lower bound.";
  }
  const fireKeyless =
    typeof fires.message === "string" && fires.message.includes("No NASA FIRMS API key");
  const fireStatus = statusFor(
    fires,
    fireKeyless
      ? "No NASA FIRMS API key configured — wildfire metrics unavailable."
      : null,
  );

  const missing = [
    quakes.ok ? null : "earthquakes",
    disasters.ok ? null : "disasters",
    fires.ok ? null : "wildfires",
  ].filter((x): x is string => x !== null);
  let aggregate: DataStatusKind;
  let message: string | null = null;
  if (missing.length === 0) {
    aggregate = LIVE;
  } else if (missing.length < 3) {
    aggregate = LIVE;
    message = `Live data for available sources; unavailable: ${missing.join(", ")}. See per-source status.`;
  } else {
    aggregate = UNAVAILABLE;
    message = "All statistics sources unavailable — no trustworthy metrics.";
  }

  const fireValue = fires.ok && fires.value ? fires.value : null;
  const payload: StatsOverview = {
    window: { start: window.start.toISOString(), end: window.end.toISOString() },
    global: {
      earthquakes_24h: quakes.ok && quakes.value ? quakes.value.count : null,
      max_magnitude_24h: quakes.ok && quakes.value ? quakes.value.maxMagnitude : null,
      max_magnitude_time: quakes.ok && quakes.value ? quakes.value.maxTime : null,
      active_events: disasterValue ? disasterValue.count : null,
      wildfire_count: fireValue ? fireValue.count : null,
      max_brightness: fireValue ? fireValue.maxBrightness : null,
    },
    sources: {
      earthquakes: quakeStatus,
      disasters: disasterStatus,
      wildfires: fireStatus,
    },
    timestamp: utcnowIso(now),
  };
  return withStatus(payload, aggregate, "stats", message);
}

// ---------------------------------------------------------------------------
// History (/stats/historical)
// ---------------------------------------------------------------------------

export interface HistoryBucket {
  start: string;
  end: string;
  count: number;
  max_magnitude: number | null;
  avg_magnitude: number | null;
  max_brightness: number | null;
  by_category: Record<string, number> | null;
}

export interface StatsHistory extends Record<string, unknown> {
  metric: string;
  period: string;
  granularity: StatsGranularity;
  start: string;
  end: string;
  values: HistoryBucket[];
}

function emptyBucket(startMs: number, endMs: number): HistoryBucket {
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    count: 0,
    max_magnitude: null,
    avg_magnitude: null,
    max_brightness: null,
    by_category: null,
  };
}

function avgOrNull(sum: number, n: number): number | null {
  return n === 0 ? null : round1(sum / n);
}

export function bucketQuakes(records: QuakeRecord[], window: StatsWindow, bucketMs: number): HistoryBucket[] {
  const n = Math.round((window.end.getTime() - window.start.getTime()) / bucketMs);
  const buckets = Array.from({ length: n }, (_, i) =>
    emptyBucket(window.start.getTime() + i * bucketMs, window.start.getTime() + (i + 1) * bucketMs),
  );
  const sums = new Array<number>(n).fill(0);
  for (const r of records) {
    const idx = bucketIndex(r.time, window.start.getTime(), bucketMs, n);
    if (idx < 0) continue;
    const b = buckets[idx];
    b.count += 1;
    sums[idx] += r.mag;
    b.max_magnitude = b.max_magnitude === null ? round1(r.mag) : Math.max(b.max_magnitude, round1(r.mag));
  }
  buckets.forEach((b, i) => {
    b.avg_magnitude = avgOrNull(sums[i], b.count);
  });
  return buckets;
}

export function bucketEonet(records: EonetRecord[], window: StatsWindow, bucketMs: number): HistoryBucket[] {
  const n = Math.round((window.end.getTime() - window.start.getTime()) / bucketMs);
  const buckets = Array.from({ length: n }, (_, i) =>
    emptyBucket(window.start.getTime() + i * bucketMs, window.start.getTime() + (i + 1) * bucketMs),
  );
  for (const r of records) {
    const idx = bucketIndex(r.time, window.start.getTime(), bucketMs, n);
    if (idx < 0) continue;
    const b = buckets[idx];
    b.count += 1;
    b.by_category = { ...(b.by_category ?? {}), [r.category]: ((b.by_category ?? {})[r.category] ?? 0) + 1 };
  }
  return buckets;
}

export function bucketFires(records: FireRecord[], window: StatsWindow, bucketMs: number): HistoryBucket[] {
  const n = Math.round((window.end.getTime() - window.start.getTime()) / bucketMs);
  const buckets = Array.from({ length: n }, (_, i) =>
    emptyBucket(window.start.getTime() + i * bucketMs, window.start.getTime() + (i + 1) * bucketMs),
  );
  for (const r of records) {
    const idx = bucketIndex(r.time, window.start.getTime(), bucketMs, n);
    if (idx < 0) continue;
    const b = buckets[idx];
    b.count += 1;
    b.max_brightness = b.max_brightness === null ? round1(r.bright) : Math.max(b.max_brightness, round1(r.bright));
  }
  return buckets;
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Real historical series for one metric + period. temperature/air_quality
 * have no archive (never inferred from current values) → UNAVAILABLE.
 * Wildfire 30d exceeds the FIRMS day-range support → UNAVAILABLE.
 * Transport/shape failures throw (route applies stale → unavailable).
 */
export async function getStatsHistory(
  metric: StatsMetric,
  period: StatsPeriod,
  now: Date = new Date(),
  opts?: { signal?: AbortSignal },
): Promise<{ history: StatsHistory; source: string; fetchedAt: string; truncated: boolean }> {
  const window = bucketedWindow(period, now);
  const base = {
    metric,
    period,
    granularity: window.granularity,
    start: window.start.toISOString(),
    end: window.end.toISOString(),
  };
  const fetchedAt = utcnowIso();
  if (metric === "temperature" || metric === "air_quality") {
    throw new StatsUnavailableError(
      `No historical archive for metric ${JSON.stringify(metric)} — current values are never backfilled as history.`,
    );
  }
  if (metric === "earthquakes") {
    const features = await fetchQuakeFeatures(window.start, window.end, opts);
    const records = extractQuakeRecords(features);
    return {
      history: { ...base, values: bucketQuakes(records, window, window.bucketMs) },
      source: USGS_SOURCE,
      fetchedAt,
      truncated: false,
    };
  }
  if (metric === "disasters") {
    const events = await fetchEonetEvents("all", ymd(window.start), ymd(window.end), opts);
    const records = extractEonetRecords(events);
    return {
      history: { ...base, values: bucketEonet(records, window, window.bucketMs) },
      source: EONET_SOURCE,
      fetchedAt,
      truncated: events.length >= EONET_STATS_LIMIT,
    };
  }
  // Wildfires: FIRMS area feeds support day ranges 1–10 only.
  if (period === "30d") {
    throw new StatsUnavailableError(
      "FIRMS area feeds support day ranges up to 10 days — no reliable 30-day wildfire history.",
    );
  }
  const csv = await fetchFirmsCsv(period === "24h" ? 1 : 7, opts);
  const { records, truncated } = extractFireRecords(csv);
  return {
    history: { ...base, values: bucketFires(records, window, window.bucketMs) },
    source: FIRMS_SOURCE,
    fetchedAt,
    truncated,
  };
}

/** Deterministic unavailability (no fetch attempted) — answered UNAVAILABLE, never simulated. */
export class StatsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatsUnavailableError";
  }
}
