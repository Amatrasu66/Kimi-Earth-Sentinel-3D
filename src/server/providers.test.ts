import { describe, expect, it } from "vitest";
import { normalizeUsgs } from "@/server/providers/usgs";
import { normalizeEonet } from "@/server/providers/nasa-eonet";
import { normalizeFirmsCsv, parseCsvRows } from "@/server/providers/nasa-firms";
import { normalizeAirnow } from "@/server/providers/airnow";
import { getHeatmap, getSimulatedHeatmap } from "@/server/providers/heatmap";
import {
  buildTileUrl,
  GIBS_LAYERS,
  isAllowedLayer,
  isValidTile,
} from "@/server/providers/imagery";
import { getTimezoneInfo } from "@/server/providers/geocode";
import { resolveProvider } from "@/server/services/event-detail";

describe("USGS normalization", () => {
  const sample = {
    features: [
      {
        id: "us7000abcd",
        properties: { mag: 6.5, place: "Off coast", time: 1700000000000, url: "https://x" },
        geometry: { coordinates: [-122.5, 37.5, 10] },
      },
      {
        id: "bad-nomag",
        properties: { mag: null },
        geometry: { coordinates: [0, 0] },
      },
      {
        id: "bad-coords",
        properties: { mag: 5, time: 0 },
        geometry: { coordinates: [999, 999] },
      },
    ],
  };
  it("keeps valid points, skips null-mag and out-of-range", () => {
    const out = normalizeUsgs(sample, 500) as { count: number; points: { severity: string }[] };
    expect(out.count).toBe(1);
    expect(out.points[0].severity).toBe("high");
  });
  it("throws on malformed shape", () => {
    expect(() => normalizeUsgs({ nope: true }, 10)).toThrow();
  });
});

describe("EONET normalization", () => {
  const sample = {
    events: [
      {
        id: "123",
        title: "Wildfire",
        categories: [{ id: "wildfires", title: "Wildfires" }],
        geometries: [{ date: "2026-01-01T00:00:00Z", coordinates: [10, 20] }],
        sources: [{ id: "EO" }],
      },
      { id: "nogeom", title: "X", categories: [], geometries: [] },
    ],
  };
  it("normalizes with moderate severity for wildfires", () => {
    const out = normalizeEonet(sample, 500, null) as { count: number };
    expect(out.count).toBe(1);
  });
  it("applies min_severity filter", () => {
    const out = normalizeEonet(sample, 500, "critical") as { count: number };
    expect(out.count).toBe(0);
  });
});

describe("FIRMS CSV parsing", () => {
  it("parses quoted fields with embedded commas", () => {
    const csv = `latitude,longitude,bright_ti4,note\n"34.1","-118.2","410.5","a, b"\n35.0,-119.0,300.0,plain`;
    const rows = parseCsvRows(csv);
    expect(rows[1]).toEqual(["34.1", "-118.2", "410.5", "a, b"]);
    const out = normalizeFirmsCsv(csv, 10) as { count: number };
    expect(out.count).toBe(2);
  });
  it("skips malformed rows and filters by severity/bbox", () => {
    const csv = `latitude,longitude,bright_ti4\nbad,row\n35.0,-119.0,500.0\n0.0,0.0,300.0`;
    const out = normalizeFirmsCsv(csv, 10, "-125,30,-115,40", "high") as { count: number };
    expect(out.count).toBe(1); // only the bright CA point
  });
});

describe("AirNow normalization", () => {
  it("maps AQI to severity and rejects malformed shape", () => {
    const out = normalizeAirnow(
      [{ Latitude: 40, Longitude: -100, AQI: 250, ReportingArea: "Test", ParameterName: "O3" }],
      10,
    );
    expect(out.points[0]).toMatchObject({ severity: "high" });
    expect(out.unit).toBe("AQI");
    expect(() => normalizeAirnow({ nope: 1 }, 10)).toThrow();
  });
});

describe("heatmap", () => {
  it("is deterministic per (layer, resolution, time_range)", () => {
    const a = getSimulatedHeatmap("temperature", 8, "24h");
    const b = getSimulatedHeatmap("temperature", 8, "24h");
    expect(a.grid).toBe(b.grid);
    expect(a.data_status.status).toBe("simulated");
    // 8*8/2 = 32 float32 = 128 bytes
    expect(Buffer.from(a.grid, "base64").length).toBe(128);
  });
  it("returns UNAVAILABLE for unknown layers", () => {
    const out = getHeatmap("nope", 8, "24h");
    expect(out.data_status.status).toBe("unavailable");
    expect(out.grid).toBe("");
  });
});

describe("imagery", () => {
  it("enforces allow-list and tile bounds", () => {
    expect(isAllowedLayer("MODIS_Terra_CorrectedReflectance_TrueColor")).toBe(true);
    expect(isAllowedLayer("evil")).toBe(false);
    expect(isValidTile(GIBS_LAYERS[0].id, 0, 5, 0)).toBe(false); // x >= 2^0
    expect(isValidTile(GIBS_LAYERS[0].id, 1, 1, 0)).toBe(true);
    const url = buildTileUrl("https://gibs.earthdata.nasa.gov", GIBS_LAYERS[0].id, 2, 1, 1, "2026-01-01");
    expect(url).toContain("/2/1/1.jpeg"); // y before x per WMTS template used by backend
  });
});

describe("timezone + event routing", () => {
  it("approximates NYC as UTC-05:00", () => {
    const tz = getTimezoneInfo(40.7, -74);
    expect(tz.timezone).toBe("America/New_York");
    expect(tz.offset).toBe("UTC-05:00");
    expect(tz.approximate).toBe(true);
  });
  it("routes ids to providers", () => {
    expect(resolveProvider("eonet-123")).toBe("eonet");
    expect(resolveProvider("fire-1-2")).toBeNull();
    expect(resolveProvider("usgs-abc")).toBeNull();
    expect(resolveProvider("us7000abcd")).toBe("usgs");
    expect(resolveProvider("wx-1-2")).toBeNull();
  });
});
