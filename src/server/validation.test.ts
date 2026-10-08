import { describe, expect, it } from "vitest";
import {
  MAX_QUERY_LENGTH,
  checkSupportedParams,
  isValidCoordinate,
  parseBbox,
  parseLatLon,
  parseLimit,
  parseResolution,
  parseSearchQuery,
  parseSeverity,
  parseTimeRange,
} from "@/server/validation";

describe("parseLimit", () => {
  it("defaults to 500", () => {
    expect(parseLimit(null)).toEqual({ value: 500, error: null });
    expect(parseLimit("")).toEqual({ value: 500, error: null });
  });
  it("rejects non-integers and out-of-range", () => {
    expect(parseLimit("abc").error).toMatch(/Invalid limit/);
    expect(parseLimit("0").error).toMatch(/between 1/);
    expect(parseLimit("2001").error).toMatch(/between 1/);
    expect(parseLimit("1.5").error).toMatch(/integer/);
  });
  it("supports custom default/maximum (search uses 20/100)", () => {
    expect(parseLimit("20", 20, 100)).toEqual({ value: 20, error: null });
    expect(parseLimit("500", 20, 100).error).toMatch(/between 1 and 100/);
  });
});

describe("parseBbox", () => {
  it("parses a valid bbox", () => {
    expect(parseBbox("-10,-20,10,20")).toEqual({
      value: { min_lon: -10, min_lat: -20, max_lon: 10, max_lat: 20 },
      error: null,
    });
  });
  it("rejects malformed input", () => {
    expect(parseBbox("1,2,3").error).toMatch(/minLon/);
    expect(parseBbox("a,b,c,d").error).toMatch(/numbers/);
    expect(parseBbox("-10,-100,10,20").error).toMatch(/latitudes/);
    expect(parseBbox("-200,-20,10,20").error).toMatch(/longitudes/);
    expect(parseBbox("10,0,5,20").error).toMatch(/minLon < maxLon/);
  });
});

describe("checkSupportedParams", () => {
  it("rejects bbox for air_quality with UNSUPPORTED_PARAM semantics", () => {
    expect(checkSupportedParams("air_quality", "-10,-20,10,20")).toMatch(/does not support/);
    expect(checkSupportedParams("earthquakes", "-10,-20,10,20")).toBeNull();
    expect(checkSupportedParams("air_quality", null)).toBeNull();
  });
});

describe("parseSeverity / parseResolution / parseTimeRange", () => {
  it("validates severity", () => {
    expect(parseSeverity("HIGH")).toEqual({ value: "high", error: null });
    expect(parseSeverity("nope").error).toMatch(/min_severity/);
  });
  it("validates resolution", () => {
    expect(parseResolution("9999").error).toMatch(/between 1 and 512/);
    expect(parseResolution(null)).toEqual({ value: 128, error: null });
  });
  it("validates time_range", () => {
    expect(parseTimeRange("1y").error).toMatch(/time_range/);
    expect(parseTimeRange(null)).toEqual({ value: "24h", error: null });
  });
});

describe("parseLatLon / isValidCoordinate", () => {
  it("requires both values", () => {
    expect(parseLatLon(null, "1").error).toMatch(/required/);
    expect(parseLatLon("a", "1").error).toMatch(/numbers/);
    expect(parseLatLon("100", "1").error).toMatch(/within/);
    expect(parseLatLon("10", "20")).toEqual({ value: [10, 20], error: null });
  });
  it("rejects booleans, NaN, Infinity", () => {
    expect(isValidCoordinate(true, 0)).toBe(false);
    expect(isValidCoordinate(NaN, 0)).toBe(false);
    expect(isValidCoordinate(Infinity, 0)).toBe(false);
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(45, -122)).toBe(true);
  });
});

describe("T1.5 strict integers (limits, resolution)", () => {
  it("accepts plain decimal counts, tolerates padding whitespace", () => {
    expect(parseLimit("50")).toEqual({ value: 50, error: null });
    expect(parseLimit("  50  ")).toEqual({ value: 50, error: null });
    expect(parseResolution("256")).toEqual({ value: 256, error: null });
  });
  it("rejects hex, scientific, float, signed, and non-finite spellings", () => {
    for (const bad of ["0x10", "0o17", "1e3", "5.0", "+50", "-5", "Infinity", "NaN"]) {
      expect(parseLimit(bad).error, bad).toMatch(/Invalid limit/);
      expect(parseResolution(bad).error, bad).toMatch(/Invalid resolution/);
    }
  });
  it("keeps range enforcement", () => {
    expect(parseLimit("0").error).toMatch(/between 1/);
    expect(parseLimit("2001").error).toMatch(/between 1/);
    expect(parseResolution("513").error).toMatch(/between 1 and 512/);
  });
});

describe("T1.5 bbox empty parts", () => {
  it("rejects empty components instead of coercing to 0", () => {
    expect(parseBbox("10,,30,40").error).toMatch(/non-empty/);
    expect(parseBbox("-10,-20,10,20")).toEqual({
      value: { min_lon: -10, min_lat: -20, max_lon: 10, max_lat: 20 },
      error: null,
    });
  });
});

describe("parseSearchQuery (T1.5, cap retained at 200)", () => {
  it("trims surrounding whitespace, keeps Unicode names", () => {
    expect(parseSearchQuery("  Tokyo  ")).toEqual({ value: "Tokyo", error: null });
    expect(parseSearchQuery("São Paulo")).toEqual({ value: "São Paulo", error: null });
    expect(parseSearchQuery("北京")).toEqual({ value: "北京", error: null });
    expect(parseSearchQuery(null)).toEqual({ value: "", error: null });
  });
  it("enforces the retained 200-character cap", () => {
    expect(MAX_QUERY_LENGTH).toBe(200);
    expect(parseSearchQuery("x".repeat(200))).toEqual({ value: "x".repeat(200), error: null });
    expect(parseSearchQuery("x".repeat(201)).error).toMatch(/at most 200/);
  });
  it("rejects control characters", () => {
    expect(parseSearchQuery("tokyo\nDROP").error).toMatch(/control characters/);
    expect(parseSearchQuery("a\x00b").error).toMatch(/control characters/);
    expect(parseSearchQuery("a\x7fb").error).toMatch(/control characters/);
    expect(parseSearchQuery("o'clock").value).toBe("o'clock");
  });
});
