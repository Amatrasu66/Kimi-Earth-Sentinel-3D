/**
 * T2.6 timezone UNAVAILABLE path: when the offline lookup cannot establish a
 * zone, the route answers UNAVAILABLE — never the longitude approximation.
 * Isolated in its own file so the throwing module mock cannot leak into the
 * LIVE-path suite (vitest isolates modules per test file).
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@photostructure/tz-lookup", () => ({
  __esModule: true,
  default: () => {
    throw new Error("dataset boom");
  },
}));

import { GET as timezoneGET } from "@/app/api/v1/timezones/route";

describe("timezone route lookup failure (T2.6)", () => {
  it("answers UNAVAILABLE with null fields and no-store", async () => {
    const res = await timezoneGET(
      new NextRequest("http://localhost:3000/api/v1/timezones?lat=22.5726&lon=88.3639"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        timezone: null;
        offset: null;
        local_time: null;
        data_status: { status: string; message: string | null };
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.timezone).toBeNull();
    expect(body.data.offset).toBeNull();
    expect(body.data.local_time).toBeNull();
    expect(body.data.data_status.status).toBe("unavailable");
    expect(typeof body.data.data_status.message).toBe("string");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
