import { describe, expect, it } from 'vitest';
import { isAllowedLayer } from '@/server/providers/imagery';
import {
  CESIUM_BASE_URL,
  CESIUM_FLY_TO_DURATION_SECONDS,
  CESIUM_GLOBE_BASE_COLOR,
  CESIUM_GRID_CELLS,
  CESIUM_GRID_GLOW_COLOR,
  CESIUM_GRID_LINE_ALPHA,
  CESIUM_GRID_LINE_COLOR,
  CESIUM_HOME_VIEW,
  CESIUM_SCENE_BACKGROUND_COLOR,
  DEFAULT_MAXIMUM_SCREEN_SPACE_ERROR,
  FULL_MSAA_SAMPLES,
  FULL_RESOLUTION_SCALE,
  GIBS_FORMAT,
  GIBS_LAYER_ID,
  GIBS_MAXIMUM_LEVEL,
  GIBS_PROVIDER_DESCRIPTOR,
  GIBS_STYLE,
  GIBS_TILE_MATRIX_SET_ID,
  GIBS_WMTS_URL,
  GLOBE_ENABLE_LIGHTING,
  LOW_POWER_MAXIMUM_SCREEN_SPACE_ERROR,
  LOW_POWER_MSAA_SAMPLES,
  LOW_POWER_RESOLUTION_SCALE,
  buildGibsTimeDimension,
  resolveFlyToView,
} from './cesiumConfig';

