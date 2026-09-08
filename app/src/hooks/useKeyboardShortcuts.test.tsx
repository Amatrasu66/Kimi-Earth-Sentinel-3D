import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook } from '@testing-library/react';
import { useKeyboardShortcuts, type ShortcutActions } from './useKeyboardShortcuts';
import type { LayerId } from '@/types';

const LAYERS: LayerId[] = ['temperature', 'earthquakes'];

function setup(overrides: Partial<ShortcutActions> = {}) {
  const actions: ShortcutActions = {
    shortcutLayers: LAYERS,
    toggleLayer: vi.fn(),
    backToLayer: vi.fn(),
    closePanel: vi.fn(),
    closeSettings: vi.fn(),
    toggleRotation: vi.fn(),
    hasSelection: false,
    hasActiveLayer: false,
    isSettingsOpen: false,
    ...overrides,
  };
  const utils = renderHook(({ a }) => useKeyboardShortcuts(a), {
    initialProps: { a: actions },
  });
  return { actions, ...utils };
}

describe('useKeyboardShortcuts', () => {
  it('maps number keys to layers in order', () => {
    const { actions } = setup();
    fireEvent.keyDown(window, { key: '2' });
    expect(actions.toggleLayer).toHaveBeenCalledWith('earthquakes');
  });

  it('toggles rotation on Space', () => {
    const { actions } = setup();
    fireEvent.keyDown(window, { key: ' ' });
    expect(actions.toggleRotation).toHaveBeenCalledTimes(1);
  });

  it('backs out in priority order on Escape', () => {
    const { actions, rerender } = setup({ hasSelection: true, hasActiveLayer: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(actions.backToLayer).toHaveBeenCalledTimes(1);

    rerender({ a: { ...actions, hasSelection: false, hasActiveLayer: true } });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(actions.closePanel).toHaveBeenCalledTimes(1);
  });

  it('ignores shortcuts while typing, but blurs on Escape', () => {
    const { actions } = setup();
    render(<input aria-label="typing-box" />);
    const input = document.querySelector('input') as HTMLInputElement;
    input.focus();
    const blur = vi.spyOn(input, 'blur');
    fireEvent.keyDown(input, { key: '5' });
    expect(actions.toggleLayer).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(blur).toHaveBeenCalledTimes(1);
  });
});
