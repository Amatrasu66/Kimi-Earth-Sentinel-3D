import { useEffect } from 'react';
import type { LayerId } from '@/types';

export interface ShortcutActions {
  /** Ordered layer ids; index i is toggled by number key i+1. */
  shortcutLayers: LayerId[];
  toggleLayer: (layerId: LayerId) => void;
  backToLayer: () => void;
  closePanel: () => void;
  closeSettings: () => void;
  toggleRotation: () => void;
  hasSelection: boolean;
  hasActiveLayer: boolean;
  isSettingsOpen: boolean;
}

/**
 * Global keyboard shortcuts, separated from App's data-fetching state so
 * the mapping is independently testable (Phase 9).
 *
 * - `1..n` toggle layers, `Space` pauses rotation, `Esc` backs out.
 * - Shortcuts are ignored while typing in inputs (Esc blurs instead).
 */
export function useKeyboardShortcuts(actions: ShortcutActions) {
  const {
    shortcutLayers,
    toggleLayer,
    backToLayer,
    closePanel,
    closeSettings,
    toggleRotation,
    hasSelection,
    hasActiveLayer,
    isSettingsOpen,
  } = actions;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (typing) {
        if (e.key === 'Escape') (target as HTMLElement).blur();
        return;
      }

      if (e.key >= '1' && e.key <= String(shortcutLayers.length)) {
        const idx = parseInt(e.key) - 1;
        if (shortcutLayers[idx]) {
          toggleLayer(shortcutLayers[idx]);
        }
      }

      if (e.key === 'Escape') {
        if (hasSelection) {
          backToLayer();
        } else if (hasActiveLayer) {
          closePanel();
        } else if (isSettingsOpen) {
          closeSettings();
        }
      }

      if (e.key === ' ') {
        e.preventDefault();
        toggleRotation();
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
    toggleRotation,
    hasSelection,
    hasActiveLayer,
    isSettingsOpen,
  ]);
}
