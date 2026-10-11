/**
 * T2.6 reverse-geocode tests: honest UNAVAILABLE, validation first, no
 * upstream call ever (any fetch attempt throws and fails the test).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as reverseGET } from "@/app/api/v1/geocode/reverse/route";

afterEach(() => {
  vi.unstubAllGlobals();
});

function reverseUrl(lat: string | null, lon: string | null): NextRequest {
  const params = new URLSearchParams();
  if (lat !== null) params.set("lat", lat);
  if (lon !== null) params.set("lon", lon);
  return new NextRequest(`http://localhost:3000/api/v1/geocode/reverse?${params.toString()}`);
}

describe("reverse geocode UNAVAILABLE (T2.6)", () => {
  it("returns the standard envelope with explicit UNAVAILABLE and null place fields", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("no upstream call is compliant here");
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await reverseGET(reverseUrl("40.7128", "-74.006"));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const body = (await res.json()) as {
      success: boolean;
      data: {
        lat: number;
        lon: number;
        name: null;
        country: null;
        country_code: null;
        region: null;
        timezone: null;
        data_status: { status: string; source: string | null; message: string | null };
      };
      meta: { data_status: string | null };
    };
    expect(body.success).toBe(true);
    expect(body.data.lat).toBe(40.7128);
    expect(body.data.lon).toBe(-74.006);
    // Shape-stable nulls — never a fabricated "Unknown"/"XX" region.
    expect(body.data.name).toBeNull();
    expect(body.data.country).toBeNull();
    expect(body.data.country_code).toBeNull();
    expect(body.data.region).toBeNull();
    expect(body.data.timezone).toBeNull();
    expect(body.data.data_status.status).toBe("unavailable");
    expect(body.meta.data_status).toBe("unavailable");
    // The message documents the exact constraint (Nominatim's per-application
    // 1 req/s cap, unenforceable from serverless isolates).
    expect(body.data.data_status.message).toMatch(/Nominatim/i);
    expect(body.data.data_status.message).toMatch(/1 request\/second/i);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects invalid coordinates with 400 before any provider consideration", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("must not be called");
    });
    vi.stubGlobal("fetch", fetchMock);
    for (const [lat, lon] of [["91", "0"], ["0", "181"], ["abc", "0"], [null, "0"], ["0", null]] as const) {
      const res = await reverseGET(reverseUrl(lat, lon));
      expect(res.status, `${lat},${lon}`).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
