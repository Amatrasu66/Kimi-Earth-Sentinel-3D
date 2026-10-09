/**
 * Central server configuration — port of backend/app/config.py.
 * All values are server-only (never NEXT_PUBLIC_). Read lazily from
 * process.env at call time so tests can override per-case.
 */

export const DEFAULTS = {
  USGS_API_URL: "https://earthquake.usgs.gov",
  NASA_EONET_URL: "https://eonet.gsfc.nasa.gov/api/v3",
  NASA_GIBS_URL: "https://gibs.earthdata.nasa.gov",
  OPEN_METEO_URL: "https://api.open-meteo.com/v1",
  AIRNOW_API_URL: "https://www.airnowapi.org/aq/observation",
  NASA_FIRMS_URL: "https://firms.modaps.eosdis.nasa.gov/api",
  REQUEST_TIMEOUT: 8,
  MAX_UPSTREAM_TIMEOUT_SEC: 30,
  CACHE_DEFAULT_TIMEOUT: 300,
} as const;

function envStr(name: string, fallback: string): string {
  const v = process.env[name];
  return v !== undefined && v !== "" ? v : fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

/**
 * T2.2 validated timeout (seconds). Malformed or non-positive values fall
 * back to the default; excessive values clamp to MAX_UPSTREAM_TIMEOUT_SEC
 * so no override can outrun the route maxDuration ceilings.
 */
function envTimeoutSec(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return fallback;
  return Math.min(n, DEFAULTS.MAX_UPSTREAM_TIMEOUT_SEC);
}

export const serverConfig = {
  get usgsApiUrl(): string {
    return envStr("USGS_API_URL", DEFAULTS.USGS_API_URL);
  },
  get nasaEonetUrl(): string {
    return envStr("NASA_EONET_URL", DEFAULTS.NASA_EONET_URL);
  },
  get nasaGibsUrl(): string {
    return envStr("NASA_GIBS_URL", DEFAULTS.NASA_GIBS_URL);
  },
  get openMeteoUrl(): string {
    return envStr("OPEN_METEO_URL", DEFAULTS.OPEN_METEO_URL);
  },
  get airnowApiUrl(): string {
    return envStr("AIRNOW_API_URL", DEFAULTS.AIRNOW_API_URL);
  },
  get nasaFirmsUrl(): string {
    return envStr("NASA_FIRMS_URL", DEFAULTS.NASA_FIRMS_URL);
  },
  get airnowApiKey(): string | null {
    return process.env.AIRNOW_API_KEY || null;
  },
  get nasaFirmsApiKey(): string | null {
    return process.env.NASA_FIRMS_API_KEY || null;
  },
  /** Outbound HTTP timeout in seconds (mirrors REQUEST_TIMEOUT, T2.2 default 8s). */
  get requestTimeoutSec(): number {
    return envTimeoutSec("REQUEST_TIMEOUT", DEFAULTS.REQUEST_TIMEOUT);
  },
  get requestTimeoutMs(): number {
    return this.requestTimeoutSec * 1000;
  },
  /** Per-provider overrides (seconds); each falls back to the global default. */
  get usgsTimeoutMs(): number {
    return envTimeoutSec("USGS_TIMEOUT", this.requestTimeoutSec) * 1000;
  },
  get nasaEonetTimeoutMs(): number {
    return envTimeoutSec("EONET_TIMEOUT", this.requestTimeoutSec) * 1000;
  },
  get openMeteoTimeoutMs(): number {
    return envTimeoutSec("OPEN_METEO_TIMEOUT", this.requestTimeoutSec) * 1000;
  },
  get airnowTimeoutMs(): number {
    return envTimeoutSec("AIRNOW_TIMEOUT", this.requestTimeoutSec) * 1000;
  },
  get nasaFirmsTimeoutMs(): number {
    return envTimeoutSec("FIRMS_TIMEOUT", this.requestTimeoutSec) * 1000;
  },
  get cacheDefaultTimeout(): number {
    return envInt("CACHE_DEFAULT_TIMEOUT", DEFAULTS.CACHE_DEFAULT_TIMEOUT);
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
};
