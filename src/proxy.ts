/**
 * T1.3 enforcement point: runs before any `/api/v1/*` route handler, so
 * throttled requests are rejected BEFORE provider quota is touched.
 * Provider fallback semantics are untouched — limited callers get 429 with
 * the standard error envelope, never simulated data.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  checkLimit,
  classifyRoute,
  identityFromHeaders,
  runtimeStore,
} from "@/server/rate-limit";

export const config = {
  matcher: ["/api/v1/:path*"],
};

export function proxy(req: NextRequest) {
  const routeClass = classifyRoute(req.nextUrl.pathname);
  if (!routeClass) return NextResponse.next();
  const identity = identityFromHeaders(
    req.headers.get("x-forwarded-for"),
    // NextRequest has no `ip` since Next 15; Vercel and most proxies set this.
    req.headers.get("x-real-ip"),
  );
  const decision = checkLimit(runtimeStore(), identity, routeClass);
  if (decision.allowed) return NextResponse.next();
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: `Rate limit exceeded for this endpoint class. Retry after ${decision.retryAfterSec}s.`,
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(decision.retryAfterSec),
        "X-RateLimit-Remaining": "0",
        // T2.1: throttles are per-client decisions — never shared-cache them
        // as if they were successful data responses.
        "Cache-Control": "no-store",
      },
    },
  );
}
