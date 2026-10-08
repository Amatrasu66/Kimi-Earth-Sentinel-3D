/**
 * Shared route-handler helpers: JSON envelopes + error mapping.
 * Mirrors Flask's success_response / error_response and JSON error handlers.
 */
import { NextResponse } from "next/server";
import { errorBody, successResponse } from "./provenance";
import { redact, redactText } from "./redact";

export function ok<T extends Record<string, unknown>>(
  data: T,
  opts?: { cacheHit?: boolean; cachedAt?: string | null; stale?: boolean },
) {
  return NextResponse.json(
    successResponse(data, {
      cacheHit: opts?.cacheHit,
      cachedAt: opts?.cachedAt,
      stale: opts?.stale,
    }),
  );
}

export function fail(message: string, code = "INVALID_PARAMS", status = 400) {
  return NextResponse.json(errorBody(code, message), { status });
}

export function notFound(message = "Not found.") {
  return NextResponse.json(errorBody("NOT_FOUND", message), { status: 404 });
}

export function internalError(err: unknown) {
  const isDev = process.env.NODE_ENV !== "production";
  // T1.4: dev surfaces echo err.message, which can embed a credential-bearing
  // upstream URL — redact before it reaches the response or the server log.
  // Never leak stack traces / env in production.
  const message =
    isDev && err instanceof Error ? redactText(err.message) : "An unexpected error occurred.";
  console.error("[earth-sentinel] unhandled route error", isDev ? redact(err) : "");
  return NextResponse.json(errorBody("INTERNAL_ERROR", message), { status: 500 });
}

export const jsonHeaders = { "content-type": "application/json" };
