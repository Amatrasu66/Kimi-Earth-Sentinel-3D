/**
 * Reusable fetch-with-timeout utility — mirrors REQUEST_TIMEOUT semantics.
 * Uses AbortController so upstream requests can never hang indefinitely.
 */
import { serverConfig } from "./config";
import { redact, redactText } from "./redact";

export class UpstreamTimeoutError extends Error {
  constructor(message = "Upstream request timed out") {
    super(message);
    this.name = "UpstreamTimeoutError";
  }
}

/** fetch JSON with a timeout. Throws UpstreamTimeoutError on abort-by-timeout. */
export async function fetchJsonWithTimeout(
  url: string,
  opts: {
    params?: Record<string, string | number | undefined>;
    timeoutMs?: number;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<{ status: number; json: unknown; text?: string }> {
  const timeoutMs = opts.timeoutMs ?? serverConfig.requestTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Merge caller signal (request cancellation) with our timeout.
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onCallerAbort);

  try {
    const fullUrl = buildUrl(url, opts.params);
    const res = await fetch(fullUrl, {
      signal: controller.signal,
      headers: opts.headers,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, json, text };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      if (opts.signal?.aborted) throw err; // caller cancelled — propagate
      // T1.4: `url` can embed a credential (FIRMS key is a path segment),
      // so the timeout message is redacted at construction — before it can
      // reach any log call or dev error response via String(err).
      throw new UpstreamTimeoutError(`Upstream request timed out after ${timeoutMs}ms: ${redactText(url)}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }
}

/** fetch raw text with a timeout (for CSV feeds like FIRMS). */
export async function fetchTextWithTimeout(
  url: string,
  opts: {
    params?: Record<string, string | number | undefined>;
    timeoutMs?: number;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<{ status: number; text: string }> {
  const { text, status } = await fetchJsonWithTimeout(url, opts);
  return { status, text: text ?? "" };
}

export function buildUrl(base: string, params?: Record<string, string | number | undefined>): string {
  if (!params) return base;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) usp.append(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Minimal structured server log. `detail` is redacted — never logs secrets. */
export function logWarn(message: string, detail?: unknown) {
  console.warn(`[earth-sentinel] ${message}`, redact(detail) ?? "");
}

export function logError(message: string, detail?: unknown) {
  console.error(`[earth-sentinel] ${message}`, redact(detail) ?? "");
}
