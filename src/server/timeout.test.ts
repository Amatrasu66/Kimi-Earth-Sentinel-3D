/**
 * T2.2 upstream timeouts: default deadline, validated overrides, error
 * classification, timer/listener hygiene, and redaction. Deterministic —
 * upstream fetches are stubbed; slow paths use short real deadlines or
 * fake timers, never the network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS, serverConfig } from "@/server/config";
import { fetchJsonWithTimeout, UpstreamTimeoutError } from "@/server/http";
import { GET as layerDataGET } from "@/app/api/v1/layers/[layerId]/data/route";
import { maxDuration as dataMaxDuration } from "@/app/api/v1/layers/[layerId]/data/route";
import { maxDuration as eventsMaxDuration } from "@/app/api/v1/events/[eventId]/route";
import { getCache } from "@/server/cache";
import { NextRequest } from "next/server";

const QUAKE = { params: Promise.resolve({ layerId: "earthquakes" }) };

function neverSettles(): Promise<Response> {
  return new Promise<Response>(() => {});
}

function jsonResponse(payload: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  getCache().clear();
});

describe("fetchJsonWithTimeout deadline", () => {
  it("returns before the deadline on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ hello: "world" })),
    );
    const res = await fetchJsonWithTimeout("https://example.invalid/x", { timeoutMs: 2000 });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ hello: "world" });
  });

  it("rejects with UpstreamTimeoutError past the deadline", async () => {
    vi.stubGlobal("fetch", vi.fn(neverSettles));
    const err = await fetchJsonWithTimeout("https://example.invalid/slow", {
      timeoutMs: 30,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UpstreamTimeoutError);
    expect((err as Error).name).toBe("UpstreamTimeoutError");
    expect((err as Error).message).toContain("timed out after 30ms");
  });

  it("still rejects on the deadline when fetch ignores cancellation", async () => {
    // Non-compliant fetch: never settles and never observes the signal.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>(() => {
            /* ignores signal entirely */
          }),
      ),
    );
    const err = await fetchJsonWithTimeout("https://example.invalid/stubborn", {
      timeoutMs: 30,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UpstreamTimeoutError);
  });

  it("returns non-success HTTP statuses instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ nope: true }, 503)),
    );
    const res = await fetchJsonWithTimeout("https://example.invalid/down", { timeoutMs: 1000 });
    expect(res.status).toBe(503);
  });

  it("propagates connection failures unwrapped (not a timeout)", async () => {
    const failure = new TypeError("fetch failed");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw failure;
      }),
    );
    const err = await fetchJsonWithTimeout("https://example.invalid/dead", {
      timeoutMs: 1000,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBe(failure);
    expect(err).not.toBeInstanceOf(UpstreamTimeoutError);
  });

  it("propagates an already-aborted caller signal as cancellation, not a timeout", async () => {
    const controller = new AbortController();
    controller.abort();
    // No work may start for an already-cancelled caller: the network is
    // never touched and the abort reason propagates unwrapped.
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    const err = await fetchJsonWithTimeout("https://example.invalid/cancelled", {
      timeoutMs: 1000,
      signal: controller.signal,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(err).not.toBeInstanceOf(UpstreamTimeoutError);
    expect((err as Error).name).toBe("AbortError");
  });

  it("clears its timer and removes its abort listener on success", async () => {
    const setSpy = vi.spyOn(globalThis, "setTimeout");
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, "addEventListener");
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");
    const setsBefore = setSpy.mock.calls.length;
    const clearsBefore = clearSpy.mock.calls.length;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true })),
    );
    await fetchJsonWithTimeout("https://example.invalid/fast", {
      timeoutMs: 5000,
      signal: controller.signal,
    });
    expect(clearSpy.mock.calls.length - clearsBefore).toBe(
      setSpy.mock.calls.length - setsBefore,
    );
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    setSpy.mockRestore();
    clearSpy.mockRestore();
  });

  it("redacts credential-bearing URLs in timeout errors", async () => {
    // Production scenario: the FIRMS key travels as a URL path segment and
    // is only scrubbable because it matches a configured secret value.
    vi.stubEnv("NASA_FIRMS_API_KEY", "SECRETKEY123");
    vi.stubGlobal("fetch", vi.fn(neverSettles));
    const pathErr = (await fetchJsonWithTimeout(
      "https://firms.modaps.eosdis.nasa.gov/api/area/csv/SECRETKEY123/WORLD/1",
      { timeoutMs: 20 },
    ).then(
      () => null,
      (e: unknown) => e,
    )) as Error;
    expect(pathErr).toBeInstanceOf(UpstreamTimeoutError);
    expect(pathErr.message).not.toContain("SECRETKEY123");
    expect(pathErr.message).toContain("[REDACTED]");
    vi.unstubAllEnvs();
    // Query-param credentials are scrubbed by pattern even with no env set.
    const queryErr = (await fetchJsonWithTimeout(
      "https://www.airnowapi.org/aq/observation?API_KEY=OTHERSECRET999",
      { timeoutMs: 20 },
    ).then(
      () => null,
      (e: unknown) => e,
    )) as Error;
    expect(queryErr.message).not.toContain("OTHERSECRET999");
    expect(queryErr.message).toContain("[REDACTED]");
  });

  it("falls back to the 8 s default for missing or invalid timeoutMs", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(neverSettles));
    for (const timeoutMs of [undefined, 0, -5, Number.NaN]) {
      const pending = fetchJsonWithTimeout("https://example.invalid/d", { timeoutMs });
      const assertion = expect(pending).rejects.toBeInstanceOf(UpstreamTimeoutError);
      await vi.advanceTimersByTimeAsync(8000);
      await assertion;
    }
    // And the default really is 8 s, not the old 15 s.
    const pending = fetchJsonWithTimeout("https://example.invalid/d2");
    const assertion = expect(pending).rejects.toThrow("after 8000ms");
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
  });
});

