/**
 * Globe texture tiers (T4.1) — single decision point for 3D texture assets.
 *
 *   standard → 2K-class day/night plus the ≤2K companions (default)
 *   high     → 4K day/night for capable desktops (companions are shared)
 *
 * Both the WebGL (`Globe`, drei `useTexture`) and WebGPU (`WebGPUEarth`,
 * imperative `TextureLoader`) paths consume this manifest, so one tier
 * decision can never work in one renderer while silently breaking the
 * other. Only JPEG/PNG decoders are used — no KTX2 (see the trade-off note
 * in `docs/development.md`: no transcoder toolchain in this repo, 584 KB
 * of in-package transcoder overhead, and a per-platform format matrix the
 * WebGPU path cannot verify headlessly).
 *
 * Tier rules (documented thresholds):
 * - coarse pointers, Save-Data, DPR < 1.5, or small screens → standard.
 *   A 4K texture whose texels vastly outnumber display pixels buys nothing.
 * - `deviceMemory` (Chrome-only) vetoes below 4 GB; unknown (null) never
 *   vetoes. WebGPU alone is NOT proof of GPU memory — the renderer is not
 *   even consulted here.
 * - `maxTextureSize` vetoes below 4096 only when explicitly known (the
 *   WebGL path cannot know it pre-Canvas; WebGPU guarantees 8192).
 *   Unknown (null) never vetoes; exotic sub-4K hardware falls through to
 *   the existing renderer error path instead of a second download.
 * - The tier is stable for a renderer's lifetime: no mid-life upgrades, so
 *   both sets are never allocated simultaneously.
 *
 * Pure except where marked — safe to call during render, fully
 * unit-testable without a GPU. The dotted Earth never imports this module
 * (its only asset is the local GeoJSON geography).
 */
import { useSyncExternalStore } from 'react';

export type TextureTier = 'standard' | 'high';

/** Texture slots consumed by both 3D renderers. */
export type TextureSlot = 'day' | 'night' | 'clouds' | 'topology' | 'water';

/**
 * Tier manifest: slot → same-origin public asset URL. Day/night differ by
 * tier (2K derivatives vs 4K originals, all NASA Blue Marble family);
 * clouds/topology/water are already ≤2K and shared. Every URL decodes in
 * both renderers (JPEG/PNG only).
 */
export const TEXTURE_URLS: Record<TextureTier, Record<TextureSlot, string>> = {
  standard: {
    day: '/textures/earth-day-2k.jpg',
    night: '/textures/earth-night-2k.jpg',
    clouds: '/textures/earth-clouds.jpg',
    topology: '/textures/earth-topology.png',
    water: '/textures/earth-water.png',
  },
  high: {
    day: '/textures/earth-day.jpg',
    night: '/textures/earth-night.jpg',
    clouds: '/textures/earth-clouds.jpg',
    topology: '/textures/earth-topology.png',
    water: '/textures/earth-water.png',
  },
};

/** Tier fallback: a failed preferred asset retries the standard URL. */
export const TIER_FALLBACK: Record<TextureTier, TextureTier> = {
  standard: 'standard',
  high: 'standard',
};

export interface TextureCapabilities {
  coarsePointer: boolean;
  /** CSS px ratio; 0/NaN when unknown (never high). */
  devicePixelRatio: number;
  /** Longest screen edge in CSS px; 0 when unknown (never high). */
  screenMaxPx: number;
  /** Chrome `navigator.deviceMemory` fuzzy GB; null when unknown (no veto). */
  deviceMemoryGB: number | null;
  /** `navigator.connection.saveData`; false when unknown. */
  saveData: boolean;
  /** GL `MAX_TEXTURE_SIZE` / adapter limit; null when unknown (no veto). */
  maxTextureSize: number | null;
}

export function resolveTextureTier(caps: TextureCapabilities): TextureTier {
  if (caps.coarsePointer) return 'standard';
  if (caps.saveData) return 'standard';
  if (!(caps.devicePixelRatio >= 1.5)) return 'standard';
  if (!(caps.screenMaxPx >= 1600)) return 'standard';
  if (caps.deviceMemoryGB !== null && !(caps.deviceMemoryGB >= 4)) return 'standard';
  if (caps.maxTextureSize !== null && !(caps.maxTextureSize >= 4096)) return 'standard';
  return 'high';
}

const emptySubscribe = () => () => {};

/**
 * Read capability signals defensively. SSR (or any missing API) yields the
 * conservative all-unknown shape, which `resolveTextureTier` maps to the
 * standard tier — the server snapshot is therefore deterministic.
 */
export function probeTextureCapabilities(
  maxTextureSize: number | null = null,
): TextureCapabilities {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      coarsePointer: false,
      devicePixelRatio: 0,
      screenMaxPx: 0,
      deviceMemoryGB: null,
      saveData: false,
      maxTextureSize,
    };
  }
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  const screenMaxPx = Math.max(window.screen?.width ?? 0, window.screen?.height ?? 0);
  return {
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    devicePixelRatio: window.devicePixelRatio || 0,
    screenMaxPx,
    deviceMemoryGB:
      typeof nav.deviceMemory === 'number' && Number.isFinite(nav.deviceMemory)
        ? nav.deviceMemory
        : null,
    saveData: nav.connection?.saveData ?? false,
    maxTextureSize,
  };
}

/**
 * Reactive tier for component render (same pattern as `useGlobeMode`):
 * SSR reports the neutral standard tier so markup stays deterministic;
 * the client resolves synchronously — no effect, no second download, and
 * the value is stable for the component's lifetime.
 */
export function useTextureTier(): TextureTier {
  return useSyncExternalStore(
    emptySubscribe,
    () => resolveTextureTier(probeTextureCapabilities()),
    () => 'standard' as const,
  );
}

export interface TierLoader<T> {
  loadAsync: (url: string) => Promise<T>;
}

/**
 * Load one slot through the tier manifest with standard-tier fallback.
 * Tries the tier URL; when the tier differs from standard and the load
 * fails, retries the standard URL once; otherwise rethrows so the
 * existing renderer-level fallback (WebGPU→WebGL) takes over. Resolves to
 * exactly one texture — a rejected attempt retains nothing (no GPU
 * allocation exists for a failed decode), so partial failures cannot leak.
 */
export async function loadTieredTexture<T>(
  loader: TierLoader<T>,
  slot: TextureSlot,
  tier: TextureTier,
): Promise<{ texture: T; url: string }> {
  const url = TEXTURE_URLS[tier][slot];
  try {
    return { texture: await loader.loadAsync(url), url };
  } catch (err) {
    const fallback = TEXTURE_URLS[TIER_FALLBACK[tier]][slot];
    if (fallback === url) throw err;
    return { texture: await loader.loadAsync(fallback), url: fallback };
  }
}
