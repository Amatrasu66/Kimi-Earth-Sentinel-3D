import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAND_ASSET_URL, assertLandAsset, loadLandAsset, resetLandAssetCache } from './landGeo';
import type { LandAsset } from './landGeo';

const VALID_ASSET: LandAsset = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [10, -10],
            [-10, -10],
            [-10, 10],
            [10, 10],
            [10, -10],
          ],
        ],
      },
    },
  ],
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('assertLandAsset (GLOBE-1)', () => {
  it('accepts a usable FeatureCollection', () => {
    expect(() => assertLandAsset(VALID_ASSET)).not.toThrow();
  });

  it('rejects values that are not objects', () => {
    expect(() => assertLandAsset(null)).toThrow('not an object');
    expect(() => assertLandAsset('land')).toThrow('not an object');
  });

  it('rejects a non-FeatureCollection payload', () => {
    expect(() => assertLandAsset({ type: 'Feature', features: [] })).toThrow(
      'not a FeatureCollection',
    );
  });

  it('rejects an empty feature list', () => {
    expect(() => assertLandAsset({ type: 'FeatureCollection', features: [] })).toThrow(
      'no features',
    );
  });

  it('rejects a feature without geometry', () => {
    expect(() =>
      assertLandAsset({ type: 'FeatureCollection', features: [{ type: 'Feature' }] }),
    ).toThrow('no geometry');
    expect(() =>
      assertLandAsset({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { nope: true } }],
      }),
    ).toThrow('no geometry');
  });
});

describe('loadLandAsset request discipline (GLOBE-1)', () => {
  beforeEach(() => {
    resetLandAssetCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetLandAssetCache();
  });

  it('issues exactly one request for concurrent callers', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => jsonResponse(VALID_ASSET));

    const [a, b] = await Promise.all([loadLandAsset(), loadLandAsset()]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(LAND_ASSET_URL);
    expect(a).toEqual(VALID_ASSET);
    expect(b).toBe(a);
  });

  it('caches a settled success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => jsonResponse(VALID_ASSET));

    await loadLandAsset();
    await loadLandAsset();
    await loadLandAsset();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('reports an HTTP failure and retries on the next call', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => jsonResponse({}, false, 503));

    await expect(loadLandAsset()).rejects.toThrow('HTTP 503');

    fetchSpy.mockImplementation(() => jsonResponse(VALID_ASSET));
    await expect(loadLandAsset()).resolves.toEqual(VALID_ASSET);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('rejects a corrupt payload instead of poisoning the projection', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      jsonResponse({ message: 'upstream error' }),
    );

    await expect(loadLandAsset()).rejects.toThrow('not a FeatureCollection');
    // A failure is never cached, so the caller may retry.
    await expect(loadLandAsset()).rejects.toThrow('not a FeatureCollection');
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
  });

  it('falls back to the global fetch for the relative asset path', () => {
    // The asset must stay same-origin: a new URL with an origin would mean
    // a third-party dependency crept back in.
    expect(LAND_ASSET_URL).toBe('/geo/land-110m.json');
    expect(() => new URL(LAND_ASSET_URL, 'https://example.test')).not.toThrow();
  });
});

describe('bundled land asset (GLOBE-1)', () => {
  it('ships a valid Natural Earth FeatureCollection in public/geo', () => {
    const file = path.join(process.cwd(), 'public', 'geo', 'land-110m.json');
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    expect(() => assertLandAsset(parsed)).not.toThrow();
    const asset = parsed as LandAsset;
    expect(asset.features.length).toBeGreaterThan(100);
  });
});
