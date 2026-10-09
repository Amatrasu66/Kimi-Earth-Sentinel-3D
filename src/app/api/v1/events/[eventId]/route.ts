import { EventNotFound, EVENT_DETAIL_TTL, getEventDetail, isFireEventId } from "@/server/services/event-detail";
import { LIVE } from "@/server/provenance";
import { fail, internalError, NO_STORE, ok, publicCacheControl } from "@/server/route-helpers";
import { payloadStatus } from "@/server/services/layers";
import { parseFireEventId } from "@/server/providers/nasa-firms";

export const dynamic = "force-dynamic";

/**
 * T2.2 execution ceiling. Worst case is a single upstream detail fetch at
 * the 8 s provider timeout plus normalization. 15 s gives ~2× headroom and
 * stays far under the verified Vercel Hobby function cap (300 s
 * default/maximum for Node.js, Vercel docs 2026).
 */
export const maxDuration = 15;

const EVENT_ID_RE = /^[A-Za-z0-9_.-]+$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    if (!eventId || !eventId.trim()) return fail("event_id must not be empty.");
    if (eventId.length > 128) return fail("event_id must be at most 128 characters.");
    // Path-segment traversal guard: the charset below already excludes `/`
    // and `\`, but `.` / `..` alone would otherwise pass and fall through to
    // provider-shaped lookups. Reject before any network work.
    if (eventId === "." || eventId === ".." || eventId.includes("/") || eventId.includes("\\")) {
      return fail(`Invalid event_id ${JSON.stringify(eventId)}: must match [A-Za-z0-9_.-].`);
    }
    if (!EVENT_ID_RE.test(eventId)) {
      return fail(`Invalid event_id ${JSON.stringify(eventId)}: must match [A-Za-z0-9_.-].`);
    }
    // T2.3: wildfire markers carry fire-<lat>-<lon> ids; anything else in
    // the fire- namespace is malformed — reject before any provider work.
    if (isFireEventId(eventId) && !parseFireEventId(eventId)) {
      return fail(
        `Invalid wildfire event_id ${JSON.stringify(eventId)}: expected fire-<lat>-<lon> with valid coordinates.`,
      );
    }
    try {
      const { data, cacheHit, stale } = await getEventDetail(eventId);
      // T2.1: only LIVE detail gets the shared public policy. SIMULATED
      // detail (wildfire markers, lookup-less ids, provider fallbacks)
      // stays no-store — never extended through a shared cache.
      return ok(data, {
        cacheHit,
        stale,
        cacheControl:
          payloadStatus(data) === LIVE ? publicCacheControl(EVENT_DETAIL_TTL) : NO_STORE,
      });
    } catch (e) {
      if (e instanceof EventNotFound) return fail(e.message, "NOT_FOUND", 404);
      throw e;
    }
  } catch (e) {
    return internalError(e);
  }
}
