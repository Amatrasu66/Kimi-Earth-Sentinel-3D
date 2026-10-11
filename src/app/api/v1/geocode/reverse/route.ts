import type { NextRequest } from "next/server";
import { UNAVAILABLE, withStatus } from "@/server/provenance";
import { NO_STORE, fail, internalError, ok } from "@/server/route-helpers";
import { parseLatLon } from "@/server/validation";

export const dynamic = "force-dynamic";

/**
 * T2.6: honest UNAVAILABLE — no fabricated region.
 *
 * Provider decision (verified 2026-10-11 against the current usage policy,
 * https://operations.osmfoundation.org/policies/nominatim/): the public
 * OpenStreetMap Nominatim service caps at 1 request/second *per application*
 * (aggregate across all users), requires identifying User-Agent + ODbL
 * attribution, and forbids autocomplete. This app runs serverless across
 * many per-instance isolates — a per-instance in-memory limiter cannot
 * establish the application-wide 1 req/s the policy demands, and claiming
 * otherwise would be dishonest (see docs/development.md). Open-Meteo offers
 * no reverse endpoint, and no other no-key option fits the
 * no-new-infrastructure constraint — so the endpoint returns the standard
 * envelope with an explicit UNAVAILABLE status (owner rule: real provider
 * only if terms permit, otherwise UNAVAILABLE, never simulated).
 */
const UNAVAILABLE_MESSAGE =
  "Reverse geocoding is unavailable: no compliant no-key provider can serve it " +
  "within this deployment's constraints (the public Nominatim service allows at most " +
  "1 request/second per application — unenforceable from per-instance serverless state — " +
  "and Open-Meteo offers no reverse endpoint). No location is guessed.";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const { value: coords, error } = parseLatLon(sp.get("lat"), sp.get("lon"));
    if (error || !coords) return fail(error ?? "lat and lon are required.");
    const [lat, lon] = coords;
    // Shape-stable nulls: machine-readable, and no UI or test can mistake
    // them for a real place. No upstream call is ever made here.
    return ok(
      withStatus(
        { lat, lon, name: null, country: null, country_code: null, region: null, timezone: null },
        UNAVAILABLE,
        "none",
        UNAVAILABLE_MESSAGE,
      ),
      { cacheControl: NO_STORE },
    );
  } catch (e) {
    return internalError(e);
  }
}
