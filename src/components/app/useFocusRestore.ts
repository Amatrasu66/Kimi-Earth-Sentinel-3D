import { useState, useCallback, useEffect, useRef } from 'react';

export type FocusTarget = 'panel' | 'workspace' | 'settings';

export interface FocusRestoreApi {
  /** Record where focus must land; applied after the committing render. */
  requestFocus: (target: FocusTarget) => void;
  /**
   * True when focus sits inside a data surface (panel or list stage) — or
   * on `<body>` while one exists (Safari mouse clicks). Call before the
   * commit that unmounts or swaps the surface.
   */
  focusInDataSurface: () => boolean;
  /** True when focus sits inside `selector` (hint note, open dialog). */
  focusWithin: (selector: string) => boolean;
}

/** Panel/list-stage ids double as the focus-restore targets. */
function surfaceNode(target: FocusTarget): HTMLElement | null {
  if (target === 'panel') {
    return document.getElementById('sentinel-data-panel') ?? document.getElementById('sentinel-list-stage');
  }
  if (target === 'settings') {
    return document.getElementById('sentinel-settings-button');
  }
  return document.getElementById('sentinel-workspace');
}

/**
 * Focus restoration (T3.10, extracted T3.17).
 *
 * Closing the panel, swapping it back to the layer view, dismissing the
 * hint, or closing Settings unmounts the focused control (or the whole
 * surface). Without a request the browser drops focus to `<body>`,
 * stranding keyboard users. Handlers record the target; the effect below
 * applies it after the commit that changed state (so the restored surface
 * is found under its final label/content). The request bumps a counter so
 * the effect runs even if the accompanying update bails out.
 */
export function useFocusRestore(): FocusRestoreApi {
  const pendingFocusRef = useRef<FocusTarget | null>(null);
  const [, bumpCommit] = useState(0);

  const requestFocus = useCallback((target: FocusTarget) => {
    pendingFocusRef.current = target;
    bumpCommit((n) => n + 1);
  }, []);

  const focusInDataSurface = useCallback((): boolean => {
    const active = document.activeElement;
    if (!active) return false;
    if (active === document.body) {
      return (
        !!document.getElementById('sentinel-data-panel') ||
        !!document.getElementById('sentinel-list-stage')
      );
    }
    return (
      !!document.getElementById('sentinel-data-panel')?.contains(active) ||
      !!document.getElementById('sentinel-list-stage')?.contains(active)
    );
  }, []);

  const focusWithin = useCallback((selector: string): boolean => {
    const active = document.activeElement;
    if (!active || active === document.body) return false;
    return !!document.querySelector(selector)?.contains(active);
  }, []);

  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    surfaceNode(target)?.focus();
  });

  return { requestFocus, focusInDataSurface, focusWithin };
}
