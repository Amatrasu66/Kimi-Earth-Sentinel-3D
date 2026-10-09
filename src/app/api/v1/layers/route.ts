import { getAllLayers } from "@/server/models/layers";
import { fail, internalError, ok, publicCacheControl, STATIC_CATALOG_TTL } from "@/server/route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // T2.1: static code-defined catalogue — safe for a long shared policy.
    return ok({ layers: getAllLayers() }, { cacheControl: publicCacheControl(STATIC_CATALOG_TTL) });
  } catch (e) {
    return internalError(e);
  }
}

export async function POST() {
  return fail("Method not allowed.", "METHOD_NOT_ALLOWED", 405);
}
