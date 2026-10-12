import { useState, useCallback, useEffect } from 'react';
import type { FocusTarget } from '@/components/app/useFocusRestore';

// T3.8 first-run hint dismissal persistence: one small versioned flag in
// browser storage, read/written only on the client (never during SSR).
// Failures (private mode, blocked storage) degrade to session-only memory.
const FIRST_RUN_HINT_STORAGE_KEY = 'sentinel:first-run-hint-dismissed:v1';
const HINT_SELECTOR = '[role="note"][aria-label="Getting started hint"]';

function readFirstRunHintDismissed(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(FIRST_RUN_HINT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFirstRunHintDismissed(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(FIRST_RUN_HINT_STORAGE_KEY, '1');
  } catch {
    /* storage unavailable — dismissal lasts for this session only */
  }
}

export interface FirstRunHintApi {
  hintDismissed: boolean;
  dismissHint: () => void;
}

/**
 * First-run guidance flag (T3.8, extracted T3.17).
 *
 * Owns the persisted one-time dismissal: read after hydration (never
 * during SSR, so markup stays deterministic), cleared from the tree on
 * dismiss. When focus sat inside the hint, it records a workspace-restore
 * request so keyboard users are not dropped to `<body>`.
 */
export function useFirstRunHint(requestFocus: (target: FocusTarget) => void): FirstRunHintApi {
  const [hintDismissed, setHintDismissed] = useState(false);

  useEffect(() => {
    if (readFirstRunHintDismissed()) {
      // External storage → state sync after hydration (SSR deterministic).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHintDismissed(true);
    }
  }, []);

  const dismissHint = useCallback(() => {
    const hint = document.querySelector(HINT_SELECTOR);
    const restoreFocus = !!hint && hint.contains(document.activeElement);
    setHintDismissed(true);
    writeFirstRunHintDismissed();
    if (restoreFocus) requestFocus('workspace');
  }, [requestFocus]);

  return { hintDismissed, dismissHint };
}
