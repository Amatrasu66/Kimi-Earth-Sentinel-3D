/**
 * Offline coordinate-to-IANA-timezone lookup (T2.6) — replaces the
 * longitude-only 15°-slice approximation (which mislabelled e.g. Kolkata as
 * Asia/Dhaka). No network, no key, no per-request upstream cost.
 *
 * Library: `@photostructure/tz-lookup` (pinned exact in package.json).
 * - Single 73 KB self-contained module: boundary data is inlined, with zero
 *   runtime file reads (`readFileSync`), fetches, or data-path env vars, so
 *   there is no serverless file-packaging risk — Next.js bundles it like any
 *   JS dependency. Verified by the packaging test in `geocode.test.ts`.
 * - Zero dependencies, CC0-1.0 license, data derived from
 *   timezone-boundary-builder (evansiroky, OpenStreetMap-sourced).
 * - Rejected alternative: `geo-tz` (exact boundaries, MIT, maintained) at
 *   ~70 MB unpacked plus runtime `data/`-directory reads and documented
 *   bundler/`GEO_TZ_DATA_PATH` hazards — incompatible with the
 *   smallest-practical-size and packaging-safety constraints.
 *
 * Known limitations (documented, not hidden):
 * - Lossy-compressed boundaries: near-border coordinates far from populated
 *   areas may resolve to the neighbouring zone. The result is deterministic
 *   (one best match) but border-exactness is not claimed — use `geo-tz` if a
 *   future task needs survey-grade borders.
 * - Offshore/uninhabited coordinates resolve to `Etc/GMT*` ocean zones by
 *   dataset design (same convention as `geo-tz`); still a valid IANA id.
 * - UTC offsets and wall-clock times are computed live via `Intl` against
 *   the platform tzdata, so DST-rule changes apply without a data update.
 *   Zone *identifiers* for populated places are stable across releases.
 */
import tzLookup from "@photostructure/tz-lookup";

export const TIMEZONE_SOURCE = "tz-lookup";
export const TIMEZONE_ATTRIBUTION =
  "Offline IANA lookup via @photostructure/tz-lookup (timezone-boundary-builder data, CC0-1.0); offsets computed for the current date";

function isValidLatLon(lat: number, lon: number): boolean {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

const ZONE_PART_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

function zonedParts(timeZone: string, date: Date): Record<string, string> {
  const dtf = new Intl.DateTimeFormat("en-US", { ...ZONE_PART_OPTIONS, timeZone });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return parts;
}

/** UTC offset of `timeZone` at `date`, in whole minutes (DST-aware). */
export function getUtcOffsetMinutes(timeZone: string, date: Date): number {
  const parts = zonedParts(timeZone, date);
  // hour12:false can yield "24" at midnight in some ICU builds — normalize.
  const hour = Number(parts.hour) % 24;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** `+330` → `UTC+05:30`. Sign follows the behind/ahead-of-UTC convention. */
export function formatUtcOffset(totalMinutes: number): string {
  const sign = totalMinutes < 0 ? "-" : "+";
  const abs = Math.abs(totalMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}

/** Wall-clock time in `timeZone` at `date`: `YYYY-MM-DDTHH:mm:ss` (no suffix — it is not UTC). */
export function zonedWallIso(timeZone: string, date: Date): string {
  const parts = zonedParts(timeZone, date);
  const hour = String(Number(parts.hour) % 24).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}`;
}

/**
 * Genuine IANA lookup for coordinates. Throws `TypeError` on invalid
 * input (routes validate first; this guards direct callers). Unexpected
 * library failures propagate to the route, which answers UNAVAILABLE —
 * the longitude approximation is never used as a silent fallback.
 */
export function getTimezoneInfo(lat: number, lon: number, now: Date = new Date()) {
  if (!isValidLatLon(lat, lon)) {
    throw new TypeError("getTimezoneInfo: lat must be within -90..90 and lon within -180..180.");
  }
  const timezone = tzLookup(lat, lon);
  return {
    timezone,
    offset: formatUtcOffset(getUtcOffsetMinutes(timezone, now)),
    local_time: zonedWallIso(timezone, now),
    approximate: false,
  };
}
