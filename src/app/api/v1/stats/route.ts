import { getCache } from "@/server/cache";
import { LIVE, STALE } from "@/server/provenance";
import type { DataStatus } from "@/server/provenance";
import { NO_STORE, internalError, ok, publicCacheControl } from "@/server/route-helpers";
import { STATS_TTL, getStatsOverview, statsOverviewKey } from "@/server/services/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cache = getCache();
    const key = statsOverviewKey();
    const fresh = cache.get(key) as
      | [{ data_status: DataStatus }, string | null | undefined]
      | null;
    if (fresh !== null) {
      return ok(fresh[0] as Record<string, unknown>, {
        cacheHit: true,
        cacheControl: fresh[0].data_status.status === LIVE ? publicCacheControl(STATS_TTL) : NO_STORE,
      });
    }
    const payload = await getStatsOverview();
    const status = payload.data_status.status;
    if (status === LIVE) {
      cache.set(key, [payload, payload.data_status.fetched_at], STATS_TTL);
      return ok(payload, { cacheControl: publicCacheControl(STATS_TTL) });
    }
    if (status === STALE) {
      // Defensive: the service never emits STALE itself today; if that ever
      // changes, stale stays no-store per the T2.1 policy.
      return ok(payload, { cacheHit: true, stale: true, cacheControl: NO_STORE });
    }
    // Complete source failure with nothing cached: UNAVAILABLE, no-store.
    // The payload already carries per-source statuses + null metrics.
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
    return ok(payload, { cacheControl: NO_STORE });
  } catch (e) {
    return internalError(e);
  }
}

