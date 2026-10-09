import { getMockStats } from "@/server/providers/fallback";
import { SIMULATED, successResponse, withStatus } from "@/server/provenance";
import { internalError } from "@/server/route-helpers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = withStatus(
      getMockStats(),
      SIMULATED,
      "fallback",
      "Global stats are simulated in this build.",
    );
    // T2.1: simulated rollup (uses Math.random per request) — no-store.
    return NextResponse.json(successResponse(data, { cacheHit: false }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return internalError(e);
  }
}