describe('Cesium PoC configuration (Phase 2)', () => {
  it('serves static assets from the copied package path', () => {
    expect(CESIUM_BASE_URL).toBe('/cesium');
  });

  it('pins the default imagery to an allow-listed GIBS layer', () => {
    expect(isAllowedLayer(GIBS_LAYER_ID)).toBe(true);
  });

  it('uses the verified quadtree-compatible WMTS endpoint', () => {
    expect(GIBS_WMTS_URL).toBe(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi',
    );
    expect(GIBS_STYLE).toBe('default');
    expect(GIBS_FORMAT).toBe('image/jpeg');
    expect(GIBS_TILE_MATRIX_SET_ID).toBe('GoogleMapsCompatible_Level9');
    expect(GIBS_MAXIMUM_LEVEL).toBe(9);
  });

  it('defines a whole-Earth home view', () => {
    expect(CESIUM_HOME_VIEW.longitudeDegrees).toBe(0);
    expect(CESIUM_HOME_VIEW.latitudeDegrees).toBe(20);
    expect(CESIUM_HOME_VIEW.heightMeters).toBeGreaterThan(15_000_000);
    expect(CESIUM_FLY_TO_DURATION_SECONDS).toBe(1.4);
  });

  it('maps low-power mode to documented Cesium options only', () => {
    expect(FULL_RESOLUTION_SCALE).toBe(1);
    expect(LOW_POWER_RESOLUTION_SCALE).toBeLessThan(1);
    expect(DEFAULT_MAXIMUM_SCREEN_SPACE_ERROR).toBe(2);
    expect(LOW_POWER_MAXIMUM_SCREEN_SPACE_ERROR).toBeGreaterThan(
      DEFAULT_MAXIMUM_SCREEN_SPACE_ERROR,
    );
  });

  it('builds a valid TIME dimension for today by default', () => {
    const { Time } = buildGibsTimeDimension(new Date('2026-10-15T12:00:00Z'));
    expect(Time).toBe('2026-10-15');
  });

  it('falls back to today instead of emitting an invalid TIME', () => {
    const { Time } = buildGibsTimeDimension(new Date(NaN));
    expect(Time).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Cesium scientific configuration (Phase 3)', () => {
  it('keeps the imagery descriptor consistent with the verified constants', () => {
    expect(GIBS_PROVIDER_DESCRIPTOR.productId).toBe(GIBS_LAYER_ID);
    // Descriptor discipline: the documented product stays allow-listed.
    expect(isAllowedLayer(GIBS_PROVIDER_DESCRIPTOR.productId)).toBe(true);
    expect(GIBS_PROVIDER_DESCRIPTOR.endpoint).toBe(GIBS_WMTS_URL);
    expect(GIBS_PROVIDER_DESCRIPTOR.tileMatrixSet).toBe(GIBS_TILE_MATRIX_SET_ID);
    expect(GIBS_PROVIDER_DESCRIPTOR.style).toBe(GIBS_STYLE);
    expect(GIBS_PROVIDER_DESCRIPTOR.format).toBe(GIBS_FORMAT);
    expect(GIBS_PROVIDER_DESCRIPTOR.attribution).toMatch(/GIBS/);
    expect(GIBS_PROVIDER_DESCRIPTOR.authentication).toBe('none');
    expect(GIBS_PROVIDER_DESCRIPTOR.timeDimension.name).toBe('Time');
    // Temporal meaning must state the daily-composite, not-real-time truth.
    expect(GIBS_PROVIDER_DESCRIPTOR.timeDimension.meaning).toMatch(/daily composite/i);
    expect(GIBS_PROVIDER_DESCRIPTOR.timeDimension.meaning).toMatch(/not real-time/i);
    expect(GIBS_PROVIDER_DESCRIPTOR.supportedZoomRange).toContain('0–9');
    // Fallback policy: recoverable, allow-listed provider only.
    expect(GIBS_PROVIDER_DESCRIPTOR.fallback).toMatch(/allow-listed/);
  });

  it('pins the visual baseline: uniform lighting, theme-matched colors', () => {
    // No day/night terminator — legibility first, no implied real-time sun.
    expect(GLOBE_ENABLE_LIGHTING).toBe(false);
    expect(CESIUM_SCENE_BACKGROUND_COLOR).toBe('#020202');
    // Neutral slate for not-yet-streamed imagery, never the default navy.
    expect(CESIUM_GLOBE_BASE_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('pins a restrained graticule (default-off is owned by the preference hook)', () => {
    expect(CESIUM_GRID_CELLS).toBeGreaterThan(0);
    expect(CESIUM_GRID_LINE_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(CESIUM_GRID_LINE_ALPHA).toBeGreaterThan(0);
    expect(CESIUM_GRID_LINE_ALPHA).toBeLessThanOrEqual(0.25);
    // Transparent hex = glow pass visually disabled (lines stay thin).
    expect(CESIUM_GRID_GLOW_COLOR).toBe('#00000000');
  });

  it('disables MSAA only in low power', () => {
    expect(FULL_MSAA_SAMPLES).toBe(4);
    expect(LOW_POWER_MSAA_SAMPLES).toBe(1);
    expect(LOW_POWER_MSAA_SAMPLES).toBeLessThan(FULL_MSAA_SAMPLES);
  });
});

describe('resolveFlyToView (Phase 3)', () => {
  // Reference destinations across hemispheres, latitudes, and the prime
  // meridian — the fly-to plan must preserve the app's lat/lon convention.
  const REFERENCE_DESTINATIONS = [
    { name: 'Greenwich (prime meridian)', lat: 51.4779, lon: -0.0015 },
    { name: 'Sydney (southern, eastern)', lat: -33.8688, lon: 151.2093 },
    { name: 'Quito (equator, western)', lat: -0.1807, lon: -78.4678 },
    { name: 'Reykjavík (high northern, western)', lat: 64.1466, lon: -21.9426 },
  ];

  it('resolves reference destinations onto their exact coordinates', () => {
    for (const dest of REFERENCE_DESTINATIONS) {
      const plan = resolveFlyToView({
        target: dest,
        currentHeightMeters: 5_000_000,
        reducedMotion: false,
      });
      expect(plan, dest.name).not.toBeNull();
      expect(plan?.latitudeDegrees, dest.name).toBe(dest.lat);
      expect(plan?.longitudeDegrees, dest.name).toBe(dest.lon);
      expect(plan?.heightMeters, dest.name).toBe(5_000_000);
      expect(plan?.animate, dest.name).toBe(true);
      expect(plan?.durationSeconds, dest.name).toBe(CESIUM_FLY_TO_DURATION_SECONDS);
    }
  });

  it('jumps immediately instead of animating under reduced motion', () => {
    const plan = resolveFlyToView({
      target: { lat: 0, lon: 0 },
      currentHeightMeters: 1_000,
      reducedMotion: true,
    });
    expect(plan?.animate).toBe(false);
    expect(plan?.durationSeconds).toBe(0);
    expect(plan?.heightMeters).toBe(1_000);
  });

  it('rejects invalid or missing targets', () => {
    expect(
      resolveFlyToView({ target: null, currentHeightMeters: 1, reducedMotion: false }),
    ).toBeNull();
    expect(
      resolveFlyToView({ target: { lat: 500, lon: 0 }, currentHeightMeters: 1, reducedMotion: false }),
    ).toBeNull();
    expect(
      resolveFlyToView({ target: { lat: 0, lon: 181 }, currentHeightMeters: 1, reducedMotion: false }),
    ).toBeNull();
    expect(
      resolveFlyToView({ target: { lat: NaN, lon: 0 }, currentHeightMeters: 1, reducedMotion: false }),
    ).toBeNull();
  });

  it('falls back to the home-view height when the altitude is unusable', () => {
    const plan = resolveFlyToView({
      target: { lat: 10, lon: 20 },
      currentHeightMeters: NaN,
      reducedMotion: false,
    });
    expect(plan?.heightMeters).toBe(CESIUM_HOME_VIEW.heightMeters);
  });
});
