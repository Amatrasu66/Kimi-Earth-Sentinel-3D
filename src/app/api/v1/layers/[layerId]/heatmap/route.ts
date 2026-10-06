import type { NextRequest } from "next/server";
import { getLayer } from "@/server/models/layers";
import { fail, internalError, ok } from "@/server/route-helpers";
import { getHeatmapPayload } from "@/server/services/layers";
import { parseResolution, parseTimeRange } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ layerId: string }> },
) {
  try {
    const { layerId } = await params;
    if (!getLayer(layerId)) {
      return fail(`Layer ${JSON.stringify(layerId)} not found.`, "NOT_FOUND", 404);
    }
    const sp = req.nextUrl.searchParams;
    const { value: resolution, error: resErr } = parseResolution(sp.get("resolution"));
    if (resErr || resolution === null) return fail(resErr ?? "Invalid resolution.");
    const { value: timeRange, error: rangeErr } = parseTimeRange(sp.get("time_range"));
    if (rangeErr || timeRange === null) return fail(rangeErr ?? "Invalid time_range.");

    const { data, cacheHit, stale } = await getHeatmapPayload(layerId, resolution, timeRange);
    return ok(data, { cacheHit, stale });
  } catch (e) {
    return internalError(e);
  }
}
