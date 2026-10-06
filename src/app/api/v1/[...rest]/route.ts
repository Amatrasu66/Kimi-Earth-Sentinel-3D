import { notFound } from "@/server/route-helpers";

export const dynamic = "force-dynamic";

// Flask parity: unknown API paths return JSON NOT_FOUND instead of
// Next.js' default HTML 404 page.
export async function GET() {
  return notFound();
}
