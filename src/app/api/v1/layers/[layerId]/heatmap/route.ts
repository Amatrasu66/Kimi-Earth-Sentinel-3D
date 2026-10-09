import type { NextRequest } from "next/server";
import { getLayer } from "@/server/models/layers";
import { LIVE } from "@/server/provenance";
import { fail, internalError, NO_STORE, ok, publicCacheControl } from "@/server/route-helpers";
import { getHeatmapPayload, HEATMAP_TTL, payloadStatus } from "@/server/services/layers";
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
    // T2.1: heatmap grids are labelled SIMULATED today, so they stay
    // no-store; the LIVE branch applies automatically if real grids land.
    return ok(data, {
      cacheHit,
      stale,
      cacheControl: payloadStatus(data) === LIVE ? publicCacheControl(HEATMAP_TTL) : NO_STORE,
    });
  } catch (e) {
    return internalError(e);
  }
}
