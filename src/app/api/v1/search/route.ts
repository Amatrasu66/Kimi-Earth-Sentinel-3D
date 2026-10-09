import type { NextRequest } from "next/server";
import { searchMockData } from "@/server/providers/fallback";
import { SIMULATED, successResponse, withStatus } from "@/server/provenance";
import { fail, internalError } from "@/server/route-helpers";
import { parseLimit, parseSearchQuery } from "@/server/validation";
import { NextResponse } from "next/server";

// T2.1: bundled-gazetteer results are labelled SIMULATED — no-store, so a
// shared cache never extends fallback data.
const noStoreInit = { headers: { "Cache-Control": "no-store" } };

export const dynamic = "force-dynamic";

const SEARCH_TYPES = ["all", "location", "event"] as const;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const { value: query, error: queryErr } = parseSearchQuery(sp.get("q"));
    if (queryErr || query === null) return fail(queryErr ?? "Invalid query.");
    const searchType = sp.get("type") ?? "all";
    const { value: limit, error: limitErr } = parseLimit(sp.get("limit") ?? "20", 20, 100);
    if (limitErr || limit === null) return fail(limitErr ?? "Invalid limit.");
    if (!(SEARCH_TYPES as readonly string[]).includes(searchType)) {
      return fail(`Invalid type ${JSON.stringify(searchType)}: must be one of ${SEARCH_TYPES.join(", ")}.`);
    }
    if (!query || query.length < 2) {
      return NextResponse.json(successResponse({ query, results: [] }), noStoreInit);
    }
    const results = searchMockData(query, searchType, limit);
    const payload = withStatus(
      { query, results },
      SIMULATED,
      "fallback",
      "Search over a bundled gazetteer and event index — not a live lookup.",
    );
    return NextResponse.json(successResponse(payload), noStoreInit);
  } catch (e) {
    return internalError(e);
  }
}
