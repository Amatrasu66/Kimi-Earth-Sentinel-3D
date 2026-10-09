import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { reverseGeocodeMock } from "@/server/providers/fallback";
import { SIMULATED, successResponse, withStatus } from "@/server/provenance";
import { fail, internalError } from "@/server/route-helpers";
import { parseLatLon } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const { value: coords, error } = parseLatLon(sp.get("lat"), sp.get("lon"));
    if (error || !coords) return fail(error ?? "lat and lon are required.");
    const [lat, lon] = coords;
    const result = withStatus(
      reverseGeocodeMock(lat, lon),
      SIMULATED,
      "fallback",
      "Coarse region lookup, not a geocoding provider result.",
    );
    // T2.1: simulated lookup — no-store.
    return NextResponse.json(successResponse(result), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return internalError(e);
  }
}
