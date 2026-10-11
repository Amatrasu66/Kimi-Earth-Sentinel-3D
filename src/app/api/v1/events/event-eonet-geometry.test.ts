/**
 * T2.7 EONET contract-fix regression test: live disaster detail must read
 * the real v3 `geometry` (singular) field. Before the fix, every live EONET
 * detail degraded to null coordinates (the old code read `geometries`).
 * Deterministic and offline-safe — the single-event fetch is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCache } from "@/server/cache";
import { GET as eventGET } from "@/app/api/v1/events/[eventId]/route";

const V3_EVENT = {
  id: "EONET_25094",
  title: "Hurricane Simon",
  description: null,
  link: "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_25094",
  closed: null,
  categories: [{ id: "severeStorms", title: "Severe Storms" }],
  sources: [{ id: "JTWC", url: "https://www.metoc.navy.mil/jtwc/products/ep2026.tcw" }],
  geometry: [
    { magnitudeValue: 35, magnitudeUnit: "kts", date: "2026-10-07T18:00:00Z", type: "Point", coordinates: [-101.3, 15.2] },
    { magnitudeValue: 60, magnitudeUnit: "kts", date: "2026-10-08T18:00:00Z", type: "Point", coordinates: [-103.7, 15.6] },
  ],
};

beforeEach(() => {
  getCache().clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  getCache().clear();
});

describe("EONET live detail v3 geometry (T2.7 contract fix)", () => {
  it("resolves real coordinates from the singular geometry array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (!url.includes("/events/EONET_25094")) throw new Error(`unexpected upstream ${url}`);
        return new Response(JSON.stringify(V3_EVENT), { status: 200 });
      }),
    );
    const res = await eventGET(new Request("http://localhost:3000/x"), {
      params: Promise.resolve({ eventId: "eonet-EONET_25094" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        lat: number | null;
        lon: number | null;
        timestamp: string | null;
        magnitude: number | null;
        data_status: { status: string };
      };
    };
    expect(body.success).toBe(true);
    // Latest geometry wins (real observed position, not null).
    expect(body.data.lat).toBe(15.6);
    expect(body.data.lon).toBe(-103.7);
    expect(body.data.timestamp).toBe("2026-10-08T18:00:00Z");
    expect(body.data.magnitude).toBe(60);
    expect(body.data.data_status.status).toBe("live");
  });
});
