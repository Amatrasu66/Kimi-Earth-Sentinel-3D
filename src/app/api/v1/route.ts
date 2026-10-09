import { VERSION } from "@/server/health";
import { internalError, ok } from "@/server/route-helpers";

export const dynamic = "force-dynamic";

/**
 * T2.9 API index: version + links to existing routes in the standard
 * `{ success, data, meta }` envelope. Links are relative same-origin
 * paths so an untrusted Host header cannot turn them into absolute
 * attacker-controlled URLs.
 */
export async function GET() {
  try {
    return ok({
      version: VERSION,
      links: {
        self: "/api/v1",
        layers: "/api/v1/layers",
        health: "/api/v1/health",
      },
    });
  } catch (e) {
    return internalError(e);
  }
}
