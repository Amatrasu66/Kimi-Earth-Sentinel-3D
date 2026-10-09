/**
 * Shared route-handler helpers: JSON envelopes + error mapping.
 * Mirrors Flask's success_response / error_response and JSON error handlers.
 */
import { NextResponse } from "next/server";
import { errorBody, successResponse } from "./provenance";
import { redact, redactText } from "./redact";

export function ok<T extends Record<string, unknown>>(
  data: T,
  opts?: { cacheHit?: boolean; cachedAt?: string | null; stale?: boolean; cacheControl?: string },
) {
  return NextResponse.json(
    successResponse(data, {
      cacheHit: opts?.cacheHit,
      cachedAt: opts?.cachedAt,
      stale: opts?.stale,
    }),
    opts?.cacheControl ? { headers: { "Cache-Control": opts.cacheControl } } : undefined,
  );
}

/**
 * T2.1 HTTP caching policies. Successful LIVE or static-catalogue payloads
 * get a shared public policy (`s-maxage` + `stale-while-revalidate`),
 * mirroring the in-memory TTLs. Everything else — validation errors,
 * unknown routes, internal errors, throttles, health, and stale/simulated
 * fallbacks — gets `no-store` so shared caches never extend data that must
 * stay current or was never live.
 */
export function publicCacheControl(sMaxAge: number, staleWhileRevalidate = sMaxAge * 2): string {
  return `public, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`;
}

export const NO_STORE = "no-store";

/** Static catalogues (layer metadata, GIBS capabilities): code-defined, change only on deploy. */
export const STATIC_CATALOG_TTL = 3600;
/** API index: static version + links; short TTL keeps meta.timestamp reasonably fresh. */
export const INDEX_TTL = 60;

const noStoreHeaders = { headers: { "Cache-Control": NO_STORE } };

export function fail(message: string, code = "INVALID_PARAMS", status = 400) {
  return NextResponse.json(errorBody(code, message), { status, ...noStoreHeaders });
}

export function notFound(message = "Not found.") {
  return NextResponse.json(errorBody("NOT_FOUND", message), { status: 404, ...noStoreHeaders });
}

export function internalError(err: unknown) {
  const isDev = process.env.NODE_ENV !== "production";
  // T1.4: dev surfaces echo err.message, which can embed a credential-bearing
  // upstream URL — redact before it reaches the response or the server log.
  // Never leak stack traces / env in production.
  const message =
    isDev && err instanceof Error ? redactText(err.message) : "An unexpected error occurred.";
  console.error("[earth-sentinel] unhandled route error", isDev ? redact(err) : "");
  return NextResponse.json(errorBody("INTERNAL_ERROR", message), { status: 500, ...noStoreHeaders });
}

export const jsonHeaders = { "content-type": "application/json" };
