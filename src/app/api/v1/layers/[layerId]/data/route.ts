import type { NextRequest } from "next/server";
import { getLayer } from "@/server/models/layers";
import { LIVE, ttlForLayer } from "@/server/provenance";
import { fail, internalError, NO_STORE, ok, publicCacheControl } from "@/server/route-helpers";
import { getLayerPayload, payloadStatus } from "@/server/services/layers";
import {
  checkSupportedParams,
  parseBbox,
  parseLimit,
  parseSeverity,
} from "@/server/validation";

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
    const bboxRaw = sp.get("bbox");
    const { error: bboxErr } = parseBbox(bboxRaw);
    if (bboxErr) return fail(bboxErr);
    const { value: limit, error: limitErr } = parseLimit(sp.get("limit"));
    if (limitErr || limit === null) return fail(limitErr ?? "Invalid limit.");
    const { value: minSeverity, error: sevErr } = parseSeverity(sp.get("min_severity"));
    if (sevErr) return fail(sevErr);
    const unsupported = checkSupportedParams(layerId, bboxRaw);
    if (unsupported) return fail(unsupported, "UNSUPPORTED_PARAM");

    const { data, cacheHit, stale } = await getLayerPayload(
      layerId,
      bboxRaw,
      limit,
      minSeverity,
    );
    // T2.1: only LIVE payloads get the shared public policy (mirroring the
    // in-memory layer TTL). STALE / SIMULATED fallbacks stay no-store so a
    // shared cache never extends data that was never live.
    const ttl = ttlForLayer(layerId);
    return ok(data, {
      cacheHit,
      stale,
      cacheControl: payloadStatus(data) === LIVE ? publicCacheControl(ttl) : NO_STORE,
    });
  } catch (e) {
    return internalError(e);
  }
}
