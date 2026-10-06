import { notFound } from "@/server/route-helpers";

export const dynamic = "force-dynamic";

// Flask parity: unknown /api/* paths return JSON NOT_FOUND. Explicit
// routes (/api/health, /api/v1/*) take precedence over this catch-all.
export async function GET() {
  return notFound();
}
