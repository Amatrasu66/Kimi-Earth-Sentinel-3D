import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decideRendererMode,
  getForcedRenderer,
  hasNavigatorGpu,
  probeWebGpuSupport,
  resetWebGpuProbeForTests,
} from './webgpu';

function setNavigatorGpu(stub: unknown) {
  Object.defineProperty(globalThis.navigator, 'gpu', {
    value: stub,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  resetWebGpuProbeForTests();
  vi.unstubAllGlobals();
});

describe('WebGPU capability probe', () => {
  it('reports unsupported when navigator.gpu is absent (no throw)', async () => {
    setNavigatorGpu(undefined);
    await expect(probeWebGpuSupport()).resolves.toEqual({
      supported: false,
      reason: 'no-navigator-gpu',
    });
    expect(hasNavigatorGpu()).toBe(false);
  });

  it('reports supported when an adapter is returned', async () => {
    setNavigatorGpu({ requestAdapter: vi.fn().mockResolvedValue({}) });
    await expect(probeWebGpuSupport()).resolves.toEqual({ supported: true, reason: 'ok' });
    expect(hasNavigatorGpu()).toBe(true);
  });

  it('reports unsupported when the adapter request resolves to null', async () => {
    setNavigatorGpu({ requestAdapter: vi.fn().mockResolvedValue(null) });
    await expect(probeWebGpuSupport()).resolves.toEqual({
      supported: false,
      reason: 'no-adapter',
    });
  });

  it('reports unsupported when the adapter request rejects', async () => {
    setNavigatorGpu({
      requestAdapter: vi.fn().mockRejectedValue(new Error('denied')),
    });
    await expect(probeWebGpuSupport()).resolves.toEqual({
      supported: false,
      reason: 'probe-failed',
    });
  });

  it('caches the probe so repeated renders do not re-request an adapter', async () => {
    const requestAdapter = vi.fn().mockResolvedValue({});
    setNavigatorGpu({ requestAdapter });
    await probeWebGpuSupport();
    await probeWebGpuSupport();
    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });
});

describe('forced renderer override (?renderer=… A/B flag)', () => {
  it('forces WebGL when ?renderer=webgl', () => {
    expect(getForcedRenderer('?renderer=webgl')).toBe('webgl');
  });

  it('forces WebGPU when ?renderer=webgpu', () => {
    expect(getForcedRenderer('?renderer=webgpu')).toBe('webgpu');
  });

  it('is case-insensitive', () => {
    expect(getForcedRenderer('?renderer=WebGL')).toBe('webgl');
  });

  it('returns null when the flag is absent', () => {
    expect(getForcedRenderer('')).toBeNull();
    expect(getForcedRenderer('?foo=bar')).toBeNull();
  });

  it('returns null for unknown values', () => {
    expect(getForcedRenderer('?renderer=canvas')).toBeNull();
  });
});

describe('renderer mode decision (Session 5 regression)', () => {
  it('a forced override wins over a positive probe', () => {
    expect(decideRendererMode('webgl', { supported: true, reason: 'ok' })).toBe('webgl');
    expect(decideRendererMode('webgpu', { supported: false, reason: 'no-adapter' })).toBe(
      'webgpu',
    );
  });

  it('a positive probe selects WebGPU when nothing is forced', () => {
    expect(decideRendererMode(null, { supported: true, reason: 'ok' })).toBe('webgpu');
  });

  it.each([
    { supported: false, reason: 'no-navigator-gpu' },
    { supported: false, reason: 'no-adapter' },
    { supported: false, reason: 'probe-failed' },
  ] as const)('a failed probe ($reason) falls back to WebGL', (support) => {
    expect(decideRendererMode(null, support)).toBe('webgl');
  });
});
