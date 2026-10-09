/**
 * T2.9 API index + health corrections. Deterministic and offline-safe:
 * the index, layers metadata, and health payloads involve no provider
 * calls, so any network touch would fail the test instead of hanging it.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { GET as indexGET } from "@/app/api/v1/route";
import { GET as v1HealthGET } from "@/app/api/v1/health/route";
import { GET as rootHealthGET } from "@/app/api/health/route";
import { GET as layersGET } from "@/app/api/v1/layers/route";
import { GET as v1RestGET } from "@/app/api/v1/[...rest]/route";
import { SERVICE, VERSION, healthPayload } from "@/server/health";

afterEach(() => {
  vi.unstubAllGlobals();
});

function forbidNetwork() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network must not be touched");
    }),
  );
}

interface Envelope {
  success: boolean;
  data: Record<string, unknown>;
  meta?: { timestamp: string };
}

describe("GET /api/v1 index", () => {
  it("returns 200 in the standard { success, data, meta } envelope", async () => {
    forbidNetwork();
    const res = await indexGET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Envelope;
    expect(body.success).toBe(true);
    expect(body.data).toBeTypeOf("object");
    expect(body.meta?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("takes its version from the authoritative health VERSION source", async () => {
    const res = await indexGET();
    const body = (await res.json()) as Envelope;
    expect(body.data.version).toBe(VERSION);
    expect(body.data.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("links only to existing routes, and each link resolves", async () => {
    forbidNetwork();
    const res = await indexGET();
    const body = (await res.json()) as Envelope;
    const links = body.data.links as Record<string, string>;
    expect(links).toEqual({
      self: "/api/v1",
      layers: "/api/v1/layers",
      health: "/api/v1/health",
    });
    // Every link is a relative same-origin path (no Host-header games).
    for (const href of Object.values(links)) {
      expect(href.startsWith("/api/")).toBe(true);
    }
    // Each linked route resolves through its real handler.
    const self = await (await indexGET()).json();
    expect((self as Envelope).success).toBe(true);
    const layers = await (await layersGET()).json();
    expect((layers as Envelope).success).toBe(true);
    expect(Array.isArray((layers as { data: { layers: unknown[] } }).data.layers)).toBe(true);
    const health = await (await v1HealthGET()).json();
    expect((health as Envelope).success).toBe(true);
  });
});

describe("health metadata (T2.9 correction)", () => {
  it("exposes started_at and no misleading uptime_seconds on both health routes", async () => {
    forbidNetwork();
    for (const get of [rootHealthGET, v1HealthGET]) {
      const res = await get();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; data: Record<string, unknown> };
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("ok");
      expect(body.data.service).toBe(SERVICE);
      expect(body.data.version).toBe(VERSION);
      expect(body.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(body.data.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect("uptime_seconds" in body.data).toBe(false);
      // Instance-local start is at or before the response timestamp.
      expect(Date.parse(body.data.started_at as string)).toBeLessThanOrEqual(
        Date.parse(body.data.timestamp as string),
      );
    }
  });

  it("keeps the existing { success, data } health envelope shape", async () => {
    const payload = healthPayload();
    expect(Object.keys(payload).sort()).toEqual(
      ["service", "started_at", "status", "timestamp", "version"].sort(),
    );
  });

  it("still returns JSON NOT_FOUND for unknown /api/v1 paths", async () => {
    const res = await v1RestGET();
    expect(res.status).toBe(404);
    const body = (await res.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
