/**
 * T2.2 bounded Open-Meteo concurrency + partial-failure semantics.
 * Deterministic and offline-safe: the forecast fetch is stubbed per test,
 * so no request can reach the network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getCache } from "@/server/cache";
import { generateWeatherGrid } from "@/server/providers/fallback";
import {
  BATCH_CONCURRENCY,
  getWeatherData,
  MAX_FETCH_POINTS,
} from "@/server/providers/open-meteo";
import { GET as layerDataGET } from "@/app/api/v1/layers/[layerId]/data/route";

const TEMP = { params: Promise.resolve({ layerId: "temperature" }) };
const TIME = "2026-03-01T00:00:00Z";

function pointCount(url: string): number {
  const lat = new URL(url).searchParams.get("latitude") ?? "";
  return lat === "" ? 0 : lat.split(",").length;
}

function forecastBatch(n: number, value: number) {
  return Array.from({ length: n }, () => ({
    current: { temperature_2m: value, time: TIME },
  }));
}

function stubForecast(
  impl: (url: string, callIndex: number) => Promise<Response>,
) {
  let calls = 0;
  const mock = vi.fn(async (url: string) => impl(url, (calls += 1)));
  vi.stubGlobal("fetch", mock);
  return { mock, calls: () => calls };
}

function liveBody(body: unknown) {
  return body as {
    data_status: { status: string; message: string | null; source: string };
    points: { id: string; value: number }[];
    warnings?: string[];
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  getCache().clear();
});

describe("bounded concurrency", () => {
  it("never exceeds BATCH_CONCURRENCY in flight and preserves order", async () => {
    let active = 0;
    let maxActive = 0;
    stubForecast(async (url) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 15));
      const body = forecastBatch(pointCount(url), 20);
      active -= 1;
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const out = liveBody(await getWeatherData("temperature", null, 500));
    expect(BATCH_CONCURRENCY).toBe(2);
    // 108-point global grid → 3 batches (50/50/8): the pool must engage
    // (exactly 2 in flight) without ever starting all three at once.
    expect(maxActive).toBe(2);
    expect(out.data_status.status).toBe("live");
    expect(out.points).toHaveLength(108);
    const grid = generateWeatherGrid(null).slice(0, MAX_FETCH_POINTS);
    expect(out.points.map((p) => p.id)).toEqual(
      grid.map((g) => `wx-${g.lat.toFixed(2)}-${g.lon.toFixed(2)}`),
    );
  });

  it("keeps the point cap and 50-point batches", async () => {
    const seen: number[] = [];
    stubForecast(async (url) => {
      seen.push(pointCount(url));
      return new Response(JSON.stringify(forecastBatch(pointCount(url), 20)), {
        status: 200,
      });
    });
    // Global grid is 108 points → batches of 50/50/8, never more than
    // MAX_FETCH_POINTS attempted.
    const out = liveBody(await getWeatherData("temperature", null, 500));
    expect(out.points).toHaveLength(108);
    expect(seen).toEqual([50, 50, 8]);
    expect(out.warnings?.join(" ")).toContain("bounded to 200 grid points");
  });

  it("truncates small limits to a single batch", async () => {
    let calls = 0;
    stubForecast(async (url) => {
      calls += 1;
      return new Response(JSON.stringify(forecastBatch(pointCount(url), 20)), {
        status: 200,
      });
    });
    const out = liveBody(await getWeatherData("temperature", null, 50));
    expect(out.points).toHaveLength(50);
    expect(calls).toBe(1);
  });
});

describe("partial failures", () => {
  it("keeps successful batches with an accurate coverage-gap message", async () => {
    stubForecast(async (url, callIndex) => {
      if (callIndex === 2) throw new Error("batch two down");
      return new Response(JSON.stringify(forecastBatch(pointCount(url), 20)), {
        status: 200,
      });
    });
    const out = liveBody(await getWeatherData("temperature", null, 500));
    expect(out.data_status.status).toBe("live");
    expect(out.data_status.source).toBe("Open-Meteo");
    // Second of three batches (50 points) fails → 58 live of 108 attempted.
    expect(out.points).toHaveLength(58);
    expect(out.data_status.message).toContain("50 of 108 grid points");
    expect(out.warnings?.join(" ")).toContain("50 grid points could not be fetched");
  });

  it("keeps the public LIVE cache policy on partial results at the route", async () => {
    stubForecast(async (url, callIndex) => {
      if (callIndex === 2) throw new Error("batch two down");
      return new Response(JSON.stringify(forecastBatch(pointCount(url), 20)), {
        status: 200,
      });
    });
    const res = await layerDataGET(
      new NextRequest("http://localhost:3000/api/v1/layers/temperature/data?limit=500"),
      TEMP,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=7200",
    );
    const body = (await res.json()) as {
      data: { data_status: { status: string; message: string | null } };
    };
    expect(body.data.data_status.status).toBe("live");
    expect(body.data.data_status.message).toContain("grid points");
  });

  it("falls back to simulated when every batch fails", async () => {
    stubForecast(async () => {
      throw new Error("all down");
    });
    const out = liveBody(await getWeatherData("temperature", null, 50));
    expect(out.data_status.status).toBe("simulated");
    expect(out.data_status.message).toContain("Open-Meteo unavailable");
  });

  it("skips valueless points instead of inventing zeros", async () => {
    stubForecast(async (url) => {
      const n = pointCount(url);
      const body = Array.from({ length: n }, (_, i) =>
        i % 2 === 0
          ? { current: { temperature_2m: 20, time: TIME } }
          : { current: { time: TIME } },
      );
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const out = liveBody(await getWeatherData("temperature", null, 500));
    // 108 attempted, every other point valueless → 54 live points, no zeros.
    expect(out.data_status.status).toBe("live");
    expect(out.points).toHaveLength(54);
    expect(out.points.every((p) => p.value === 20)).toBe(true);
    expect(out.data_status.message).toContain("54 of 108 grid points");
  });
});

describe("cancellation", () => {
  it("schedules no batches once the caller signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { mock } = stubForecast(async (url) => {
      return new Response(JSON.stringify(forecastBatch(pointCount(url), 20)), {
        status: 200,
      });
    });
    const out = liveBody(
      await getWeatherData("temperature", null, 50, null, null, {
        signal: controller.signal,
      }),
    );
    expect(mock).not.toHaveBeenCalled();
    expect(out.data_status.status).toBe("simulated");
  });
});