describe("timeout configuration", () => {
  it("defaults the global timeout to 8 s", () => {
    expect(DEFAULTS.REQUEST_TIMEOUT).toBe(8);
    expect(serverConfig.requestTimeoutSec).toBe(8);
    expect(serverConfig.requestTimeoutMs).toBe(8000);
  });

  it("accepts a valid REQUEST_TIMEOUT override", () => {
    vi.stubEnv("REQUEST_TIMEOUT", "5");
    expect(serverConfig.requestTimeoutSec).toBe(5);
    expect(serverConfig.requestTimeoutMs).toBe(5000);
  });

  it("falls back on malformed or non-positive overrides", () => {
    for (const raw of ["abc", "0", "-3", ""]) {
      vi.stubEnv("REQUEST_TIMEOUT", raw);
      expect(serverConfig.requestTimeoutSec, raw).toBe(8);
    }
    vi.unstubAllEnvs();
  });

  it("clamps excessive overrides to the upper bound", () => {
    vi.stubEnv("REQUEST_TIMEOUT", "3600");
    expect(serverConfig.requestTimeoutSec).toBe(DEFAULTS.MAX_UPSTREAM_TIMEOUT_SEC);
  });

  it("supports per-provider overrides with global fallback", () => {
    vi.stubEnv("REQUEST_TIMEOUT", "6");
    vi.stubEnv("USGS_TIMEOUT", "3");
    expect(serverConfig.usgsTimeoutMs).toBe(3000);
    vi.stubEnv("USGS_TIMEOUT", "garbage");
    expect(serverConfig.usgsTimeoutMs).toBe(6000);
    vi.stubEnv("OPEN_METEO_TIMEOUT", "120");
    expect(serverConfig.openMeteoTimeoutMs).toBe(DEFAULTS.MAX_UPSTREAM_TIMEOUT_SEC * 1000);
  });
});

describe("route maxDuration ceilings (T2.2)", () => {
  it("caps the fan-out data route and the detail route conservatively", () => {
    // Worst case by construction stays far below these; both stay far
    // below the verified Vercel Hobby function cap (300 s).
    expect(dataMaxDuration).toBe(30);
    expect(eventsMaxDuration).toBe(15);
  });
});

describe("timeout responses keep T2.1 fallback cache policy", () => {
  it("a provider timeout yields simulated data with no-store", async () => {
    vi.stubEnv("REQUEST_TIMEOUT", "1");
    vi.stubGlobal("fetch", vi.fn(neverSettles));
    const res = await layerDataGET(
      new NextRequest("http://localhost:3000/api/v1/layers/earthquakes/data?limit=5"),
      QUAKE,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as {
      data: { data_status: { status: string } };
      meta: { cache_hit: boolean };
    };
    expect(body.data.data_status.status).toBe("simulated");
    expect(body.meta.cache_hit).toBe(false);
  }, 15000);
});
