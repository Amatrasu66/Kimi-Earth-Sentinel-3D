import { getAllLayers } from "@/server/models/layers";
import { fail, internalError, ok } from "@/server/route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ layers: getAllLayers() });
  } catch (e) {
    return internalError(e);
  }
}

export async function POST() {
  return fail("Method not allowed.", "METHOD_NOT_ALLOWED", 405);
}
