import type { NextRequest } from "next/server";
import { matchEventIndex, searchMockData } from "@/server/providers/fallback";
import {
  GEOCODING_ATTRIBUTION,
  GEOCODING_MAX_COUNT,
  GEOCODING_SOURCE,
  SEARCH_TTL,
  logGeocodingFailure,
  mergeSearchResults,
  searchGeocodingLocations,
} from "@/server/providers/geocoding";
import { getCache } from "@/server/cache";
import {
  LIVE,
  SIMULATED,
  STALE,
  UNAVAILABLE,
  withStatus,
} from "@/server/provenance";
import {
  NO_STORE,
  fail,
  internalError,
  ok,
  publicCacheControl,
} from "@/server/route-helpers";
import { parseLimit, parseSearchQuery } from "@/server/validation";
import type { SearchResult } from "@/types";

export const dynamic = "force-dynamic";

const SEARCH_TYPES = ["all", "location", "event"] as const;

function searchCacheKey(searchType: string, limit: number, query: string): string {
  return `search:v1:type=${searchType}:limit=${limit}:q=${query.toLowerCase()}`;
}

interface SearchPayload extends Record<string, unknown> {
  query: string;
  results: SearchResult[];
  data_status: { status: string; fetched_at: string; message?: string | null };
}

type CachedSearch = [SearchPayload, string | null | undefined] | null;

/** Rewrite an expired LIVE entry as STALE, preserving the original fetched_at. */
function asStale(data: SearchPayload): SearchPayload {
  return {
    ...data,
    data_status: {
      ...data.data_status,
      status: STALE,
      message: `Provider refresh failed — showing cached data fetched at ${data.data_status.fetched_at}.`,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const { value: query, error: queryErr } = parseSearchQuery(sp.get("q"));
    if (queryErr || query === null) return fail(queryErr ?? "Invalid query.");
    const searchType = sp.get("type") ?? "all";
    const { value: limit, error: limitErr } = parseLimit(sp.get("limit") ?? "20", 20, 100);
    if (limitErr || limit === null) return fail(limitErr ?? "Invalid limit.");
    if (!(SEARCH_TYPES as readonly string[]).includes(searchType)) {
      return fail(`Invalid type ${JSON.stringify(searchType)}: must be one of ${SEARCH_TYPES.join(", ")}.`);
    }
    // Upstream returns no results below 2 characters (documented provider
    // rule) — short-circuit before any network or cache work, as before.
    if (!query || query.length < 2) {
      return ok({ query, results: [] }, { cacheControl: NO_STORE });
    }
    // Event-only search stays fully local: bundled index, labelled
    // SIMULATED, no upstream call — behavior unchanged from before T2.6.
    if (searchType === "event") {
      const results = searchMockData(query, "event", limit);
      return ok(
        withStatus(
          { query, results },
          SIMULATED,
          "fallback",
          "Event-index search over bundled data — not a live lookup.",
        ),
        { cacheControl: NO_STORE },
      );
    }

    const cache = getCache();
    const key = searchCacheKey(searchType, limit, query);
    const fresh = cache.get(key) as CachedSearch;
    if (fresh !== null) {
      return ok(fresh[0], {
        cacheHit: true,
        cacheControl:
          fresh[0].data_status.status === LIVE ? publicCacheControl(SEARCH_TTL) : NO_STORE,
      });
    }

    let locations: SearchResult[];
    try {
      locations = await searchGeocodingLocations(query, Math.min(limit, GEOCODING_MAX_COUNT));
    } catch (err) {
      logGeocodingFailure(err);
      const expired = cache.getStale(key) as CachedSearch;
      if (expired !== null && expired[0].data_status.status === LIVE) {
        return ok(asStale(expired[0]), { cacheHit: true, stale: true, cacheControl: NO_STORE });
      }
      // Provider down: valid local event matches are still worth serving
      // (labelled SIMULATED, never disguised as provider results).
      const events = matchEventIndex(query).map((e) => e as unknown as SearchResult);
      if (searchType === "all" && events.length > 0) {
        return ok(
          withStatus(
            { query, results: events.slice(0, limit) },
            SIMULATED,
            "fallback",
            "Location lookup unavailable — event results from the bundled index.",
          ),
          { cacheControl: NO_STORE },
        );
      }
      // Nothing honest to serve: no invented cities, no fabricated regions.
      return ok(
        withStatus(
          { query, results: [] },
          UNAVAILABLE,
          GEOCODING_SOURCE,
          "Location search unavailable: the geocoding provider could not be reached and no cached result exists.",
        ),
        { cacheControl: NO_STORE },
      );
    }

    const events =
      searchType === "all"
        ? matchEventIndex(query).map((e) => e as unknown as SearchResult)
        : [];
    const results = mergeSearchResults(locations, events, limit);
    const source =
      searchType === "all" ? `${GEOCODING_SOURCE} + bundled event index` : GEOCODING_SOURCE;
    const payload = withStatus(
      { query, results },
      LIVE,
      source,
      searchType === "all"
        ? `Live locations from ${GEOCODING_SOURCE} (${GEOCODING_ATTRIBUTION}); events from the bundled event index (see per-result source).`
        : `Live locations from ${GEOCODING_SOURCE} (${GEOCODING_ATTRIBUTION}).`,
    );
    cache.set(key, [payload, payload.data_status.fetched_at], SEARCH_TTL);
    return ok(payload, { cacheControl: publicCacheControl(SEARCH_TTL) });
  } catch (e) {
    return internalError(e);
  }
}
