import { GIBS_LAYERS } from "@/server/providers/imagery";
import { internalError, ok, publicCacheControl, STATIC_CATALOG_TTL } from "@/server/route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // T2.1: static 3-layer catalogue — safe for a long shared policy.
    return ok({ layers: GIBS_LAYERS }, { cacheControl: publicCacheControl(STATIC_CATALOG_TTL) });
  } catch (e) {
    return internalError(e);
  }
}
