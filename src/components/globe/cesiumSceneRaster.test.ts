/**
 * Phase 7 scene-raster factory tests: descriptor validation (the trust
 * boundary between the API payload and a Cesium URL) and the exact
 * provider options built from a valid descriptor. No `cesium` runtime is
 * imported — the namespace arrives as a fake surface, same seam as
 * `cesiumImageryProviders.test.ts`.
 *
 * NOTE: these tests were authored during implementation and have NOT been
 * executed by the implementing agent (see PHASE_7_IMPLEMENTATION_REPORT.md
 * §12). They run with the standard `npm test`.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  SCENE_RASTER_MAX_ZOOM_CAP,
  SCENE_RASTER_TILE_ORIGIN,
  SCENE_RASTER_TILE_SIZE,
  UnsupportedSceneRasterError,
  createSceneRasterImageryProvider,
  isValidSceneRasterDescriptor,
} from './cesiumSceneRaster';
import type { CesiumSceneRasterSurface } from './cesiumSceneRaster';
import type { SceneRasterDescriptor } from '@/types';

const ITEM_ID = 'S2B_MSIL2A_20261017T144729_R139_T19MFT_20261017T182518';

function validDescriptor(): SceneRasterDescriptor {
  return {
    provider: 'microsoft-planetary-computer',
    collection: 'sentinel-2-l2a',
    item_id: ITEM_ID,
    tile_url_template:
      `${SCENE_RASTER_TILE_ORIGIN}WebMercatorQuad/{z}/{x}/{y}@1x` +
      `?collection=sentinel-2-l2a&item=${ITEM_ID}` +
      '&assets=visual&asset_bidx=visual%7C1,2,3&nodata=0&format=png',
    preview_url:
      `https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png` +
      `?collection=sentinel-2-l2a&item=${ITEM_ID}`,
    bbox: [139.9, 35.0, 141.2, 36.1],
    min_zoom: 0,
    max_zoom: 14,
    rendering: 'True color (visual band composite 1–2–3)',
    resolution_note: '~10 m native pixels',
  };
}

function fakeRuntime(): CesiumSceneRasterSurface & {
  tileOptions: Array<Record<string, unknown>>;
  creditArgs: string[];
  rectangleArgs: number[][];
} {
  const tileOptions: Array<Record<string, unknown>> = [];
  const creditArgs: string[] = [];
  const rectangleArgs: number[][] = [];
  const runtime = {
    UrlTemplateImageryProvider: vi.fn(function (
      this: unknown,
      options: Record<string, unknown>,
    ) {
      tileOptions.push(options);
      return {
        errorEvent: { addEventListener: vi.fn(() => () => {}) },
      };
    }),
    Credit: vi.fn(function (this: unknown, text: string) {
      creditArgs.push(text);
      return { text };
    }),
    Rectangle: {
      fromDegrees: vi.fn((west: number, south: number, east: number, north: number) => {
        rectangleArgs.push([west, south, east, north]);
        return { west, south, east, north };
      }),
    },
  };
  return {
    ...(runtime as unknown as CesiumSceneRasterSurface),
    tileOptions,
    creditArgs,
    rectangleArgs,
  };
}

describe('scene-raster descriptor validation (Phase 7)', () => {
  it('accepts the canonical descriptor', () => {
    expect(isValidSceneRasterDescriptor(validDescriptor())).toBe(true);
  });

  it('rejects non-descriptors and forged providers', () => {
    for (const bad of [
      null,
      undefined,
      'https://evil.example/{z}/{x}/{y}.png',
      { ...validDescriptor(), provider: 'evil-provider' },
      { ...validDescriptor(), collection: 'sentinel-3-olci' },
      { ...validDescriptor(), item_id: 'has spaces' },
    ]) {
      expect(isValidSceneRasterDescriptor(bad)).toBe(false);
    }
  });

  it('rejects tile templates outside the pinned origin', () => {
    const cases: Array<Record<string, unknown>> = [
      { tile_url_template: 'https://evil.example/{z}/{x}/{y}.png' },
      {
        tile_url_template:
          'http://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x',
      },
      {
        tile_url_template:
          `${SCENE_RASTER_TILE_ORIGIN}WebMercatorQuad/{z}/{x}@1x?item=x`,
      },
    ];
    for (const patch of cases) {
      expect(isValidSceneRasterDescriptor({ ...validDescriptor(), ...patch })).toBe(false);
    }
  });

  it('rejects credential-bearing templates', () => {
    const descriptor = validDescriptor();
    const withToken = {
      ...descriptor,
      tile_url_template: `${descriptor.tile_url_template}&token=se.cret`,
    };
    expect(isValidSceneRasterDescriptor(withToken)).toBe(false);
  });

  it('rejects preview URLs from foreign hosts', () => {
    expect(
      isValidSceneRasterDescriptor({
        ...validDescriptor(),
        preview_url: 'https://evil.example/preview.png',
      }),
    ).toBe(false);
    expect(
      isValidSceneRasterDescriptor({ ...validDescriptor(), preview_url: null }),
    ).toBe(true);
  });

  it('rejects unusable bounding boxes and zoom ranges', () => {
    const badPatches: Array<Record<string, unknown>> = [
      { bbox: [141.2, 35.0, 139.9, 36.1] }, // west > east
      { bbox: [139.9, 36.1, 141.2, 35.0] }, // south > north
      { bbox: [-190, 35.0, 141.2, 36.1] },
      { bbox: [139.9, 35.0, 141.2] },
      { bbox: [139.9, 35.0, 141.2, Number.NaN] },
      { min_zoom: -1 },
      { min_zoom: 0.5 },
      { max_zoom: SCENE_RASTER_MAX_ZOOM_CAP + 1 },
      { min_zoom: 10, max_zoom: 5 },
    ];
    for (const patch of badPatches) {
      expect(isValidSceneRasterDescriptor({ ...validDescriptor(), ...patch })).toBe(false);
    }
  });
});

describe('scene-raster provider factory (Phase 7)', () => {
  it('builds the verified provider options for a valid descriptor', () => {
    const cesium = fakeRuntime();
    const descriptor = validDescriptor();
    const provider = createSceneRasterImageryProvider(
      cesium,
      descriptor,
      'Contains modified Copernicus Sentinel data · Rendered by Microsoft Planetary Computer',
    );
    expect(provider).toBeDefined();
    expect(cesium.tileOptions).toHaveLength(1);
    const options = cesium.tileOptions[0];
    expect(options.url).toBe(descriptor.tile_url_template);
    expect(options.tileWidth).toBe(SCENE_RASTER_TILE_SIZE);
    expect(options.tileHeight).toBe(SCENE_RASTER_TILE_SIZE);
    expect(options.minimumLevel).toBe(0);
    expect(options.maximumLevel).toBe(14);
    expect(options.hasAlpha).toBe(true);
    expect(cesium.rectangleArgs).toEqual([[139.9, 35.0, 141.2, 36.1]]);
    expect(cesium.creditArgs).toHaveLength(1);
    expect(cesium.creditArgs[0]).toMatch(/Copernicus/);
  });

  it('omits the credit when no attribution text is supplied', () => {
    const cesium = fakeRuntime();
    createSceneRasterImageryProvider(cesium, validDescriptor());
    expect(cesium.tileOptions[0].credit).toBeUndefined();
  });

  it('throws for forged descriptors instead of constructing a provider', () => {
    const cesium = fakeRuntime();
    for (const bad of [
      null,
      { ...validDescriptor(), tile_url_template: 'https://evil.example/{z}/{x}/{y}.png' },
      { ...validDescriptor(), bbox: [141, 36, 140, 35] },
    ]) {
      expect(() => createSceneRasterImageryProvider(cesium, bad)).toThrow(
        UnsupportedSceneRasterError,
      );
    }
    expect(cesium.tileOptions).toHaveLength(0);
    expect(cesium.creditArgs).toHaveLength(0);
  });

  it('never derives a tile URL from anything but the validated template', () => {
    const cesium = fakeRuntime();
    createSceneRasterImageryProvider(cesium, validDescriptor());
    const url = String(cesium.tileOptions[0].url);
    expect(url.startsWith(SCENE_RASTER_TILE_ORIGIN)).toBe(true);
    expect(url).not.toContain('evil');
    expect(url).not.toContain('token=');
  });
});
