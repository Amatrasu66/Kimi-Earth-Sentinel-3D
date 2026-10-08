/**
 * T1.4 regression tests: provider secrets must never reach logs or dev
 * error surfaces — they are emitted as [REDACTED] with context preserved.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { REDACTED, configuredSecretValues, redact, redactText } from "@/server/redact";
import { logError, logWarn } from "@/server/http";
import { internalError } from "@/server/route-helpers";

const FIRMS_KEY = "firms-test-key-9f8e7d6c";
const AIRNOW_KEY = "airnow-test-key-1a2b3c4d";

const PREV_FIRMS = process.env.NASA_FIRMS_API_KEY;
const PREV_AIRNOW = process.env.AIRNOW_API_KEY;

function setTestKeys() {
  process.env.NASA_FIRMS_API_KEY = FIRMS_KEY;
  process.env.AIRNOW_API_KEY = AIRNOW_KEY;
}

afterEach(() => {
  if (PREV_FIRMS === undefined) delete process.env.NASA_FIRMS_API_KEY;
  else process.env.NASA_FIRMS_API_KEY = PREV_FIRMS;
  if (PREV_AIRNOW === undefined) delete process.env.AIRNOW_API_KEY;
  else process.env.AIRNOW_API_KEY = PREV_AIRNOW;
  vi.restoreAllMocks();
});

describe("redactText", () => {
  it("redacts a FIRMS key embedded as a URL path segment, keeping host/context", () => {
    setTestKeys();
    const url =
      `https://firms.modaps.eosdis.nasa.gov/api/area/csv/VIIRS_NOAA20_NRT/${FIRMS_KEY}/WORLD/1`;
    const out = redactText(`Upstream request timed out after 15000ms: ${url}`);
    expect(out).not.toContain(FIRMS_KEY);
    expect(out).toContain(REDACTED);
    expect(out).toContain("firms.modaps.eosdis.nasa.gov");
    expect(out).toContain("VIIRS_NOAA20_NRT");
    expect(out).toContain("15000ms");
  });

  it("redacts API_KEY / api_key / token query params case-insensitively", () => {
    const out = redactText(
      "https://www.airnowapi.org/aq/observation/latLong/current/?format=application/json&API_KEY=s3cr3t-abc&distance=500",
    );
    expect(out).not.toContain("s3cr3t-abc");
    expect(out).toContain(`API_KEY=${REDACTED}`);
    expect(out).toContain("distance=500");
    expect(redactText("https://x.test/?api_key=hunter2&a=1")).toBe(
      `https://x.test/?api_key=${REDACTED}&a=1`,
    );
    expect(redactText("https://x.test/?token=t0k3n")).toBe(`https://x.test/?token=${REDACTED}`);
  });

  it("redacts configured secret values wherever they appear", () => {
    setTestKeys();
    expect(configuredSecretValues()).toEqual(expect.arrayContaining([FIRMS_KEY, AIRNOW_KEY]));
    const out = redactText(`FIRMS responded with status 500 for key ${AIRNOW_KEY} retrying`);
    expect(out).not.toContain(AIRNOW_KEY);
    expect(out).toContain(REDACTED);
    expect(out).toContain("status 500");
  });

  it("leaves non-secret text untouched", () => {
    expect(redactText("USGS responded with status 503")).toBe("USGS responded with status 503");
    expect(redactText("")).toBe("");
  });
});

describe("redact (deep)", () => {
  it("redacts sensitive object keys and nested credential strings without mutating input", () => {
    const input = {
      params: { format: "application/json", API_KEY: "s3cr3t-abc", distance: 500 },
      nested: { list: ["plain", `key=${FIRMS_KEY}`] },
      count: 3,
    };
    const out = redact(input) as Record<string, unknown>;
    expect((out.params as Record<string, unknown>).API_KEY).toBe(REDACTED);
    expect((out.params as Record<string, unknown>).distance).toBe(500);
    expect(JSON.stringify(out)).not.toContain("s3cr3t-abc");
    // original untouched
    expect((input.params as Record<string, unknown>).API_KEY).toBe("s3cr3t-abc");
  });

  it("renders Errors as scrubbed text and passes primitives through", () => {
    setTestKeys();
    const err = new Error(`request failed: ${FIRMS_KEY}`);
    const out = redact(err) as string;
    expect(out).not.toContain(FIRMS_KEY);
    expect(out).toContain(REDACTED);
    expect(out).toContain("request failed");
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
  });
});

describe("server loggers (T1.4 acceptance)", () => {
  it("logWarn emits [REDACTED] for a credential-bearing error message", () => {
    setTestKeys();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const firmsUrl =
      `https://firms.modaps.eosdis.nasa.gov/api/area/csv/VIIRS_NOAA20_NRT/${FIRMS_KEY}/WORLD/1`;
    logWarn(
      "FIRMS provider unreachable, using fallback",
      `UpstreamTimeoutError: Upstream request timed out after 15000ms: ${firmsUrl}`,
    );
    expect(spy).toHaveBeenCalledOnce();
    const emitted = spy.mock.calls[0].map(String).join(" ");
    expect(emitted).not.toContain(FIRMS_KEY);
    expect(emitted).toContain(REDACTED);
    expect(emitted).toContain("FIRMS provider unreachable");
  });

  it("logError emits [REDACTED] for an AirNow key in the detail", () => {
    setTestKeys();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError(
      "AirNow provider unreachable, using fallback",
      `Error: AirNow responded with status 403 for API_KEY=${AIRNOW_KEY}`,
    );
    const emitted = spy.mock.calls[0].map(String).join(" ");
    expect(emitted).not.toContain(AIRNOW_KEY);
    expect(emitted).toContain(`API_KEY=${REDACTED}`);
  });
});

describe("internalError dev surface", () => {
  it("redacts credential-bearing messages in dev 500 responses", async () => {
    setTestKeys();
    const res = internalError(
      new Error(`Upstream request timed out: ${FIRMS_KEY} at firms.modaps.eosdis.nasa.gov`),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { success: boolean; error: { message: string } };
    expect(body.success).toBe(false);
    expect(body.error.message).not.toContain(FIRMS_KEY);
    expect(body.error.message).toContain(REDACTED);
    expect(body.error.message).toContain("firms.modaps.eosdis.nasa.gov");
  });
});
