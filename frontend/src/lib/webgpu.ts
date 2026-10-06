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

/**
 * Development/debug renderer override for the WebGPU vs WebGL A/B test
 * (Session 5 diagnosis).
 *
 * `?renderer=webgl` forces the WebGL fallback even on WebGPU-capable
 * browsers; `?renderer=webgpu` forces the WebGPU path even where the probe
 * would decline it (a real init/render failure still falls back to WebGL
 * via the normal status-error path). Absent or any other value → no
 * override (`null`).
 *
 * Pure function of the query string — unit-testable without a browser.
 * Reads `window.location.search` in production; accepts an explicit
 * `search` argument for tests. Never throws.
 */
export function getForcedRenderer(search?: string): RendererKind | null {
  try {
    const raw =
      typeof search === 'string'
        ? search
        : typeof window !== 'undefined'
          ? window.location.search
          : '';
    const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
    const value = params.get('renderer')?.toLowerCase();
    if (value === 'webgl' || value === 'webgpu') return value;
    return null;
  } catch {
    return null;
  }
}

/**
 * Single decision point for renderer selection (Session 5 regression seam).
 *
 * Priority: explicit `?renderer=` override wins (A/B diagnosis must work on
 * any browser); otherwise the capability probe decides. A failed/negative
 * probe always resolves to WebGL so the user never sees a black viewport.
 */
export function decideRendererMode(
  forced: RendererKind | null,
  support: WebGpuSupport,
): RendererKind {
  if (forced === 'webgl' || forced === 'webgpu') return forced;
  return support.supported ? 'webgpu' : 'webgl';
}
