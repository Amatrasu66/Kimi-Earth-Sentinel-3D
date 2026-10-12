import { useEffect } from 'react';
import type { LayerId } from '@/types';
import { hasShortcutModifier, isActivatableTarget, isTypingTarget } from '@/lib/keyboard';

// Keyboard shortcut order (1-8). Preserved from the prototype, extended
// with wildfires now that the backend serves it. Index i maps to number
// key i+1; the rail and the app consume this same order.
export const SHORTCUT_LAYERS: LayerId[] = [
  'temperature',
  'precipitation',
  'clouds',
  'wind',
  'earthquakes',
  'disasters',
  'air_quality',
  'wildfires',
];

export interface ShortcutActions {
  /** Ordered layer ids; index i is toggled by number key i+1. */
  shortcutLayers: LayerId[];
  toggleLayer: (layerId: LayerId) => void;
  backToLayer: () => void;
  closePanel: () => void;
  closeSettings: () => void;
  /** Opens Settings for `?` (part of the single-key map). */
  openSettings?: () => void;
  toggleRotation: () => void;
  hasSelection: boolean;
  hasActiveLayer: boolean;
  isSettingsOpen: boolean;
  /**
   * Master switch for the character-key map (`1..8`, `Space`, `?`), the
   * Settings → Shortcuts toggle (PRD U-04 / P1-18, WCAG 2.1.4). `Esc` and
   * the typing blur are always active: they only ever back out, never
   * announce themselves as shortcuts.
   */
  singleKeyShortcuts?: boolean;
}

/**
 * Global keyboard shortcuts, separated from App's data-fetching state so
 * the mapping is independently testable (Phase 9).
 *
 * Order of guards (T3.10): typing → key-repeat → open modal → modifier
 * chord → character map → Escape. Escape backs out selection → panel →
 * settings, but an open Settings dialog owns Escape exclusively: closing
 * it must never also back out a layer or selection behind the modal.
 */
export function useKeyboardShortcuts(actions: ShortcutActions) {
  const {
    shortcutLayers,
    toggleLayer,
    backToLayer,
    closePanel,
    closeSettings,
    openSettings,
    toggleRotation,
    hasSelection,
    hasActiveLayer,
    isSettingsOpen,
    singleKeyShortcuts = true,
  } = actions;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;

      // 1. Text entry owns every key except Escape, which blurs it.
      if (isTypingTarget(target)) {
        if (e.key === 'Escape' && !e.repeat) target?.blur();
        return;
      }

      // 2. Holding a key must never rapid-fire toggles/refetches.
      if (e.repeat) return;

      // 3. An open modal owns Escape and stands above every app surface.
      if (isSettingsOpen) {
        if (e.key === 'Escape') closeSettings();
        return;
      }

      // 4. Ctrl/Cmd/Alt chords belong to the browser/OS, not this map.
      if (hasShortcutModifier(e)) return;

      // 5. Single-key map (switchable off in Settings).
      if (singleKeyShortcuts) {
        if (e.key >= '1' && e.key <= String(shortcutLayers.length)) {
          const idx = parseInt(e.key, 10) - 1;
          if (shortcutLayers[idx]) {
            toggleLayer(shortcutLayers[idx]);
          }
        }

        if (e.key === '?') {
          e.preventDefault();
          openSettings?.();
          return;
        }

        // Space activates whatever has focus (button, switch, tab, rail
        // item) — only the globe's idle canvas may pause rotation with it.
        if (e.key === ' ') {
          if (isActivatableTarget(target)) return;
          e.preventDefault();
          toggleRotation();
        }
      }

      // 6. Escape backs out, deepest surface first.
      if (e.key === 'Escape') {
        if (hasSelection) {
          backToLayer();
        } else if (hasActiveLayer) {
          closePanel();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    shortcutLayers,
    toggleLayer,
    backToLayer,
    closePanel,
    closeSettings,
    openSettings,
    toggleRotation,
    hasSelection,
    hasActiveLayer,
    isSettingsOpen,
    singleKeyShortcuts,
  ]);
}
