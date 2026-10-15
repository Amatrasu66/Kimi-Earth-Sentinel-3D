import { describe, expect, it } from 'vitest';
import { isAllowedLayer } from '@/server/providers/imagery';
import {
  CESIUM_BASE_URL,
  CESIUM_FLY_TO_DURATION_SECONDS,
  CESIUM_HOME_VIEW,
  DEFAULT_MAXIMUM_SCREEN_SPACE_ERROR,
  FULL_RESOLUTION_SCALE,
  GIBS_FORMAT,
  GIBS_LAYER_ID,
  GIBS_MAXIMUM_LEVEL,
  GIBS_STYLE,
  GIBS_TILE_MATRIX_SET_ID,
  GIBS_WMTS_URL,
  LOW_POWER_MAXIMUM_SCREEN_SPACE_ERROR,
  LOW_POWER_RESOLUTION_SCALE,
  buildGibsTimeDimension,
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
