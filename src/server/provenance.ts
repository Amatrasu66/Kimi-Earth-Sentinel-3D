/**
 * Data-provenance helpers — port of backend/app/utils/provenance.py.
 * Every layer payload carries a `data_status` block so the frontend can
 * tell live measurements from simulated / stale / unavailable data.
 */

export type DataStatusKind = "live" | "simulated" | "stale" | "unavailable";

export const LIVE: DataStatusKind = "live";
export const SIMULATED: DataStatusKind = "simulated";
export const STALE: DataStatusKind = "stale";
export const UNAVAILABLE: DataStatusKind = "unavailable";

export interface DataStatus {
  status: DataStatusKind;
  source: string | null;
  fetched_at: string;
  message?: string | null;
}

export function utcnowIso(date = new Date()): string {
  // Matches Python strftime("%Y-%m-%dT%H:%M:%SZ")
  const iso = date.toISOString();
  return iso.replace(/\.\d{3}Z$/, "Z");
}

export function makeStatus(
  status: DataStatusKind,
  source: string | null,
  message?: string | null,
  fetchedAt?: string,
): DataStatus {
  return {
    status,
    source,
    fetched_at: fetchedAt ?? utcnowIso(),
    message: message ?? null,
  };
}

export function withStatus<T extends Record<string, unknown>>(
  payload: T,
  status: DataStatusKind,
  source: string,
  message?: string | null,
  fetchedAt?: string,
): T & { data_status: DataStatus } {
  return {
    ...payload,
    data_status: makeStatus(status, source, message ?? null, fetchedAt),
  };
}

export interface SuccessMeta {
  timestamp: string;
  cache_hit: boolean;
  cached_at: string | null;
  stale: boolean;
  source: string | null | undefined;
  data_status: DataStatusKind | null | undefined;
}

export function successResponse<T extends Record<string, unknown> | unknown[]>(
  data: T,
  opts: { cacheHit?: boolean; cachedAt?: string | null; stale?: boolean } = {},
): { success: true; data: T; meta: SuccessMeta } {
  const status =
    typeof data === "object" && data !== null && !Array.isArray(data)
      ? ((data as Record<string, unknown>).data_status as DataStatus | undefined)
      : undefined;
  const cachedAt = opts.cachedAt !== undefined ? opts.cachedAt : (status?.fetched_at ?? null);
  return {
    success: true,
    data,
    meta: {
      timestamp: utcnowIso(),
      cache_hit: opts.cacheHit ?? false,
      cached_at: cachedAt,
      stale: opts.stale ?? false,
      source: status?.source ?? null,
      data_status: status?.status ?? null,
    },
  };
}

export function errorBody(code: string, message: string) {
  return { success: false as const, error: { code, message } };
}

/** Per-layer cache TTLs (seconds) — mirrors LAYER_TTLS in provenance.py. */
export const LAYER_TTLS: Record<string, number> = {
  earthquakes: 300,
  disasters: 600,
  wildfires: 600,
  temperature: 3600,
  precipitation: 3600,
  clouds: 1800,
  wind: 1800,
  air_quality: 1800,
};

export const DEFAULT_TTL = 600;

export function ttlForLayer(layerId: string): number {
  return LAYER_TTLS[layerId] ?? DEFAULT_TTL;
}
