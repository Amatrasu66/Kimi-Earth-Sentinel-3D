import { EventNotFound, getEventDetail } from "@/server/services/event-detail";
import { fail, internalError, ok } from "@/server/route-helpers";

export const dynamic = "force-dynamic";

const EVENT_ID_RE = /^[A-Za-z0-9_.-]+$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    if (!eventId || !eventId.trim()) return fail("event_id must not be empty.");
    if (eventId.length > 128) return fail("event_id must be at most 128 characters.");
    if (!EVENT_ID_RE.test(eventId)) {
      return fail(`Invalid event_id ${JSON.stringify(eventId)}: must match [A-Za-z0-9_.-].`);
    }
    try {
      const { data, cacheHit, stale } = await getEventDetail(eventId);
      return ok(data, { cacheHit, stale });
    } catch (e) {
      if (e instanceof EventNotFound) return fail(e.message, "NOT_FOUND", 404);
      throw e;
    }
  } catch (e) {
    return internalError(e);
  }
}
