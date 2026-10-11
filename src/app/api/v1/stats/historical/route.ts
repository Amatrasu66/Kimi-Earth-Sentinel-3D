import type { NextRequest } from "next/server";
import { getCache } from "@/server/cache";
import { LIVE, STALE, UNAVAILABLE, makeStatus } from "@/server/provenance";
import type { DataStatus } from "@/server/provenance";
import { NO_STORE, fail, internalError, ok, publicCacheControl } from "@/server/route-helpers";
import {
  FirmsKeyMissingError,
  STATS_METRICS,
  STATS_PERIODS,
  STATS_TTL,
  StatsUnavailableError,
  getStatsHistory,
  statsHistoryKey,
} from "@/server/services/stats";
import type { StatsMetric, StatsPeriod } from "@/server/services/stats";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const metric = sp.get("metric") ?? "earthquakes";
    const period = sp.get("period") ?? "30d";
    if (!(STATS_METRICS as readonly string[]).includes(metric)) {
      return fail(`Invalid metric ${JSON.stringify(metric)}: must be one of ${STATS_METRICS.join(", ")}.`);
    }
    if (!(STATS_PERIODS as readonly string[]).includes(period)) {
      return fail(`Invalid period ${JSON.stringify(period)}: must be one of ${STATS_PERIODS.join(", ")}.`);
    }
    // NOTE (T2.7 contract change): the old `aggregation` parameter is gone.
    // Granularity is fixed by period (24h → hourly, 7d/30d → daily); an
    // `aggregation` query value, if sent by an old client, is ignored rather
    // than honored-or-rejected ambiguously. Documented in README + development.md.
    const key = statsHistoryKey(metric, period);
    const cache = getCache();
    const fresh = cache.get(key) as
      | [{ data_status: DataStatus }, string | null | undefined]
      | null;
    if (fresh !== null) {
      return ok(fresh[0] as Record<string, unknown>, {
        cacheHit: true,
        cacheControl: fresh[0].data_status.status === LIVE ? publicCacheControl(STATS_TTL) : NO_STORE,
      });
    }

    try {
      const { history, source, fetchedAt, truncated } = await getStatsHistory(
        metric as StatsMetric,
        period as StatsPeriod,
      );
      const payload = {
        ...history,
        ...(truncated
          ? { warnings: ["Upstream row cap reached — later rows ignored; counts are a lower bound."] }
          : {}),
        data_status: makeStatus(LIVE, source, null, fetchedAt),
      };
      cache.set(key, [payload, fetchedAt], STATS_TTL);
      return ok(payload, { cacheControl: publicCacheControl(STATS_TTL) });
    } catch (e) {
      if (e instanceof StatsUnavailableError || e instanceof FirmsKeyMissingError) {
        // Deterministic unavailability (no archive, keyless FIRMS, 30d
        // wildfires): honest UNAVAILABLE, never a seeded series.
        const message =
          e instanceof FirmsKeyMissingError
            ? "No NASA FIRMS API key configured — no reliable wildfire history."
            : e.message;
        return ok(
          {
            metric,
            period,
            granularity: null,
            start: null,
            end: null,
            values: [],
            data_status: makeStatus(UNAVAILABLE, metricSource(metric), message),
          },
          { cacheControl: NO_STORE },
        );
      }
      // Transport/shape failure: stale re-serve, else UNAVAILABLE.
      const expired = cache.getStale(key) as
        | [{ data_status: DataStatus }, string | null | undefined]
        | null;
      if (expired !== null && expired[0].data_status.status === LIVE) {
        const stale = {
          ...(expired[0] as Record<string, unknown>),
          data_status: {
            ...expired[0].data_status,
            status: STALE,
            message: `Provider refresh failed — showing cached data fetched at ${expired[0].data_status.fetched_at}.`,
          },
        };
        return ok(stale, { cacheHit: true, stale: true, cacheControl: NO_STORE });
      }
      return ok(
        {
          metric,
          period,
          granularity: null,
          start: null,
          end: null,
          values: [],
          data_status: makeStatus(UNAVAILABLE, metricSource(metric), `${labelFor(e)} — no cached series available.`),
        },
        { cacheControl: NO_STORE },
      );
    }
  } catch (e) {
    return internalError(e);
  }
}

function metricSource(metric: string): string {
  if (metric === "earthquakes") return "USGS";
  if (metric === "disasters") return "NASA EONET";
  if (metric === "wildfires") return "NASA FIRMS";
  return "none";
}

function labelFor(e: unknown): string {
  return String(e instanceof Error ? e.message : e);
}
