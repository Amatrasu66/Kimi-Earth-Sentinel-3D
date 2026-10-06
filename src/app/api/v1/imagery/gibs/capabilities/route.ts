import { GIBS_LAYERS } from "@/server/providers/imagery";
import { internalError, ok } from "@/server/route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ layers: GIBS_LAYERS });
  } catch (e) {
    return internalError(e);
  }
}
