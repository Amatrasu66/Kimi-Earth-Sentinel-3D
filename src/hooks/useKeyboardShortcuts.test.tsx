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
    openSettings: vi.fn(),
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

  // T3.10: Escape backs out only one surface per press, and an open modal
  // owns Escape exclusively — closing Settings must never also clear the
  // selection or panel behind the dialog.
  it('gives an open Settings dialog exclusive ownership of Escape', () => {
    const { actions } = setup({ isSettingsOpen: true, hasSelection: true, hasActiveLayer: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(actions.closeSettings).toHaveBeenCalledTimes(1);
    expect(actions.backToLayer).not.toHaveBeenCalled();
    expect(actions.closePanel).not.toHaveBeenCalled();
  });

  it('keeps the single-key map inert while Settings is open', () => {
    const { actions } = setup({ isSettingsOpen: true, hasActiveLayer: true });
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: '?' });
    expect(actions.toggleLayer).not.toHaveBeenCalled();
    expect(actions.toggleRotation).not.toHaveBeenCalled();
    expect(actions.openSettings).not.toHaveBeenCalled();
  });

  // T3.10 (WCAG 2.1.1): Ctrl/Cmd/Alt + a character belongs to the browser
  // or OS (Ctrl+1 switches tabs) and must never run the app's map.
  it('ignores modifier chords', () => {
    const { actions } = setup();
    fireEvent.keyDown(window, { key: '2', ctrlKey: true });
    fireEvent.keyDown(window, { key: ' ', altKey: true });
    expect(actions.toggleLayer).not.toHaveBeenCalled();
    expect(actions.toggleRotation).not.toHaveBeenCalled();
  });

  // T3.10: Space activates whatever has focus; running the globe shortcut
  // as well would double-toggle the focused control (net no change).
  it('does not hijack Space when the focus target activates natively', () => {
    const { actions } = setup();
    render(<button type="button">Settings toggle</button>);
    const button = document.querySelector('button') as HTMLButtonElement;
    button.focus();
    fireEvent.keyDown(button, { key: ' ' });
    expect(actions.toggleRotation).not.toHaveBeenCalled();
  });

  it('ignores key repeat so held keys never rapid-toggle', () => {
    const { actions } = setup();
    fireEvent.keyDown(window, { key: '2', repeat: true });
    fireEvent.keyDown(window, { key: ' ', repeat: true });
    expect(actions.toggleLayer).not.toHaveBeenCalled();
    expect(actions.toggleRotation).not.toHaveBeenCalled();
  });

  it('opens Settings on ?', () => {
    const { actions } = setup();
    fireEvent.keyDown(window, { key: '?' });
    expect(actions.openSettings).toHaveBeenCalledTimes(1);
  });

  // T3.10 (PRD U-04 / P1-18): the Settings switch turns off the character
  // map; Escape and typing-blur keep working because they only back out.
  it('honours the single-key shortcuts switch', () => {
    const { actions, rerender } = setup({
      singleKeyShortcuts: false,
      hasActiveLayer: true,
    });
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: '?' });
    expect(actions.toggleLayer).not.toHaveBeenCalled();
    expect(actions.toggleRotation).not.toHaveBeenCalled();
    expect(actions.openSettings).not.toHaveBeenCalled();

    rerender({ a: { ...actions, hasActiveLayer: false } });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(actions.backToLayer).not.toHaveBeenCalled();
    expect(actions.closePanel).not.toHaveBeenCalled();
  });

  it('keeps Escape active when single-key shortcuts are off', () => {
    const { actions } = setup({ singleKeyShortcuts: false, hasActiveLayer: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(actions.closePanel).toHaveBeenCalledTimes(1);
  });
});
