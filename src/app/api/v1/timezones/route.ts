import type { NextRequest } from "next/server";
import { TIMEZONE_ATTRIBUTION, TIMEZONE_SOURCE, getTimezoneInfo } from "@/server/providers/geocode";
import { LIVE, UNAVAILABLE, withStatus } from "@/server/provenance";
import { NO_STORE, fail, internalError, ok } from "@/server/route-helpers";
import { parseLatLon } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const { value: coords, error } = parseLatLon(sp.get("lat"), sp.get("lon"));
    if (error || !coords) return fail(error ?? "lat and lon are required.");
    const [lat, lon] = coords;
    let info: { timezone: string; offset: string; local_time: string; approximate: boolean };
    try {
      info = getTimezoneInfo(lat, lon);
    } catch {
      // A reliable zone cannot be established — answer UNAVAILABLE rather
      // than silently falling back to the old longitude approximation.
      return ok(
        withStatus(
          { lat, lon, timezone: null, offset: null, local_time: null },
          UNAVAILABLE,
          "none",
          "Timezone lookup failed for these coordinates — no reliable IANA zone could be established.",
        ),
        { cacheControl: NO_STORE },
      );
    }
    // LIVE offline lookup. Deliberately no-store (not the generic public
    // policy): the payload embeds the current wall-clock time and UTC offset,
    // which go stale every second — like health timestamps, this response
    // must always be freshly computed. The lookup itself is an in-process
    // sync call, so no per-instance cache entry is needed either.
    return ok(withStatus(info, LIVE, TIMEZONE_SOURCE, TIMEZONE_ATTRIBUTION), {
      cacheControl: NO_STORE,
    });
  } catch (e) {
    return internalError(e);
  }
}
