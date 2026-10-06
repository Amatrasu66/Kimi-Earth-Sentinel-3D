import type { NextRequest } from "next/server";
import { searchMockData } from "@/server/providers/fallback";
import { SIMULATED, successResponse, withStatus } from "@/server/provenance";
import { fail, internalError } from "@/server/route-helpers";
import { parseLimit } from "@/server/validation";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SEARCH_TYPES = ["all", "location", "event"] as const;
const MAX_QUERY_LENGTH = 200;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const query = sp.get("q") ?? "";
    const searchType = sp.get("type") ?? "all";
    const { value: limit, error: limitErr } = parseLimit(sp.get("limit") ?? "20", 20, 100);
    if (limitErr || limit === null) return fail(limitErr ?? "Invalid limit.");
    if (!(SEARCH_TYPES as readonly string[]).includes(searchType)) {
      return fail(`Invalid type ${JSON.stringify(searchType)}: must be one of ${SEARCH_TYPES.join(", ")}.`);
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return fail(`Query must be at most ${MAX_QUERY_LENGTH} characters.`);
    }
    if (!query || query.length < 2) {
      return NextResponse.json(successResponse({ query, results: [] }));
    }
    const results = searchMockData(query, searchType, limit);
    const payload = withStatus(
      { query, results },
      SIMULATED,
      "fallback",
      "Search over a bundled gazetteer and event index — not a live lookup.",
    );
    return NextResponse.json(successResponse(payload));
  } catch (e) {
    return internalError(e);
  }
}
