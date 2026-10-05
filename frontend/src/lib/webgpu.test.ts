import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasNavigatorGpu, probeWebGpuSupport, resetWebGpuProbeForTests } from './webgpu';

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
