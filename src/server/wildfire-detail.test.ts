/**
 * T2.3 wildfire detail from real FIRMS observations. Deterministic and
 * offline-safe: the FIRMS area-CSV fetch is stubbed with a small recorded
 * fixture (sanitized — CSV carries no credentials), so no test can reach
 * the network. A NASA_FIRMS_API_KEY stub env unlocks the live path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCache } from "@/server/cache";
import { withStatus } from "@/server/provenance";
import {
  eventCacheKey,
  firmsAcqTimestamp,
  getEventDetail,
} from "@/server/services/event-detail";
import {
  findFirmsObservation,
  parseFireEventId,
} from "@/server/providers/nasa-firms";
import { GET as eventGET } from "@/app/api/v1/events/[eventId]/route";

// Recorded VIIRS NRT fixture (coordinates/values realistic, key material
// absent — the real feed never embeds credentials in rows).
const FIRMS_CSV = [
  "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight",
  "34.1,-118.2,410.5,1.2,1.0,2026-10-08,1230,NOAA-20,VIIRS,h,1NRT,330.1,12.4,D",
  "35.0,-119.0,300.0,1.0,1.0,2026-10-08,1230,NOAA-20,VIIRS,l,1NRT,290.0,2.1,N",
  "36.5,-120.5,380.0,1.1,0.9,2026-10-08,1245,Terra,MODIS,n,2NRT,,,D",
  "34.1,-118.2,420.0,1.3,1.1,2026-10-08,1315,NOAA-20,VIIRS,h,1NRT,335.0,15.0,D",
].join("\n");

const FIRE_ID = "fire-34.1--118.2";

function csvResponse(text: string, status = 200): Promise<Response> {
  return Promise.resolve(new Response(text, { status }));
}

function eventParams(eventId: string) {
  return { params: Promise.resolve({ eventId }) };
}

function detailBody(body: unknown) {
  return body as {
    success: boolean;
    data: Record<string, unknown> & {
      data_status: { status: string; source: string | null; message: string | null };
    };
    meta: { cache_hit: boolean };
  };
}

beforeEach(() => {
  getCache().clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  getCache().clear();
});

describe("parseFireEventId (marker identity)", () => {
  it("parses fire-<lat>-<lon> including negative coordinates", () => {
    expect(parseFireEventId("fire-34.1--118.2")).toEqual({ lat: 34.1, lon: -118.2 });
    expect(parseFireEventId("fire--47.9-36.8")).toEqual({ lat: -47.9, lon: 36.8 });
    expect(parseFireEventId("fire-10-20")).toEqual({ lat: 10, lon: 20 });
  });

  it("rejects malformed fire ids", () => {
    for (const bad of ["fire-abc", "fire-12", "fire-999-999", "fire-10-20-30", "fire-", "eonet-1"]) {
      expect(parseFireEventId(bad), bad).toBeNull();
    }
  });
});

describe("firmsAcqTimestamp", () => {
  it("combines acq_date + HHMM into ISO UTC", () => {
    expect(firmsAcqTimestamp("2026-10-08", "1230")).toBe("2026-10-08T12:30:00Z");
    expect(firmsAcqTimestamp("2026-10-08", "5")).toBe("2026-10-08T00:05:00Z");
  });

  it("returns null for malformed acquisition fields", () => {
    expect(firmsAcqTimestamp("", "1230")).toBeNull();
    expect(firmsAcqTimestamp("2026-10-08", "")).toBeNull();
    expect(firmsAcqTimestamp("2026-10-08", "9999")).toBeNull();
    expect(firmsAcqTimestamp("08/10/2026", "1230")).toBeNull();
  });
});

describe("findFirmsObservation", () => {
  it("parses a valid observation with real fields", () => {
    const obs = findFirmsObservation(FIRMS_CSV, 35, -119);
    expect(obs).toMatchObject({
      lat: 35,
      lon: -119,
      bright: 300,
      acqDate: "2026-10-08",
      acqTime: "1230",
      satellite: "NOAA-20",
      instrument: "VIIRS",
      confidence: "l",
      frp: 2.1,
      daynight: "N",
    });
  });

  it("prefers the latest acquisition on duplicate coordinates", () => {
    const obs = findFirmsObservation(FIRMS_CSV, 34.1, -118.2);
    expect(obs?.acqTime).toBe("1315");
    expect(obs?.bright).toBe(420);
    expect(obs?.frp).toBe(15);
  });

  it("returns null when nothing matches", () => {
    expect(findFirmsObservation(FIRMS_CSV, 0, 0)).toBeNull();
    expect(findFirmsObservation("latitude,longitude", 0, 0)).toBeNull();
  });
});

describe("live wildfire detail (route)", () => {
  function withKey() {
    vi.stubEnv("NASA_FIRMS_API_KEY", "T23-TEST-KEY");
    vi.stubGlobal("fetch", vi.fn(async () => csvResponse(FIRMS_CSV)));
  }

  it("returns real observation fields with live NASA FIRMS provenance", async () => {
    withKey();
    const res = await eventGET(new Request("http://localhost:3000/x"), eventParams(FIRE_ID));
    expect(res.status).toBe(200);
    const body = detailBody(await res.json());
    expect(body.success).toBe(true);
    // Identity: the detail answers the requested marker.
    expect(body.data.id).toBe(FIRE_ID);
    expect(body.data.layer_id).toBe("wildfires");
    // Provenance: genuinely live, genuinely FIRMS.
    expect(body.data.data_status.status).toBe("live");
    expect(body.data.data_status.source).toBe("NASA FIRMS");
    // Real observation fields (latest acquisition wins).
    expect(body.data).toMatchObject({
      satellite: "NOAA-20",
      instrument: "VIIRS",
      brightness: 420,
      frp: 15,
      confidence: "h",
      daynight: "D",
      acq_date: "2026-10-08",
      acq_time: "1315",
      lat: 34.1,
      lon: -118.2,
      timestamp: "2026-10-08T13:15:00Z",
    });
    expect(typeof body.data.description).toBe("string");
  });

  it("represents absent optional fields honestly (null, still live)", async () => {
    withKey();
    // Row (36.5,-120.5) has empty bright_ti5/frp cells.
    const res = await eventGET(
      new Request("http://localhost:3000/x"),
      eventParams("fire-36.5--120.5"),
    );
    expect(res.status).toBe(200);
    const body = detailBody(await res.json());
    expect(body.data.data_status.status).toBe("live");
    expect(body.data.frp).toBeNull();
    expect(body.data.brightness).toBe(380);
    expect(body.data.instrument).toBe("MODIS");
  });

  it("caches live detail publicly, simulated privately", async () => {
    withKey();
    const first = await eventGET(new Request("http://localhost:3000/x"), eventParams(FIRE_ID));
    expect(first.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    const second = await eventGET(new Request("http://localhost:3000/x"), eventParams(FIRE_ID));
    expect(detailBody(await second.json()).meta.cache_hit).toBe(true);
    // Keyless instance: simulated path stays no-store.
    vi.unstubAllEnvs();
    getCache().clear();
    const sim = await eventGET(new Request("http://localhost:3000/x"), eventParams(FIRE_ID));
    expect(sim.headers.get("Cache-Control")).toBe("no-store");
    expect(detailBody(await sim.json()).data.data_status.status).toBe("simulated");
  });

  it("never produces false live details on provider failure", async () => {
    vi.stubEnv("NASA_FIRMS_API_KEY", "T23-TEST-KEY");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("upstream down");
      }),
    );
    const res = await eventGET(new Request("http://localhost:3000/x"), eventParams(FIRE_ID));
    expect(res.status).toBe(200);
    const body = detailBody(await res.json());
    expect(body.data.data_status.status).toBe("simulated");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("re-serves expired live detail as stale (never silently live)", async () => {
    vi.stubEnv("NASA_FIRMS_API_KEY", "T23-TEST-KEY");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("upstream down");
      }),
    );
    const live = withStatus(
      { id: FIRE_ID, layer_id: "wildfires" },
      "live",
      "NASA FIRMS",
      undefined,
      "2026-01-01T00:00:00Z",
    );
    getCache().set(eventCacheKey("firms", FIRE_ID), [live, "2026-01-01T00:00:00Z"], -1);
    const res = await eventGET(new Request("http://localhost:3000/x"), eventParams(FIRE_ID));
    const body = detailBody(await res.json());
    expect(body.data.data_status.status).toBe("stale");
    expect(body.meta.cache_hit).toBe(true);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects malformed fire ids with 400 before any provider call", async () => {
    const fetchMock = vi.fn(async () => csvResponse(FIRMS_CSV));
    vi.stubGlobal("fetch", fetchMock);
    for (const bad of ["fire-abc", "fire-12", "fire-999-999", "fire-10-20-30"]) {
      const res = await eventGET(new Request("http://localhost:3000/x"), eventParams(bad));
      expect(res.status, bad).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps timeout errors from leaking the configured key", async () => {
    vi.stubEnv("NASA_FIRMS_API_KEY", "T23SECRETKEY");
    vi.stubEnv("REQUEST_TIMEOUT", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const res = await eventGET(new Request("http://localhost:3000/x"), eventParams(FIRE_ID));
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("T23SECRETKEY");
    expect(detailBody(JSON.parse(text)).data.data_status.status).toBe("simulated");
  }, 15000);

  it("leaves non-wildfire detail behavior unchanged (live USGS stays live)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        csvResponse(
          JSON.stringify({
            id: "t23usgs01",
            properties: {
              mag: 5.5,
              place: "Test Basin",
              time: 1700000000000,
              url: "https://example.invalid/detail",
            },
            geometry: { type: "Point", coordinates: [-122.5, 37.5, 10] },
          }),
        ),
      ),
    );
    const res = await eventGET(
      new Request("http://localhost:3000/x"),
      eventParams("t23usgs01"),
    );
    expect(res.status).toBe(200);
    const body = detailBody(await res.json());
    expect(body.data.id).toBe("t23usgs01");
    expect(body.data.data_status.status).toBe("live");
    expect(body.data.data_status.source).toBe("USGS");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
  });

  it("resolves detail through the service with the requested identity", async () => {
    withKey();
    const { data } = await getEventDetail(FIRE_ID);
    const rec = data as Record<string, unknown>;
    expect(rec.id).toBe(FIRE_ID);
    expect((rec.data_status as { status: string }).status).toBe("live");
  });
});
