import { describe, expect, it, vi } from 'vitest';
import { isAllowedLayer } from '@/server/providers/imagery';
import {
  GIBS_CREDIT_TEXT,
  GIBS_FORMAT,
  GIBS_LAYER_ID,
  GIBS_MAXIMUM_LEVEL,
  GIBS_STYLE,
  GIBS_TILE_MATRIX_SET_ID,
  GIBS_WMTS_URL,
  CESIUM_GRID_CELLS,
} from './cesiumConfig';
import {
  createBaseImageryProvider,
  createGraticuleProvider,
  isSupportedOverlayLayerId,
  UnsupportedImageryLayerError,
} from './cesiumImageryProviders';
import type { CesiumRuntimeSurface } from './cesiumImageryProviders';

function fakeRuntime(): CesiumRuntimeSurface & {
  wmtsOptions: Array<Record<string, unknown>>;
  gridOptions: Array<Record<string, unknown>>;
} {
  const wmtsOptions: Array<Record<string, unknown>> = [];
  const gridOptions: Array<Record<string, unknown>> = [];
  // The mocks cover only the surface the factory touches; the cast keeps
  // the seam honest (production passes the real namespace, which satisfies
  // the full static side verified by `typecheck` on the factory itself).
  const runtime = {
    WebMapTileServiceImageryProvider: vi.fn(function (
      this: unknown,
      options: Record<string, unknown>,
    ) {
      wmtsOptions.push(options);
      return {
        errorEvent: { addEventListener: vi.fn(() => () => {}) },
      };
    }),
    GridImageryProvider: vi.fn(function (this: unknown, options: Record<string, unknown>) {
      gridOptions.push(options);
      return {};
    }),
    Credit: vi.fn(function (this: unknown) {
      return {};
    }),
    Color: {
      fromCssColorString: vi.fn((css: string) => ({
        css,
        withAlpha: (alpha: number) => ({ css, alpha }),
      })),
      TRANSPARENT: { css: 'transparent' },
    },
  };
  return { ...(runtime as unknown as CesiumRuntimeSurface), wmtsOptions, gridOptions };
}

describe('imagery provider factory (Phase 4)', () => {
  it('builds the verified GIBS configuration for the supported base', () => {
    const cesium = fakeRuntime();
    const provider = createBaseImageryProvider(
      cesium,
      'gibs-modis-truecolor',
      new Date('2026-10-15T12:00:00Z'),
    );
    expect(provider).toBeDefined();
    expect(cesium.wmtsOptions).toHaveLength(1);
    const options = cesium.wmtsOptions[0];
    expect(options.url).toBe(GIBS_WMTS_URL);
    expect(options.layer).toBe(GIBS_LAYER_ID);
    expect(options.style).toBe(GIBS_STYLE);
    expect(options.format).toBe(GIBS_FORMAT);
    expect(options.tileMatrixSetID).toBe(GIBS_TILE_MATRIX_SET_ID);
    expect(options.maximumLevel).toBe(GIBS_MAXIMUM_LEVEL);
    // TIME carries the UTC calendar day of the daily composite.
    expect(options.dimensions).toEqual({ Time: '2026-10-15' });
    // The configured product stays within the server allow-list.
    expect(isAllowedLayer(options.layer as string)).toBe(true);
    expect(GIBS_CREDIT_TEXT).toMatch(/GIBS/);
  });

  it('throws for unknown, forged, or overlay ids instead of building a provider', () => {
    const cesium = fakeRuntime();
    for (const bad of [
      'sentinel-2',
      'cesium-graticule',
      '',
      null,
      undefined,
      'https://evil.example/tiles/{z}/{x}/{y}.png',
    ]) {
      expect(() => createBaseImageryProvider(cesium, bad)).toThrow(
        UnsupportedImageryLayerError,
      );
    }
    // Nothing was constructed from untrusted input.
    expect(cesium.wmtsOptions).toHaveLength(0);
  });

  it('never derives a provider URL from the layer id', () => {
    const cesium = fakeRuntime();
    createBaseImageryProvider(cesium, 'gibs-modis-truecolor');
    const options = cesium.wmtsOptions[0];
    // The endpoint is the pinned constant; the id selects the branch only.
    expect(options.url).toBe(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi',
    );
    expect(String(options.url)).not.toContain('evil');
  });

  it('builds the restrained graticule overlay unchanged', () => {
    const cesium = fakeRuntime();
    createGraticuleProvider(cesium);
    expect(cesium.gridOptions).toHaveLength(1);
    const options = cesium.gridOptions[0];
    expect(options.cells).toBe(CESIUM_GRID_CELLS);
    expect(options.backgroundColor).toEqual({ css: 'transparent' });
  });

  it('recognizes only the graticule overlay', () => {
    expect(isSupportedOverlayLayerId('cesium-graticule')).toBe(true);
    expect(isSupportedOverlayLayerId('gibs-modis-truecolor')).toBe(false);
    expect(isSupportedOverlayLayerId('ndvi')).toBe(false);
  });
});
