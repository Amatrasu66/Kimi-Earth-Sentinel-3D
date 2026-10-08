/**
 * Central secret redaction for server-side logging and error messages.
 *
 * T1.4 (S-02): provider keys travel inside outbound URLs — the FIRMS key is
 * a URL *path segment* (`.../VIIRS_NOAA20_NRT/<key>/WORLD/1`) and the AirNow
 * key is an `API_KEY` *query param*. Timeout/network error text can therefore
 * embed a live credential (e.g. `UpstreamTimeoutError` carries the request
 * URL), and that text flows into `logWarn`/`logError` and dev 500 responses.
 *
 * Every server log call and every dev error surface MUST pass through
 * `redact()`/`redactText()` so diagnostics keep host/status/context while
 * credential material is replaced with `[REDACTED]`.
 */
import { serverConfig } from "./config";

export const REDACTED = "[REDACTED]";

/** Query-param / field names whose values are treated as credentials. */
const SENSITIVE_KEYS = new Set([
  "api_key",
  "apikey",
  "api-key",
  "apiKey",
  "API_KEY",
  "key",
  "token",
  "access_token",
  "auth_token",
  "secret",
  "client_secret",
  "password",
  "authorization",
]);

/** `?API_KEY=abc` / `&token=abc` — value runs to `&`, whitespace, quote or end. */
const QUERY_PARAM_RE =
  /([?&](?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|secret|token|key|password|authorization)=)([^&\s"'<>]*)/gi;

/** JSON-ish `"API_KEY": "abc"` / `'token'='abc'` shapes. */
const JSON_FIELD_RE =
  /((?:"|')?(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|secret|token|key|password|authorization)(?:"|')?\s*[:=]\s*(?:"|')?)([^"'&\s,}]*)/gi;

/**
 * Live credential values currently configured. Read lazily (per call) so
 * tests can rotate env vars and so a rotated key is picked up without a
 * redeploy. Short/empty values are ignored to avoid scrubbing ordinary text.
 */
export function configuredSecretValues(): string[] {
  const values = [serverConfig.airnowApiKey, serverConfig.nasaFirmsApiKey];
  return values.filter((v): v is string => typeof v === "string" && v.length >= 4);
}

/** Redact credential material inside a string, preserving surrounding context. */
export function redactText(input: string): string {
  let out = input;
  for (const secret of configuredSecretValues()) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  out = out.replace(QUERY_PARAM_RE, `$1${REDACTED}`);
  out = out.replace(JSON_FIELD_RE, `$1${REDACTED}`);
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-redact any value for safe logging: strings are scrubbed, object keys
 * matching a sensitive name get `[REDACTED]`, arrays are mapped element-wise,
 * Errors become their scrubbed `"Name: message"` rendering (the original
 * error is never mutated, so `instanceof` control flow is unaffected).
 * Primitives without strings pass through untouched.
 */
export function redact(input: unknown): unknown {
  if (typeof input === "string") return redactText(input);
  if (typeof input === "number" || typeof input === "boolean" || input == null) return input;
  if (input instanceof Error) return redactText(`${input.name}: ${input.message}`);
  if (Array.isArray(input)) return input.map((item) => redact(item));
  if (isPlainObject(input)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = SENSITIVE_KEYS.has(k) ? REDACTED : redact(v);
    }
    return out;
  }
  return input;
}
