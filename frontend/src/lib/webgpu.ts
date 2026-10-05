/**
 * WebGPU capability probe (Earth renderer selection).
 *
 * Cached: the first call performs the real `navigator.gpu.requestAdapter()`
 * check, later calls reuse the result. Never throws — unsupported or
 * failure simply resolves to `supported: false` so the caller can fall
 * back to the WebGL globe.
 */
export type RendererKind = 'webgpu' | 'webgl';

export interface WebGpuSupport {
  supported: boolean;
  /** Machine-readable reason, safe to show in Diagnostics. */
  reason: 'ok' | 'no-navigator-gpu' | 'no-adapter' | 'probe-failed';
}

let cached: Promise<WebGpuSupport> | null = null;

/** Test seam: forget the cached probe result (used by unit tests). */
export function resetWebGpuProbeForTests(): void {
  cached = null;
}

export function probeWebGpuSupport(): Promise<WebGpuSupport> {
  if (!cached) {
    cached = (async (): Promise<WebGpuSupport> => {
      try {
        const nav = globalThis.navigator as Navigator & {
          gpu?: { requestAdapter: () => Promise<unknown> };
        };
        if (!nav?.gpu?.requestAdapter) {
          return { supported: false, reason: 'no-navigator-gpu' };
        }
        const adapter = await nav.gpu.requestAdapter();
        if (!adapter) {
          return { supported: false, reason: 'no-adapter' };
        }
        return { supported: true, reason: 'ok' };
      } catch {
        return { supported: false, reason: 'probe-failed' };
      }
    })();
  }
  return cached;
}

/** Synchronous pre-check (no adapter request) for instant UI hints. */
export function hasNavigatorGpu(): boolean {
  try {
    const nav = globalThis.navigator as Navigator & { gpu?: unknown };
    return Boolean(nav?.gpu);
  } catch {
    return false;
  }
}
