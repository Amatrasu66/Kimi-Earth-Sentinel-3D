/**
 * T2.6 timezone-route tests: LIVE offline lookup and validation.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as timezoneGET } from "@/app/api/v1/timezones/route";

afterEach(() => {
  vi.unstubAllGlobals();
});

function tzUrl(lat: string | null, lon: string | null): NextRequest {
  const params = new URLSearchParams();
  if (lat !== null) params.set("lat", lat);
  if (lon !== null) params.set("lon", lon);
  return new NextRequest(`http://localhost:3000/api/v1/timezones?${params.toString()}`);
}

interface TzBody {
  success: boolean;
  data: {
    timezone: string | null;
    offset: string | null;
    local_time: string | null;
    approximate?: boolean;
    data_status: { status: string; source: string | null; message: string | null };
  };
  meta: { cache_hit: boolean; data_status: string | null };
}

describe("timezone route (T2.6)", () => {
  it("returns a genuine LIVE IANA zone for Kolkata (not the old Dhaka slice)", async () => {
    const res = await timezoneGET(tzUrl("22.5726", "88.3639"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as TzBody;
    expect(body.success).toBe(true);
    expect(body.data.timezone).toBe("Asia/Kolkata");
    expect(body.data.offset).toMatch(/^UTC[+-]\d{2}:\d{2}$/);
    expect(body.data.approximate).toBe(false);
    expect(body.data.data_status.status).toBe("live");
    expect(body.meta.cache_hit).toBe(false);
    // Wall-clock payloads are never shared-cached (per-second staleness).
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects invalid coordinates with 400", async () => {
    for (const [lat, lon] of [["91", "0"], ["0", "200"], ["x", "0"], [null, "0"]] as const) {
      const res = await timezoneGET(tzUrl(lat, lon));
      expect(res.status, `${lat},${lon}`).toBe(400);
    }
  });
});
