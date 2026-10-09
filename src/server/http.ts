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
  // T2.2: non-positive or non-finite explicit timeouts fall back to the
  // validated global default instead of firing immediately or never.
  const timeoutMs =
    typeof opts.timeoutMs === "number" && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
      ? opts.timeoutMs
      : serverConfig.requestTimeoutMs;
  // T2.2: a caller that is already cancelled must not start work — the
  // abort listener below would never fire for it, so propagate the abort
  // reason up front instead of running to the timeout and misreporting it.
  if (opts.signal?.aborted) throw opts.signal.reason;
  const controller = new AbortController();

  // Merge caller signal (request cancellation) with our timeout.
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onCallerAbort);

  // T2.2: race the fetch against the deadline so the timeout is guaranteed
  // even if the underlying fetch ignores the abort signal. The message is
  // redacted at construction (T1.4) — before it can reach any log call.
  const timeoutMessage = () =>
    `Upstream request timed out after ${timeoutMs}ms: ${redactText(url)}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new UpstreamTimeoutError(timeoutMessage()));
    }, timeoutMs);
  });
  const fetchPromise = (async () => {
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
  })();
  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (err: unknown) {
    if (err instanceof UpstreamTimeoutError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      if (opts.signal?.aborted) throw err; // caller cancelled — propagate
      // T1.4: `url` can embed a credential (FIRMS key is a path segment),
      // so the timeout message is redacted at construction — before it can
      // reach any log call or dev error response via String(err).
      throw new UpstreamTimeoutError(timeoutMessage());
    }
    throw err;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
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
