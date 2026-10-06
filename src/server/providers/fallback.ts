/**
 * Deterministic seeded PRNG + mock data — port of backend/app/services/fallback.py.
 *
 * KNOWN LIMITATION: Python uses Mersenne Twister (random.seed(42)); this port
 * uses mulberry32 seeded from the same integer seeds. Mock payloads keep the
 * identical shape/counts/regions/severity rules and stay deterministic, but
 * individual pseudo-random values differ from the Flask backend.
 */
import { utcnowIso } from "../provenance";

/** mulberry32 — small deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → uint32 (for per-event-id seeds). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randomHex(rng: () => number, len: number): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(rng() * 16)];
  return out;
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function weightedPick<T>(rng: () => number, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

const fmtTs = (d: Date) => utcnowIso(d);

// ---------------------------------------------------------------------------
// Earthquakes
// ---------------------------------------------------------------------------

const SEISMIC_REGIONS = [
  { name: "Japan Trench", lat: [35, 42] as const, lon: [140, 150] as const },
  { name: "San Andreas", lat: [32, 38] as const, lon: [-122, -115] as const },
  { name: "Chile Trench", lat: [-45, -18] as const, lon: [-80, -68] as const },
  { name: "Indonesia", lat: [-8, 8] as const, lon: [95, 140] as const },
  { name: "Philippines", lat: [5, 20] as const, lon: [120, 135] as const },
  { name: "New Zealand", lat: [-45, -35] as const, lon: [165, 180] as const },
  { name: "Aleutian", lat: [50, 55] as const, lon: [-180, -150] as const },
  { name: "Peru-Chile", lat: [-20, -5] as const, lon: [-80, -65] as const },
  { name: "Mediterranean", lat: [35, 42] as const, lon: [12, 30] as const },
  { name: "Himalaya", lat: [27, 36] as const, lon: [70, 90] as const },
  { name: "Iceland", lat: [63, 67] as const, lon: [-25, -13] as const },
  { name: "Turkey", lat: [36, 42] as const, lon: [26, 45] as const },
  { name: "Mexico", lat: [15, 25] as const, lon: [-105, -95] as const },
  { name: "Alaska", lat: [55, 65] as const, lon: [-165, -140] as const },
  { name: "Tonga", lat: [-25, -15] as const, lon: [-180, -173] as const },
];

export function severityForMagnitude(mag: number): string {
  if (mag >= 7) return "critical";
  if (mag >= 6) return "high";
  if (mag >= 4.5) return "moderate";
  return "low";
}

export function generateMockEarthquakes(_bbox?: string | null, limit = 500) {
  const rng = mulberry32(42);
  const points: Record<string, unknown>[] = [];
  const severityCounts: Record<string, number> = { low: 0, moderate: 0, high: 0, critical: 0 };
  let maxMag = 0;
  const now = Date.now();
  const n = Math.min(limit, 500);
  for (let i = 0; i < n; i++) {
    const region = pick(rng, SEISMIC_REGIONS);
    const lat = region.lat[0] + rng() * (region.lat[1] - region.lat[0]);
    const lon = region.lon[0] + rng() * (region.lon[1] - region.lon[0]);
    const r = rng();
    let mag: number;
    if (r < 0.7) mag = 2.5 + rng() * 1.5;
    else if (r < 0.9) mag = 4.0 + rng() * 1.5;
    else if (r < 0.97) mag = 5.5 + rng() * 1.5;
    else mag = 7.0 + rng() * 1.5;
    if (mag > maxMag) maxMag = mag;
    const severity = severityForMagnitude(mag);
    severityCounts[severity] += 1;
    const ts = new Date(now - rng() * 720 * 3600 * 1000);
    points.push({
      id: `usgs-${randomHex(rng, 8)}`,
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
      magnitude: Math.round(mag * 10) / 10,
      depth: Math.round((5 + rng() * 695) * 10) / 10,
      severity,
      timestamp: fmtTs(ts),
      location: `${10 + Math.floor(rng() * 191)}km ${pick(rng, ["N", "S", "E", "W"] as const)} of ${region.name}`,
      url: "",
    });
  }
  points.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const dayAgo = now - 24 * 3600 * 1000;
  return {
    layer_id: "earthquakes",
    count: points.length,
    points,
    stats: {
      total_24h: points.filter((p) => Date.parse(String(p.timestamp)) >= dayAgo).length,
      max_magnitude: Math.round(maxMag * 10) / 10,
      by_severity: severityCounts,
    },
  };
}

// ---------------------------------------------------------------------------
// Disasters
// ---------------------------------------------------------------------------

export function generateMockDisasters(_bbox?: string | null, limit = 500) {
  const rng = mulberry32(42);
  const types = [
    ["flood", "Severe Flooding", 0.25],
    ["wildfire", "Wildfire", 0.2],
    ["storm", "Severe Storm", 0.2],
    ["drought", "Drought", 0.15],
    ["landslide", "Landslide", 0.1],
    ["volcano", "Volcanic Activity", 0.05],
    ["cyclone", "Tropical Cyclone", 0.05],
  ] as const;
  const regions = [
    { name: "Southeast Asia", lat: [5, 20] as const, lon: [95, 140] as const },
    { name: "East Africa", lat: [-10, 10] as const, lon: [30, 50] as const },
    { name: "Central America", lat: [8, 20] as const, lon: [-105, -75] as const },
    { name: "Mediterranean", lat: [35, 45] as const, lon: [-10, 35] as const },
    { name: "South Asia", lat: [8, 30] as const, lon: [70, 90] as const },
    { name: "Australia", lat: [-35, -15] as const, lon: [115, 150] as const },
    { name: "West Africa", lat: [0, 20] as const, lon: [-20, 20] as const },
    { name: "Amazon", lat: [-10, 5] as const, lon: [-75, -50] as const },
    { name: "Caribbean", lat: [10, 25] as const, lon: [-85, -60] as const },
    { name: "Pacific Islands", lat: [-20, 20] as const, lon: [-140, 140] as const },
  ];
  const points: Record<string, unknown>[] = [];
  const now = Date.now();
  const n = Math.min(limit, 200);
  for (let i = 0; i < n; i++) {
    const [dtype, label] = weightedPick(
      rng,
      types,
      types.map((t) => t[2] as number),
    ) as readonly [string, string, number];
    const region = pick(rng, regions);
    const lat = region.lat[0] + rng() * (region.lat[1] - region.lat[0]);
    const lon = region.lon[0] + rng() * (region.lon[1] - region.lon[0]);
    const severity = weightedPick(rng, ["low", "moderate", "high", "critical"] as const, [0.4, 0.35, 0.2, 0.05]);
    const ts = new Date(now - rng() * 60 * 24 * 3600 * 1000);
    points.push({
      id: `eonet-${randomHex(rng, 8)}`,
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
      type: dtype,
      severity,
      title: `${label} - ${region.name}`,
      timestamp: fmtTs(ts),
      description: `${label} event reported in ${region.name}. Monitoring ongoing.`,
      sources: ["GDACS", "NASA EONET"],
      categories: [dtype, "natural_disaster"],
    });
  }
  points.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return { layer_id: "disasters", count: points.length, points };
}

// ---------------------------------------------------------------------------
// Wildfire / weather / AQI mocks (live here to avoid provider import cycles;
// provider modules import these from fallback.ts)
// ---------------------------------------------------------------------------

export function severityForBrightness(bright: number): string {
  if (bright > 400) return "critical";
  if (bright > 350) return "high";
  if (bright > 320) return "moderate";
  return "low";
}

export function meetsMinSeverity(severity: string, minSeverity?: string | null): boolean {
  const order = ["low", "moderate", "high", "critical"];
  if (!minSeverity) return true;
  if (!order.includes(minSeverity) || !order.includes(severity)) return true;
  return order.indexOf(severity) >= order.indexOf(minSeverity);
}

export function bboxContains(bbox: string | null | undefined, lat: number, lon: number): boolean {
  if (!bbox) return true;
  try {
    const parts = bbox.split(",").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [min_lon, min_lat, max_lon, max_lat] = parts;
    return lat >= min_lat && lat <= max_lat && lon >= min_lon && lon <= max_lon;
  } catch {
    return true;
  }
}

const FIRE_REGIONS = [
  { lat: 64.8378, lon: -147.7164, name: "Alaska" },
  { lat: 37.7749, lon: -122.4194, name: "California" },
  { lat: -33.8688, lon: 150.2093, name: "Australia" },
  { lat: -15.7975, lon: -47.8919, name: "Brazil" },
  { lat: 1.3521, lon: 103.8198, name: "Indonesia" },
  { lat: 46.8625, lon: 103.8467, name: "Mongolia" },
  { lat: 60.472, lon: 8.4689, name: "Norway" },
  { lat: 51.2538, lon: -85.3232, name: "Canada" },
  { lat: -1.2921, lon: 36.8219, name: "Kenya" },
  { lat: 20.5937, lon: 78.9629, name: "India" },
];

export function generateMockFires(bbox?: string | null, limit = 500, minSeverity?: string | null) {
  const rng = mulberry32(42);
  const points: Record<string, unknown>[] = [];
  for (const region of FIRE_REGIONS) {
    const perRegion = 3 + Math.floor(rng() * 13);
    for (let i = 0; i < perRegion; i++) {
      const lat = region.lat + (rng() * 10 - 5);
      const lon = region.lon + (rng() * 10 - 5);
      const bright = 300 + rng() * 150;
      const severity = severityForBrightness(bright);
      if (!meetsMinSeverity(severity, minSeverity)) continue;
      if (!bboxContains(bbox, lat, lon)) continue;
      points.push({
        id: `fire-${lat.toFixed(4)}-${lon.toFixed(4)}`,
        lat,
        lon,
        value: Math.round(bright * 10) / 10,
        severity,
        timestamp: fmtTs(new Date()),
        location: region.name,
        unit: "brightness",
      });
    }
  }
  const trimmed = points.slice(0, limit);
  return { layer_id: "wildfires", count: trimmed.length, points: trimmed, unit: "brightness" };
}

export function severityForMetric(metric: string, val: number): string {
  if (metric === "temperature") {
    if (val > 40 || val < -20) return "high";
    if (val > 35 || val < -10) return "moderate";
  } else if (metric === "precipitation") {
    if (val > 50) return "high";
    if (val > 20) return "moderate";
  } else if (metric === "cloudcover") {
    if (val > 80) return "high";
    if (val > 50) return "moderate";
  } else if (metric === "wind") {
    if (val > 100) return "high";
    if (val > 60) return "moderate";
  }
  return "low";
}

export function unitForMetric(metric: string): string {
  const units: Record<string, string> = {
    temperature: "celsius",
    precipitation: "mm",
    cloudcover: "percent",
    wind: "km/h",
  };
  return units[metric] ?? "value";
}

export function generateWeatherGrid(bbox?: string | null): { lat: number; lon: number }[] {
  const points: { lat: number; lon: number }[] = [];
  let lons: number[];
  let lats: number[];
  if (bbox) {
    const parts = bbox.split(",").map(Number);
    lons = Array.from({ length: 10 }, (_, i) => parts[0] + (i * (parts[2] - parts[0])) / 10);
    lats = Array.from({ length: 10 }, (_, i) => parts[1] + (i * (parts[3] - parts[1])) / 10);
  } else {
    lons = Array.from({ length: 12 }, (_, i) => -180 + i * 30);
    lats = Array.from({ length: 9 }, (_, i) => -60 + i * 15);
  }
  for (const lon of lons) for (const lat of lats) points.push({ lat, lon });
  return points;
}

export function generateMockWeather(
  metric: string,
  bbox?: string | null,
  limit = 500,
  layerId?: string | null,
  minSeverity?: string | null,
) {
  const points: Record<string, unknown>[] = [];
  const grid = generateWeatherGrid(bbox);
  const rng = mulberry32(42);
  for (const pt of grid) {
    if (points.length >= limit) break;
    let val: number;
    if (metric === "temperature") val = -30 + rng() * 75;
    else if (metric === "precipitation") val = rng() * 80;
    else if (metric === "wind") val = rng() * 120;
    else val = rng() * 100;
    const severity = severityForMetric(metric, val);
    if (!meetsMinSeverity(severity, minSeverity)) continue;
    points.push({
      id: `wx-${pt.lat.toFixed(2)}-${pt.lon.toFixed(2)}`,
      lat: pt.lat,
      lon: pt.lon,
      value: Math.round(val * 10) / 10,
      severity,
      timestamp: fmtTs(new Date()),
      unit: unitForMetric(metric),
    });
  }
  return { layer_id: layerId ?? metric, count: points.length, points, unit: unitForMetric(metric) };
}

const AQI_CITIES = [
  { name: "Beijing", lat: 39.9042, lon: 116.4074, aqi: 165 },
  { name: "Delhi", lat: 28.6139, lon: 77.209, aqi: 189 },
  { name: "Lagos", lat: 6.5244, lon: 3.3792, aqi: 142 },
  { name: "Sao Paulo", lat: -23.5505, lon: -46.6333, aqi: 78 },
  { name: "Mexico City", lat: 19.4326, lon: -99.1332, aqi: 134 },
  { name: "Los Angeles", lat: 34.0522, lon: -118.2437, aqi: 95 },
  { name: "London", lat: 51.5074, lon: -0.1278, aqi: 45 },
  { name: "Tokyo", lat: 35.6762, lon: 139.6503, aqi: 52 },
  { name: "Jakarta", lat: -6.2088, lon: 106.8456, aqi: 156 },
  { name: "Cairo", lat: 30.0444, lon: 31.2357, aqi: 178 },
  { name: "Mumbai", lat: 19.076, lon: 72.8777, aqi: 167 },
  { name: "Bangkok", lat: 13.7563, lon: 100.5018, aqi: 112 },
  { name: "Seoul", lat: 37.5665, lon: 126.978, aqi: 88 },
  { name: "Paris", lat: 48.8566, lon: 2.3522, aqi: 38 },
  { name: "New York", lat: 40.7128, lon: -74.006, aqi: 42 },
  { name: "Sydney", lat: -33.8688, lon: 151.2093, aqi: 28 },
  { name: "Moscow", lat: 55.7558, lon: 37.6173, aqi: 72 },
  { name: "Istanbul", lat: 41.0082, lon: 28.9784, aqi: 98 },
  { name: "Dubai", lat: 25.2048, lon: 55.2708, aqi: 125 },
  { name: "Singapore", lat: 1.3521, lon: 103.8198, aqi: 55 },
];

export function severityForAqi(aqi: number): string {
  if (aqi > 300) return "critical";
  if (aqi > 200) return "high";
  if (aqi > 150) return "moderate";
  return "low";
}

export function generateMockAqi(bbox?: string | null, limit = 500, minSeverity?: string | null) {
  void bbox; // global city list mirrors Python (bbox rejected at route)
  const rng = mulberry32(42);
  const points: Record<string, unknown>[] = [];
  for (const city of AQI_CITIES) {
    if (points.length >= limit) break;
    const aqi = Math.max(0, Math.min(500, city.aqi + Math.floor(rng() * 41) - 20));
    const severity = severityForAqi(aqi);
    if (!meetsMinSeverity(severity, minSeverity)) continue;
    points.push({
      id: `aqi-${city.lat}-${city.lon}`,
      lat: city.lat,
      lon: city.lon,
      value: aqi,
      severity,
      timestamp: fmtTs(new Date()),
      location: city.name,
      parameter: "PM2.5",
    });
  }
  return { layer_id: "air_quality", count: points.length, points, unit: "AQI" };
}

// ---------------------------------------------------------------------------
// Generic dispatcher
// ---------------------------------------------------------------------------

export function generateMockLayerData(
  layerId: string,
  bbox?: string | null,
  limit = 500,
  minSeverity?: string | null,
) {
  if (layerId === "earthquakes") return generateMockEarthquakes(bbox, limit);
  if (layerId === "disasters") return generateMockDisasters(bbox, limit);
  if (layerId === "wildfires") return generateMockFires(bbox, limit, minSeverity);
  if (layerId === "temperature" || layerId === "precipitation" || layerId === "clouds" || layerId === "wind") {
    const metric = layerId === "clouds" ? "cloudcover" : layerId;
    return generateMockWeather(metric, bbox, limit, layerId, minSeverity);
  }
  if (layerId === "air_quality") return generateMockAqi(bbox, limit, minSeverity);
  return { layer_id: layerId, count: 0, points: [], message: "No data available for this layer" };
}

// ---------------------------------------------------------------------------
// Event detail mock
// ---------------------------------------------------------------------------

export function getMockEventDetail(eventId: string): Record<string, unknown> {
  const rng = mulberry32(hashString(eventId) % 10000);
  const hoursAgo = (h: number) => fmtTs(new Date(Date.now() - h * 3600 * 1000));
  if (eventId.startsWith("usgs") || eventId.toLowerCase().includes("eq")) {
    const mag = Math.round((3.0 + rng() * 5.2) * 10) / 10;
    const severity = mag >= 7 ? "critical" : mag >= 6 ? "high" : mag >= 4.5 ? "moderate" : "low";
    const depth = Math.round((5 + rng() * 295) * 10) / 10;
    return {
      id: eventId,
      layer_id: "earthquakes",
      type: "earthquake",
      title: `M${mag} Earthquake`,
      lat: Math.round((-60 + rng() * 130) * 10000) / 10000,
      lon: Math.round((-180 + rng() * 360) * 10000) / 10000,
      magnitude: mag,
      depth,
      timestamp: hoursAgo(1 + rng() * 71),
      description: `Earthquake of magnitude ${mag} detected at a depth of ${depth.toFixed(0)}km. Shaking was felt across a wide area.`,
      severity,
      source: { name: "USGS", url: `https://earthquake.usgs.gov/earthquakes/eventpage/${eventId}` },
      impact: {
        population_exposed: (100000 + Math.floor(rng() * 49900000)).toLocaleString("en-US"),
        mmi_max: 3 + Math.floor(rng() * 7),
        alert_level: pick(rng, ["green", "yellow", "orange", "red"] as const),
      },
      related_events: [
        {
          id: `${eventId}-aftershock-1`,
          title: `M${Math.round((mag - 1.5) * 10) / 10} Aftershock`,
          timestamp: hoursAgo(0.5 + rng() * 23.5),
        },
      ],
      geometry: {
        type: "Point",
        coordinates: [
          Math.round((-180 + rng() * 360) * 10000) / 10000,
          Math.round((-60 + rng() * 130) * 10000) / 10000,
          Math.round((5 + rng() * 295) * 10) / 10,
        ],
      },
    };
  }
  const disasterTypes = ["flood", "wildfire", "storm", "drought", "landslide", "volcano"];
  const eventType = pick(rng, disasterTypes);
  const severity = pick(rng, ["low", "moderate", "high", "critical"] as const);
  const descriptions: Record<string, string> = {
    flood: "Severe flooding has affected the region, causing widespread damage to infrastructure and displacing local residents.",
    wildfire: "Active wildfire burning with significant smoke production. Evacuation orders may be in effect for nearby communities.",
    storm: "Severe storm system with heavy rainfall, strong winds, and potential for hail and tornado activity.",
    drought: "Extended period of below-normal precipitation leading to water shortages and agricultural impacts.",
    landslide: "Ground failure event triggered by heavy rainfall or seismic activity. Roads and structures may be affected.",
    volcano: "Volcanic unrest detected with elevated seismicity and potential for eruption.",
  };
  return {
    id: eventId,
    layer_id: "disasters",
    type: eventType,
    title: `${eventType.charAt(0).toUpperCase() + eventType.slice(1)} Event`,
    lat: Math.round((-60 + rng() * 130) * 10000) / 10000,
    lon: Math.round((-180 + rng() * 360) * 10000) / 10000,
    timestamp: hoursAgo(1 + rng() * 167),
    description: descriptions[eventType] ?? "Natural disaster event detected.",
    severity,
    source: { name: "NASA EONET", url: `https://eonet.gsfc.nasa.gov/api/v3/events/${eventId}` },
    impact: {
      affected_area: `${(10 + Math.floor(rng() * 4991)).toLocaleString("en-US")} km²`,
      population_affected: `${(1000 + Math.floor(rng() * 999001)).toLocaleString("en-US")}`,
    },
    related_events: [],
    geometry: {
      type: "Point",
      coordinates: [
        Math.round((-180 + rng() * 360) * 10000) / 10000,
        Math.round((-60 + rng() * 130) * 10000) / 10000,
        0,
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Search / stats / historical / reverse geocode
// ---------------------------------------------------------------------------

const MAJOR_CITIES = [
  { name: "Tokyo", country: "Japan", lat: 35.6762, lon: 139.6503, pop: 37400000 },
  { name: "Delhi", country: "India", lat: 28.6139, lon: 77.209, pop: 32900000 },
  { name: "Shanghai", country: "China", lat: 31.2304, lon: 121.4737, pop: 28500000 },
  { name: "Sao Paulo", country: "Brazil", lat: -23.5505, lon: -46.6333, pop: 22400000 },
  { name: "Mexico City", country: "Mexico", lat: 19.4326, lon: -99.1332, pop: 22200000 },
  { name: "Cairo", country: "Egypt", lat: 30.0444, lon: 31.2357, pop: 21300000 },
  { name: "Mumbai", country: "India", lat: 19.076, lon: 72.8777, pop: 21200000 },
  { name: "Beijing", country: "China", lat: 39.9042, lon: 116.4074, pop: 21000000 },
  { name: "Dhaka", country: "Bangladesh", lat: 23.8103, lon: 90.4125, pop: 21000000 },
  { name: "Osaka", country: "Japan", lat: 34.6937, lon: 135.5023, pop: 19000000 },
  { name: "New York", country: "USA", lat: 40.7128, lon: -74.006, pop: 18800000 },
  { name: "Karachi", country: "Pakistan", lat: 24.8607, lon: 67.0011, pop: 17200000 },
  { name: "Buenos Aires", country: "Argentina", lat: -34.6037, lon: -58.3816, pop: 16200000 },
  { name: "Istanbul", country: "Turkey", lat: 41.0082, lon: 28.9784, pop: 15600000 },
  { name: "Kolkata", country: "India", lat: 22.5726, lon: 88.3639, pop: 15100000 },
  { name: "Manila", country: "Philippines", lat: 14.5995, lon: 120.9842, pop: 14400000 },
  { name: "Lagos", country: "Nigeria", lat: 6.5244, lon: 3.3792, pop: 14300000 },
  { name: "Rio de Janeiro", country: "Brazil", lat: -22.9068, lon: -43.1729, pop: 13500000 },
  { name: "Los Angeles", country: "USA", lat: 34.0522, lon: -118.2437, pop: 12400000 },
  { name: "Moscow", country: "Russia", lat: 55.7558, lon: 37.6173, pop: 12500000 },
];

export function searchMockData(query: string, searchType = "all", limit = 20) {
  const q = query.toLowerCase();
  const results: Record<string, unknown>[] = [];
  for (const city of MAJOR_CITIES) {
    if (city.name.toLowerCase().includes(q) || city.country.toLowerCase().includes(q)) {
      results.push({
        id: `loc-${city.lat}-${city.lon}`,
        type: "location",
        name: city.name,
        country: city.country,
        lat: city.lat,
        lon: city.lon,
        population: city.pop,
        snippet: `${city.name}, ${city.country} - Population: ${city.pop.toLocaleString("en-US")}`,
      });
    }
  }
  if (searchType === "all" || searchType === "event") {
    const now = Date.now();
    if (q.includes("quake") || q.includes("earth") || q.includes("seismic")) {
      results.push({
        id: "usgs-12345",
        type: "event",
        layer: "earthquakes",
        name: "M5.2 Earthquake",
        lat: 35.6762,
        lon: 139.6503,
        timestamp: fmtTs(new Date(now - 12 * 3600 * 1000)),
        snippet: "35km ESE of Tokyo, depth 45km",
      });
    }
    if (q.includes("fire") || q.includes("wild")) {
      results.push({
        id: "fire-001",
        type: "event",
        layer: "wildfires",
        name: "Wildfire - California",
        lat: 37.7749,
        lon: -122.4194,
        timestamp: fmtTs(new Date(now - 48 * 3600 * 1000)),
        snippet: "Active fire, 5,000 acres burned",
      });
    }
    if (q.includes("flood")) {
      results.push({
        id: "flood-001",
        type: "event",
        layer: "disasters",
        name: "Severe Flooding",
        lat: -6.2088,
        lon: 106.8456,
        timestamp: fmtTs(new Date(now - 72 * 3600 * 1000)),
        snippet: "Jakarta region, 50,000 affected",
      });
    }
  }
  return results.slice(0, limit);
}

export function getMockStats() {
  const rng = Math.random;
  const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  const rf = (a: number, b: number) => Math.round((a + rng() * (b - a)) * 10) / 10;
  const pickLive = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
  return {
    global: {
      active_events: ri(30, 80),
      earthquakes_24h: ri(80, 200),
      avg_temperature_anomaly: rf(-0.5, 2.5),
      precipitation_status: pickLive(["above_average", "below_average", "normal"] as const),
      air_quality_avg: ri(40, 120),
      wildfire_count: ri(10, 50),
      severe_weather_alerts: ri(5, 30),
    },
    by_region: {
      asia: { events: ri(10, 30), severity_index: rf(2, 8), top_threat: pickLive(["earthquake", "flood", "cyclone"] as const) },
      europe: { events: ri(3, 15), severity_index: rf(1, 5), top_threat: pickLive(["flood", "heatwave", "storm"] as const) },
      north_america: { events: ri(5, 25), severity_index: rf(2, 7), top_threat: pickLive(["wildfire", "hurricane", "tornado"] as const) },
      south_america: { events: ri(2, 10), severity_index: rf(1, 4), top_threat: pickLive(["landslide", "flood", "drought"] as const) },
      africa: { events: ri(2, 12), severity_index: rf(1, 5), top_threat: pickLive(["drought", "flood", "cyclone"] as const) },
      oceania: { events: ri(1, 8), severity_index: rf(1, 4), top_threat: pickLive(["cyclone", "bushfire", "earthquake"] as const) },
    },
    timestamp: fmtTs(new Date()),
  };
}

export function getMockHistoricalData(metric: string, period: string, aggregation: string) {
  const rng = mulberry32(42);
  const days = { "7d": 7, "30d": 30, "1y": 365 }[period] ?? 30;
  const values: Record<string, unknown>[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const date = new Date(now.getTime() - (days - i - 1) * 24 * 3600 * 1000);
    const ds = date.toISOString().slice(0, 10);
    if (metric === "earthquakes") {
      values.push({
        date: ds,
        count: 80 + Math.floor(rng() * 121),
        avg_magnitude: Math.round((2.5 + rng() * 1.5) * 10) / 10,
        max_magnitude: Math.round((4.0 + rng() * 3.5) * 10) / 10,
      });
    } else if (metric === "temperature") {
      const anomaly = Math.round((-1.5 + rng() * 4.0) * 10) / 10;
      values.push({ date: ds, anomaly, global_avg: Math.round((14.0 + anomaly) * 10) / 10 });
    } else {
      values.push({ date: ds, count: 5 + Math.floor(rng() * 46) });
    }
  }
  return { metric, period, aggregation, values };
}

export function reverseGeocodeMock(lat: number, lon: number) {
  const regions = [
    { name: "North America", lat: [15, 75] as const, lon: [-170, -50] as const },
    { name: "South America", lat: [-60, 15] as const, lon: [-90, -30] as const },
    { name: "Europe", lat: [35, 75] as const, lon: [-15, 45] as const },
    { name: "Africa", lat: [-40, 40] as const, lon: [-20, 55] as const },
    { name: "Asia", lat: [5, 80] as const, lon: [45, 180] as const },
    { name: "Oceania", lat: [-50, 0] as const, lon: [110, 180] as const },
  ];
  let regionName = "Unknown Region";
  for (const r of regions) {
    if (lat >= r.lat[0] && lat <= r.lat[1] && lon >= r.lon[0] && lon <= r.lon[1]) {
      regionName = r.name;
      break;
    }
  }
  return {
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
    name: `Location (${lat.toFixed(2)}, ${lon.toFixed(2)})`,
    country: "Unknown",
    country_code: "XX",
    region: regionName,
    timezone: "UTC",
  };
}
