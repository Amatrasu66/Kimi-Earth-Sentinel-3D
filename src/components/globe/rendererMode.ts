/**
 * Globe renderer selection — single decision point (GLOBE-1).
 *
 *   `?renderer=webgpu` → WebGPU/TSL Earth (opt-in, existing)
 *   `?renderer=webgl`  → R3F/WebGL Earth (opt-in, existing)
 *   (absent)           → dotted canvas Earth mounted in the stage
 *
 * The default is the lightweight canvas renderer because it is the only
 * path that can guarantee a visible geographic base layer with no GPU
 * probe, no 2.1 MB lazy chunk, no adapter handshake and no multi-megabyte
 * texture downloads: it draws as soon as hydration completes and keeps
 * drawing while layer data is loading, empty or errored.
 *
 * The two 3D renderers are *not* removed — they keep their `?renderer=`
 * override, their parity contract and the existing WebGPU→WebGL fallback
 * (owner decision: no renderer removal without measured evidence).
 *
 * Pure function of the query string, so it is unit-testable without a
 * browser and safe to call during render.
 */
import { useSyncExternalStore } from 'react';
import { getForcedRenderer } from '@/lib/webgpu';

export type GlobeMode = 'dotted' | 'webgpu' | 'webgl';

/** Renderer used when the URL does not opt into a 3D path. */
export const DEFAULT_GLOBE_MODE: GlobeMode = 'dotted';

export function resolveGlobeMode(search?: string): GlobeMode {
  return getForcedRenderer(search) ?? DEFAULT_GLOBE_MODE;
}

const emptySubscribe = () => () => {};

/**
 * Reactive view of the renderer override for component render.
 *
 * `window.location.search` is external state, so `useSyncExternalStore` is
 * the correct primitive: the server snapshot is the neutral `'pending'`
 * (SSR keeps its loading veil and never touches `window`), the client
 * snapshot resolves synchronously to the override or the default, and the
 * post-hydration re-render is handled by React itself — no effect, no
 * `setState`-in-effect, no hydration mismatch.
 */
export function useGlobeMode(): 'pending' | GlobeMode {
  return useSyncExternalStore(
    emptySubscribe,
    () => resolveGlobeMode(),
    () => 'pending' as const,
  );
}
