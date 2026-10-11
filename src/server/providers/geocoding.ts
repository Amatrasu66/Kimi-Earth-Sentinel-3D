/**
 * Open-Meteo Geocoding provider (T2.6) — real forward location search.
 *
 * Contract verified against the official docs
 * (https://open-meteo.com/en/docs/geocoding-api):
 * - `GET {base}/search?name=<q>&count=<1..100>&format=json&language=en`
 * - 2 characters match an exact name; 3+ use normalized prefix matching
 *   (case- and diacritic-insensitive); empty and single-character queries
 *   return no results — so the route's `< 2` short-circuit is upstream's
 *   rule, not just ours. Postal codes are accepted as `name`.
 * - optional `name` qualifier `<place>, <country|admin1>`; errors arrive as
 *   HTTP 400 `{error: true, reason}`; empty fields are omitted from rows.
 * - no key for standard non-commercial use. Usage terms: same Open-Meteo
 *   family as the forecast/air-quality feeds already in use (fair use,
 *   no key). Attribution required: location data based on GeoNames.
 *
 * Request economy: one request per route call, `count` capped at
 * GEOCODING_MAX_COUNT (relevance-ranked by the provider, no paging), the
 * shared timeout helper (`OPEN_METEO_TIMEOUT` override applies — same knob
 * as the other Open-Meteo feeds), and the existing heavy-route rate limit
 * (search is already "heavy"). The client debounces (300 ms) and aborts
 * superseded queries, so one keystroke burst costs ~one upstream call.
 */
import { serverConfig } from "../config";
import { fetchJsonWithTimeout, logWarn } from "../http";
import type { SearchResult } from "@/types";

export const GEOCODING_SOURCE = "Open-Meteo Geocoding";
export const GEOCODING_ATTRIBUTION =
  "Location data based on GeoNames (via Open-Meteo Geocoding)";
/**
 * Per-instance + shared-cache TTL (seconds) for LIVE merged search payloads.
 * Mirrors the shorter layer-TTL tier: geocoding rows change rarely upstream,
 * and the cache key embeds the exact query, so a shared 5-minute entry
 * bounds repeat upstream fan-out (debounced typeahead bursts, shared-cache
 * clients) without serving anything the provider would consider volatile.
 */
export const SEARCH_TTL = 300;
/**
 * Single-request provider fan-out cap. The provider returns relevance-ranked
 * rows; we take the top N and let the bundled event index fill the rest of
 * the route `limit`. Never page to 100 by default.
 */
export const GEOCODING_MAX_COUNT = 10;

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Map one provider row to the app's SearchResult contract. Null = unusable row (skipped, never invented). */
function mapRow(row: unknown): SearchResult | null {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  const name = strOrNull(r.name);
  const lat = numOrNull(r.latitude);
  const lon = numOrNull(r.longitude);
  const id = numOrNull(r.id);
  if (name === null || lat === null || lon === null || id === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const country = strOrNull(r.country);
  const admin1 = strOrNull(r.admin1);
  const population = numOrNull(r.population);
  const place = admin1 ? `${name}, ${admin1}` : name;
  return {
    id: `om-geo-${id}`,
    type: "location",
    name,
    lat,
    lon,
    ...(country ? { country } : {}),
    ...(admin1 ? { admin1 } : {}),
    ...(typeof r.country_code === "string" && r.country_code ? { country_code: r.country_code } : {}),
    ...(population !== null ? { population: Math.round(population) } : {}),
    snippet: `${place}${country ? `, ${country}` : ""}`,
    source: GEOCODING_SOURCE,
  };
}

/**
 * Live location lookup. Returns [] when the provider has no match; throws on
 * transport/HTTP/shape failures so the route can apply stale → event-index →
 * unavailable fallback in order. Client input travels only via
 * URLSearchParams encoding (never interpolated into the URL string).
 */
export async function searchGeocodingLocations(
  query: string,
  count: number,
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<SearchResult[]> {
  const baseUrl = serverConfig.openMeteoGeocodingUrl;
  const safeCount = Math.max(1, Math.min(Math.floor(count), GEOCODING_MAX_COUNT));
  const res = await fetchJsonWithTimeout(`${baseUrl}/search`, {
    params: { name: query, count: safeCount, format: "json", language: "en" },
    timeoutMs: opts?.timeoutMs ?? serverConfig.openMeteoTimeoutMs,
    signal: opts?.signal,
  });
  if (res.status >= 400) {
    const reason =
      res.json !== null && typeof res.json === "object" && !Array.isArray(res.json)
        ? strOrNull((res.json as Record<string, unknown>).reason)
        : null;
    throw new Error(
      `Open-Meteo Geocoding responded with status ${res.status}${reason ? `: ${reason}` : ""}`,
    );
  }
  if (res.json === null || typeof res.json !== "object" || Array.isArray(res.json)) {
    throw new Error("Unexpected Open-Meteo Geocoding response shape");
  }
  const body = res.json as Record<string, unknown>;
  if (body.error === true) {
    throw new Error(
      `Open-Meteo Geocoding error${typeof body.reason === "string" ? `: ${body.reason}` : ""}`,
    );
  }
  const rows = body.results ?? [];
  if (!Array.isArray(rows)) throw new Error("Unexpected Open-Meteo Geocoding response shape");
  const out: SearchResult[] = [];
  for (const row of rows) {
    const mapped = mapRow(row);
    if (mapped) out.push(mapped);
  }
  return out;
}

/**
 * Merge provider locations with bundled event-index matches (T2.6 ranking):
 * locations first in provider relevance order, then events in index order,
 * sliced to the route limit. Deterministic by construction — no scores are
 * compared, so equal-rank ties cannot reorder. Duplicate-looking locations
 * (same provider id, or same normalized name+country kept twice) collapse to
 * the first occurrence; events keep their stable ids and selection behavior.
 */
export function mergeSearchResults(
  locations: SearchResult[],
  events: SearchResult[],
  limit: number,
): SearchResult[] {
  const seenIds = new Set<string>();
  const seenPlaces = new Set<string>();
  const merged: SearchResult[] = [];
  for (const loc of locations) {
    if (seenIds.has(loc.id)) continue;
    const placeKey = `${loc.name.toLowerCase()}|${(loc.country ?? "").toLowerCase()}`;
    if (seenPlaces.has(placeKey)) continue;
    seenIds.add(loc.id);
    seenPlaces.add(placeKey);
    merged.push(loc);
  }
  for (const ev of events) {
    if (seenIds.has(ev.id)) continue;
    seenIds.add(ev.id);
    merged.push(ev);
  }
  return merged.slice(0, Math.max(0, limit));
}

export function logGeocodingFailure(err: unknown): void {
  logWarn("Open-Meteo Geocoding lookup failed", String(err));
}
