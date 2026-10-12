import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { hasShortcutModifier, isActivatableTarget, isModalOpen, isTypingTarget } from './keyboard';

function keyEvent(init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: '1', ...init });
}

describe('isTypingTarget', () => {
  it('matches text-entry surfaces', () => {
    render(
      <>
        <input aria-label="text" />
        <textarea aria-label="area" />
        <select aria-label="select">
          <option value="a">a</option>
        </select>
      </>,
    );
    expect(isTypingTarget(document.querySelector('input'))).toBe(true);
    expect(isTypingTarget(document.querySelector('textarea'))).toBe(true);
    expect(isTypingTarget(document.querySelector('select'))).toBe(true);
  });

  it('does not match body, window, or plain elements', () => {
    render(<div id="plain">x</div>);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
    expect(isTypingTarget(document.getElementById('plain'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('hasShortcutModifier', () => {
  it('flags Ctrl/Cmd/Alt chords as browser-owned', () => {
    expect(hasShortcutModifier(keyEvent({ ctrlKey: true }))).toBe(true);
    expect(hasShortcutModifier(keyEvent({ metaKey: true }))).toBe(true);
    expect(hasShortcutModifier(keyEvent({ altKey: true }))).toBe(true);
    expect(hasShortcutModifier(keyEvent())).toBe(false);
    // Shift alone does not make a chord: `?` is Shift+/ by design.
    expect(hasShortcutModifier(keyEvent({ shiftKey: true }))).toBe(false);
  });
});

describe('isActivatableTarget', () => {
  it('matches native and ARIA activation targets', () => {
    render(
      <>
        <button type="button">go</button>
        <div role="switch" aria-checked="false">on</div>
        <div role="tab">tab</div>
        <a href="#x">link</a>
      </>,
    );
    const [button, sw, tab, link] = Array.from(
      document.querySelectorAll('button, [role="switch"], [role="tab"], a'),
    );
    expect(isActivatableTarget(button ?? null)).toBe(true);
    expect(isActivatableTarget(sw ?? null)).toBe(true);
    expect(isActivatableTarget(tab ?? null)).toBe(true);
    expect(isActivatableTarget(link ?? null)).toBe(true);
  });

  it('does not match plain text or the window', () => {
    render(<p id="text">plain</p>);
    expect(isActivatableTarget(document.getElementById('text'))).toBe(false);
    expect(isActivatableTarget(window)).toBe(false);
    expect(isActivatableTarget(null)).toBe(false);
  });
});

describe('isModalOpen', () => {
  it('reports true only while a dialog is mounted', () => {
    expect(isModalOpen()).toBe(false);
    render(
      <div role="dialog" aria-label="modal">
        content
      </div>,
    );
    expect(isModalOpen()).toBe(true);
  });
});
