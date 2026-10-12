import { useState, useCallback, useEffect } from 'react';

// T3.10 (PRD U-04 / P1-18): the single-key shortcut map (`1..8`, `Space`,
// `?`, `/`) can be switched off in Settings → Shortcuts. Same client-only
// storage contract as the hint flag: read after hydration, default on.
const SINGLE_KEY_STORAGE_KEY = 'sentinel:single-key-shortcuts:v1';

function readSingleKeyShortcuts(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    return window.localStorage.getItem(SINGLE_KEY_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeSingleKeyShortcuts(enabled: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(SINGLE_KEY_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* storage unavailable — the setting lasts for this session only */
  }
}

export interface SingleKeyShortcutsApi {
  singleKeyShortcuts: boolean;
  /** Persists the Settings → Shortcuts master switch. */
  setSingleKeyShortcuts: (enabled: boolean) => void;
}

/**
 * Single-key shortcut preference (T3.10, extracted T3.17).
 *
 * On by default; the persisted choice applies after hydration so SSR
 * output always renders the enabled variant (no hydration mismatch).
 */
export function useSingleKeyShortcuts(): SingleKeyShortcutsApi {
  const [singleKeyShortcuts, setEnabled] = useState(true);

  // Persisted choice applies after hydration (state only — no write-back,
  // so a stored value is never clobbered by the mount itself).
  useEffect(() => {
    // External storage → state sync after hydration (SSR deterministic).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(readSingleKeyShortcuts());
  }, []);

  const setSingleKeyShortcuts = useCallback((enabled: boolean) => {
    setEnabled(enabled);
    writeSingleKeyShortcuts(enabled);
  }, []);

  return { singleKeyShortcuts, setSingleKeyShortcuts };
}
