import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function getMql(): MediaQueryList | null {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    return window.matchMedia(QUERY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  const mql = getMql();
  if (!mql) return () => {};
  // Evergreen path. The legacy addListener fallback covers older Safari,
  // which exposes MediaQueryList without addEventListener.
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }
  const legacy = mql as MediaQueryList & {
    addListener?: (cb: () => void) => void;
    removeListener?: (cb: () => void) => void;
  };
  if (typeof legacy.addListener === 'function') {
    legacy.addListener(onChange);
    return () => legacy.removeListener?.(onChange);
  }
  return () => {};
}

function getSnapshot(): boolean {
  return getMql()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  // Deterministic SSR: no preference assumed, and `window` is never
  // touched during server rendering. The value only ever flows into engine
  // refs and frame loops — never into rendered markup — so hydration can
  // never mismatch on it.
  return false;
}

/**
 * Shared reduced-motion preference (T3.11) — the single subscription point
 * for all three globe engines (dotted, WebGL, WebGPU).
 *
 * Reactive: a mid-session OS setting change updates every engine without a
 * remount (each engine reads the value through refs in its frame loop).
 * Lifecycle-safe: the listener is removed on unmount by React itself.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
