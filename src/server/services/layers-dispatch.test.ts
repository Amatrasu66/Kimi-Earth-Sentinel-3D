import { afterEach, describe, expect, it, vi } from "vitest";
import { getLayerPayload } from "@/server/services/layers";

const USGS_FIXTURE = {
  features: [
    {
      id: "us7000test",
      properties: { mag: 6.5, place: "Off coast", time: 1700000000000, url: "https://x" },
      geometry: { coordinates: [-122.5, 37.5, 10] },
    },
  ],
};

function mockFetchJson(payload: unknown, status = 200) {
  return vi.fn(async () => ({
    status,
    text: async () => JSON.stringify(payload),
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lazy provider dispatch (services/layers)", () => {
  it("resolves earthquakes through the USGS adapter with live provenance", async () => {
    vi.stubGlobal("fetch", mockFetchJson(USGS_FIXTURE));
    // Unique limit keeps this clear of the shared in-memory cache.
    const { data, cacheHit } = await getLayerPayload("earthquakes", null, 7);
    expect(cacheHit).toBe(false);
    expect(data.data_status?.status).toBe("live");
    expect(data.count).toBe(1);
  });

  it("serves repeats from cache without refetching", async () => {
    const fetchMock = mockFetchJson(USGS_FIXTURE);
    vi.stubGlobal("fetch", fetchMock);
    await getLayerPayload("earthquakes", null, 11);
    const repeat = await getLayerPayload("earthquakes", null, 11);
    expect(repeat.cacheHit).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to labelled simulated data for layers without a provider", async () => {
    const fetchMock = mockFetchJson({});
    vi.stubGlobal("fetch", fetchMock);
    const { data } = await getLayerPayload("not-a-layer", null, 5);
    expect(data.data_status?.status).toBe("simulated");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
