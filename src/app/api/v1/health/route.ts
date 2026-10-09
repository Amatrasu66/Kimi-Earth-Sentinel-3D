import { NextResponse } from "next/server";
import { healthPayload } from "@/server/health";
import { NO_STORE } from "@/server/route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  // T2.1: instance metadata must remain current — never shared-cache it.
  return NextResponse.json({ success: true, data: healthPayload() }, { headers: { "Cache-Control": NO_STORE } });
}
