/**
 * Simulated heatmap grids — port of backend/app/services/heatmap.py.
 * Deterministic seeded grids, base64 little-endian float32, 2:1 equirectangular.
 */
import { createHash } from "node:crypto";
import { SIMULATED, UNAVAILABLE, utcnowIso, withStatus } from "../provenance";
import { mulberry32 } from "./fallback";

export const SOURCE = "Simulated grid";

export const UNIT_MAP: Record<string, string> = {
  temperature: "celsius",
  precipitation: "mm",
  air_quality: "AQI",
  clouds: "percent",
  wind: "km/h",
  wildfires: "brightness",
  earthquakes: "magnitude",
  disasters: "count",
};

export const BOUNDS_MAP: Record<string, [number, number]> = {
  temperature: [-40.5, 48.2],
  precipitation: [0.0, 80.0],
  air_quality: [0.0, 300.0],
  clouds: [0.0, 100.0],
  wind: [0.0, 120.0],
  wildfires: [300.0, 450.0],
  earthquakes: [2.5, 8.5],
  disasters: [0.0, 10.0],
};

export function seedFor(layerId: string, resolution: number, timeRange: string): number {
  const digest = createHash("sha256").update(`${layerId}:${resolution}:${timeRange}`).digest();
  return digest.readUInt32LE(0) ^ (digest.readUInt32LE(4) * 0x9e3779b1);
}

export function getSimulatedHeatmap(layerId: string, resolution = 128, timeRange = "24h") {
  const size = Math.floor((resolution * resolution) / 2);
  const rng = mulberry32(seedFor(layerId, resolution, timeRange));
  const grid = new Float32Array(size);
  for (let i = 0; i < size; i++) grid[i] = rng();
  // Serialize as little-endian float32 bytes → base64
  const bytes = Buffer.from(grid.buffer, grid.byteOffset, grid.byteLength);
  const [minValue, maxValue] = BOUNDS_MAP[layerId] ?? [0.0, 1.0];
  const payload = {
    layer_id: layerId,
    resolution,
    grid: bytes.toString("base64"),
    min_value: minValue,
    max_value: maxValue,
    unit: UNIT_MAP[layerId] ?? "value",
    timestamp: utcnowIso(),
  };
  return withStatus(
    payload,
    SIMULATED,
    SOURCE,
    "Simulated heatmap grid for development — not measured environmental data.",
  );
}

export function getHeatmap(layerId: string, resolution = 128, timeRange = "24h") {
  // No real gridded dataset is wired up yet (HEATMAP_PROVIDERS was always {}).
  if (!(layerId in BOUNDS_MAP)) {
    const payload = {
      layer_id: layerId,
      resolution,
      grid: "",
      min_value: 0.0,
      max_value: 0.0,
      unit: "value",
      timestamp: utcnowIso(),
    };
    return withStatus(payload, UNAVAILABLE, SOURCE, `No heatmap available for layer ${JSON.stringify(layerId)}.`);
  }
  return getSimulatedHeatmap(layerId, resolution, timeRange);
}
