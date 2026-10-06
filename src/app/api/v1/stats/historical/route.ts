import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getMockHistoricalData } from "@/server/providers/fallback";
import { SIMULATED, successResponse, withStatus } from "@/server/provenance";
import { fail, internalError } from "@/server/route-helpers";

export const dynamic = "force-dynamic";

const METRICS = ["earthquakes", "temperature", "disasters", "wildfires", "air_quality"] as const;
const PERIODS = ["7d", "30d", "1y"] as const;
const AGGREGATIONS = ["daily", "weekly", "monthly"] as const;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const metric = sp.get("metric") ?? "earthquakes";
    const period = sp.get("period") ?? "30d";
    const aggregation = sp.get("aggregation") ?? "daily";
    if (!(METRICS as readonly string[]).includes(metric)) {
      return fail(`Invalid metric ${JSON.stringify(metric)}: must be one of ${METRICS.join(", ")}.`);
    }
    if (!(PERIODS as readonly string[]).includes(period)) {
      return fail(`Invalid period ${JSON.stringify(period)}: must be one of ${PERIODS.join(", ")}.`);
    }
    if (!(AGGREGATIONS as readonly string[]).includes(aggregation)) {
      return fail(`Invalid aggregation ${JSON.stringify(aggregation)}: must be one of ${AGGREGATIONS.join(", ")}.`);
    }
    const data = withStatus(
      getMockHistoricalData(metric, period, aggregation),
      SIMULATED,
      "fallback",
      "Historical series are simulated placeholders, not measured history.",
    );
    return NextResponse.json(successResponse(data));
  } catch (e) {
    return internalError(e);
  }
}
