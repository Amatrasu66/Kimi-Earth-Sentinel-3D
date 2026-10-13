/**
 * T4.1 texture-tier tests: pure tier/format selection, manifest honesty
 * (files on disk, supported extensions), per-texture fallback, SSR-safe
 * probing, and the dotted Earth's independence from 3D texture assets.
 * No GPU — selection and loading contracts only, never pixels or hardware.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderToString } from 'react-dom/server';
import { cleanup, render, waitFor } from '@testing-library/react';
import {
  TEXTURE_URLS,
  TIER_FALLBACK,
  loadTieredTexture,
  probeTextureCapabilities,
  resolveTextureTier,
  useTextureTier,
  type TextureCapabilities,
} from './textureTiers';
import DottedEarth from './dotted/DottedEarth';

const CAPABLE: TextureCapabilities = {
  coarsePointer: false,
  devicePixelRatio: 2,
  screenMaxPx: 2560,
  deviceMemoryGB: 8,
  saveData: false,
  maxTextureSize: 16384,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('tier selection (T4.1 §3)', () => {
  it('selects the high tier only when every capability passes', () => {
    expect(resolveTextureTier(CAPABLE)).toBe('high');
  });

  it('vetoes the high tier on coarse pointers and Save-Data', () => {
    expect(resolveTextureTier({ ...CAPABLE, coarsePointer: true })).toBe('standard');
    expect(resolveTextureTier({ ...CAPABLE, saveData: true })).toBe('standard');
  });

  it('vetoes the high tier below the resolution thresholds', () => {
    expect(resolveTextureTier({ ...CAPABLE, devicePixelRatio: 1 })).toBe('standard');
    expect(resolveTextureTier({ ...CAPABLE, devicePixelRatio: 0 })).toBe('standard');
    expect(resolveTextureTier({ ...CAPABLE, devicePixelRatio: Number.NaN })).toBe('standard');
    expect(resolveTextureTier({ ...CAPABLE, screenMaxPx: 1366 })).toBe('standard');
    expect(resolveTextureTier({ ...CAPABLE, screenMaxPx: 0 })).toBe('standard');
  });

  it('vetoes on known-small memory or texture limits, never on unknown signals', () => {
    expect(resolveTextureTier({ ...CAPABLE, deviceMemoryGB: 2 })).toBe('standard');
    expect(resolveTextureTier({ ...CAPABLE, deviceMemoryGB: null })).toBe('high');
    expect(resolveTextureTier({ ...CAPABLE, maxTextureSize: 2048 })).toBe('standard');
    expect(resolveTextureTier({ ...CAPABLE, maxTextureSize: null })).toBe('high');
  });

  it('does not consult the renderer — WebGPU alone never proves capability', () => {
    // The capability shape has no renderer field by design.
    expect('renderer' in CAPABLE).toBe(false);
    expect(resolveTextureTier(CAPABLE)).toBe('high');
  });
});

describe('tier manifest honesty (T4.1 §1/§6)', () => {
  const SLOTS = ['day', 'night', 'clouds', 'topology', 'water'] as const;

  it('covers every slot in both tiers with universally-decodable formats', () => {
    for (const tier of ['standard', 'high'] as const) {
      for (const slot of SLOTS) {
        const url = TEXTURE_URLS[tier][slot];
        expect(url.startsWith('/textures/')).toBe(true);
        // JPEG/PNG only: no KTX2/WebP URLs that a renderer path could not
        // decode (format support matrix unverifiable headlessly).
        expect(url).toMatch(/\.(jpg|png)$/);
      }
    }
  });

  it('tiers differ only where a genuine 4K source exists', () => {
    expect(TEXTURE_URLS.high.day).not.toBe(TEXTURE_URLS.standard.day);
    expect(TEXTURE_URLS.high.night).not.toBe(TEXTURE_URLS.standard.night);
    for (const slot of ['clouds', 'topology', 'water'] as const) {
      expect(TEXTURE_URLS.high[slot]).toBe(TEXTURE_URLS.standard[slot]);
    }
    expect(TIER_FALLBACK).toEqual({ standard: 'standard', high: 'standard' });
  });

  it('references assets that actually exist on disk with nonzero payload', () => {
    const dir = path.join(process.cwd(), 'public', 'textures');
    const seen = new Set<string>();
    for (const tier of ['standard', 'high'] as const) {
      for (const slot of SLOTS) {
        const file = TEXTURE_URLS[tier][slot].replace('/textures/', '');
        const stat = fs.statSync(path.join(dir, file));
        expect(stat.isFile()).toBe(true);
        expect(stat.size).toBeGreaterThan(0);
        seen.add(file);
      }
    }
    // Exactly the seven shipped files — no dangling references either way.
    expect(seen.size).toBe(7);
  });
});

describe('tiered loading with standard fallback (T4.1 §5)', () => {
  function fakeLoader(failures: string[] = []) {
    const calls: string[] = [];
    return {
      calls,
      loadAsync: (url: string) => {
        calls.push(url);
        return failures.includes(url)
          ? Promise.reject(new Error(`missing ${url}`))
          : Promise.resolve({ url });
      },
    };
  }

  it('loads the tier URL with a single request on success', async () => {
    const loader = fakeLoader();
    const result = await loadTieredTexture(loader, 'day', 'high');
    expect(result).toEqual({ texture: { url: '/textures/earth-day.jpg' }, url: '/textures/earth-day.jpg' });
    expect(loader.calls).toEqual(['/textures/earth-day.jpg']);
  });

  it('retries the standard URL when the preferred asset fails', async () => {
    const loader = fakeLoader(['/textures/earth-day.jpg']);
    const result = await loadTieredTexture(loader, 'day', 'high');
    expect(result.url).toBe('/textures/earth-day-2k.jpg');
    expect(loader.calls).toEqual(['/textures/earth-day.jpg', '/textures/earth-day-2k.jpg']);
  });

  it('throws for renderer-level fallback when both attempts fail', async () => {
    const loader = fakeLoader(['/textures/earth-day.jpg', '/textures/earth-day-2k.jpg']);
    await expect(loadTieredTexture(loader, 'day', 'high')).rejects.toThrow('missing');
    expect(loader.calls).toHaveLength(2);
  });

  it('never double-requests on the standard tier', async () => {
    const loader = fakeLoader(['/textures/earth-topology.png']);
    await expect(loadTieredTexture(loader, 'topology', 'standard')).rejects.toThrow('missing');
    expect(loader.calls).toEqual(['/textures/earth-topology.png']);
  });
});

describe('probing without a GPU (T4.1 §7)', () => {
  it('resolves the conservative standard tier from jsdom signals', () => {
    // jsdom: DPR 1, 1024px screen — below both thresholds by construction.
    expect(resolveTextureTier(probeTextureCapabilities())).toBe('standard');
  });

  it('reports the tier through a deterministic SSR snapshot', () => {
    function TierLabel() {
      return <span>{useTextureTier()}</span>;
    }
    const html = renderToString(<TierLabel />);
    expect(html).toContain('standard');
  });
});

describe('dotted Earth independence from 3D textures (T4.1 §4/§7)', () => {
  it('requests no /textures/ asset even when its geography fails', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('offline'));
    render(<DottedEarth />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => u.includes('/textures/'))).toEqual([]);
  });
});
