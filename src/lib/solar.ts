/**
 * Real-time solar position (T2.4) — pure, independently testable astronomy.
 *
 * Computes the Earth's approximate subsolar point for a supplied UTC `Date`
 * and converts it to the exact `sunDirection` vector representation consumed
 * by both globe renderers (WebGPU/TSL `WebGPUEarth` and WebGL/R3F `Globe`).
 *
 * Algorithm — low-precision solar ephemeris (truncated VSOP-style series in
 * the lineage of Meeus "Astronomical Algorithms", ch. 25, low-accuracy
 * variant; same family as the NOAA solar-calculator equations):
 *
 *   1. Julian Day from the UTC millisecond timestamp
 *      (`JD = ms/86400000 + 2440587.5`), then days since J2000 `n = JD - 2451545`.
 *   2. Mean longitude `L = 280.460 + 0.9856474·n` and mean anomaly
 *      `g = 357.528 + 0.9856003·n` (degrees, wrapped to [0, 360)).
 *   3. Apparent ecliptic longitude
 *      `λ = L + 1.915·sin(g) + 0.020·sin(2g)` — the two periodic terms are
 *      the equation-of-center correction, which is what keeps solstice/
 *      equinox declination (and hence subsolar latitude) honest instead of
 *      a naive "latitude = 0 at every equinox" sine wave.
 *   4. Obliquity `ε = 23.439 − 0.0000004·n`.
 *   5. Declination `δ = asin(sin ε · sin λ)` → subsolar latitude.
 *   6. Right ascension `α = atan2(cos ε · sin λ, cos λ)` plus Greenwich Mean
 *      Sidereal Time `GMST = 280.46061837 + 360.98564736629·n`, giving the
 *      subsolar longitude as `lon = wrap180(α − GMST)`. Deriving longitude
 *      from the hour angle (rather than assuming solar noon at 12:00 UTC)
 *      embeds the equation of time, so longitude is correct to the same
 *      order as the ephemeris instead of being off by up to ~±4° (±16 min).
 *
 * Accuracy: validated against the independent NOAA solar-calculator series
 * (day-angle γ formulation — a different derivation, see `solar.test.ts`)
 * at the 2026 equinox/solstice reference instants: worst observed deviation
 * ≈ 0.25° (March-equinox declination, where δ changes fastest), everything
 * else ≤ 0.2°. Comfortably inside the PRD's ≈ 1° night-side terminator
 * budget, with ~4× margin. Residual error sources (documented, not fixed):
 * nutation/aberration (< 0.01°), neglected ΔT / leap-second distinction
 * between UTC and terrestrial time (< 0.02°), and the truncated periodic
 * terms above (dominant term, still < 0.5° year-round).
 *
 * UTC assumptions: the input `Date` is read with `getTime()` (an absolute
 * UTC instant) — local timezones never enter. Leap years / month boundaries
 * need no special-casing: the Julian-Day path is continuous across them.
 *
 * Coordinate convention: the returned `sunDirection` is a world-space vector
 * pointing FROM Earth's centre TOWARD the subsolar point, using the exact
 * projection in `@/lib/geo` `latLonToVec3`:
 * `φ = (90 − lat)°, θ = (lon + 180)°`,
 * `x = −r·sinφ·cosθ, y = r·cosφ, z = r·sinφ·sinθ`.
 * (Equator/prime-meridian → +X, north pole → +Y.) Both renderers consume this
 * convention identically: WebGPU feeds it to the TSL day/night `dot()` and
 * the directional light position; WebGL feeds it to its directional light
 * position. No React, browser API, timer, network, or renderer state here.
 */

/** Subsolar point in decimal degrees. Longitude is normalized to [-180, 180]. */
export interface SubsolarPoint {
  /** Geodetic latitude of the subsolar point, degrees, [-90, 90]. */
  latitude: number;
  /** Geographic longitude of the subsolar point, degrees, [-180, 180]. */
  longitude: number;
}

/** World-space sun direction `[x, y, z]` — the `sunDirection` prop shape. */
export type SunDirection = [number, number, number];

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Wrap degrees into [0, 360). */
function wrap360(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Wrap degrees into [-180, 180]. */
function wrap180(degrees: number): number {
  const wrapped = wrap360(degrees);
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/**
 * Approximate subsolar point for a UTC instant.
 *
 * Pure: no React, no DOM, no timers, no network. Throws `TypeError` for an
 * invalid (NaN-time or non-Date) input so bad clocks fail loudly at the
 * single call site instead of silently parking the terminator at 0/0.
 */
export function getSubsolarPoint(date: Date): SubsolarPoint {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new TypeError('getSubsolarPoint: expected a valid Date (finite UTC time).');
  }
  // Absolute UTC instant — timezone-independent by construction.
  const julianDay = date.getTime() / 86_400_000 + 2_440_587.5;
  const n = julianDay - 2_451_545.0;

  const meanLongitude = wrap360(280.46 + 0.9856474 * n);
  const meanAnomaly = wrap360(357.528 + 0.9856003 * n) * DEG_TO_RAD;
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) *
    DEG_TO_RAD;
  const obliquity = (23.439 - 0.0000004 * n) * DEG_TO_RAD;

  const latitude =
    Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude)) * RAD_TO_DEG;
  const rightAscension = wrap360(
    Math.atan2(
      Math.cos(obliquity) * Math.sin(eclipticLongitude),
      Math.cos(eclipticLongitude),
    ) * RAD_TO_DEG,
  );
  const gmst = wrap360(280.46061837 + 360.98564736629 * n);
  const longitude = wrap180(rightAscension - gmst);

  return { latitude, longitude };
}

/**
 * Convert a subsolar point to the renderers' world-space `sunDirection`.
 *
 * Bit-for-bit the same projection as `latLonToVec3` in `@/lib/geo`
 * (kept dependency-free here so this module stays importable anywhere,
 * including non-three contexts). `radius` scales the magnitude only —
 * both renderers normalize, so the default 1 is what the app passes.
 */
export function subsolarPointToSunDirection(
  point: SubsolarPoint,
  radius = 1,
): SunDirection {
  const phi = ((90 - point.latitude) * Math.PI) / 180;
  const theta = ((point.longitude + 180) * Math.PI) / 180;
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

/**
 * One-step convenience: UTC instant → authoritative `sunDirection` tuple.
 * This is the single calculation both renderer paths must share — call it
 * once per tick and pass the identical tuple to WebGPU and WebGL.
 */
export function getSunDirection(date: Date, radius = 1): SunDirection {
  return subsolarPointToSunDirection(getSubsolarPoint(date), radius);
}
