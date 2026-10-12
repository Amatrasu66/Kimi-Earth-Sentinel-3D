/**
 * T3.17 `useFirstRunHint` ownership tests: persisted one-time dismissal,
 * hydration-safe restore, and focus restoration only when focus sat
 * inside the hint. No app shell — hook harness only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFirstRunHint } from '@/components/app/useFirstRunHint';

const FLAG = 'sentinel:first-run-hint-dismissed:v1';

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '';
});

afterEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('first-run hint flag', () => {
  it('starts visible and persists dismissal across mounts', () => {
    const first = renderHook(() => useFirstRunHint(vi.fn()));
    expect(first.result.current.hintDismissed).toBe(false);

    act(() => {
      first.result.current.dismissHint();
    });
    expect(first.result.current.hintDismissed).toBe(true);
    expect(window.localStorage.getItem(FLAG)).toBe('1');
    first.unmount();

    // A fresh mount honors the stored dismissal (client-only read).
    const second = renderHook(() => useFirstRunHint(vi.fn()));
    expect(second.result.current.hintDismissed).toBe(true);
  });

  it('requests workspace focus only when focus sat inside the hint', () => {
    document.body.innerHTML =
      '<main id="sentinel-workspace" tabindex="-1">workspace</main>' +
      '<div role="note" aria-label="Getting started hint"><button id="hint-btn">Dismiss</button></div>' +
      '<button id="outside">x</button>';

    const requestFocus = vi.fn();
    const { result } = renderHook(() => useFirstRunHint(requestFocus));

    (document.getElementById('hint-btn') as HTMLElement).focus();
    act(() => {
      result.current.dismissHint();
    });
    // The hook records the request (application is the focus hook's job —
    // covered in useFocusRestore.test.tsx); focus itself stays put here.
    expect(requestFocus).toHaveBeenCalledWith('workspace');
    expect(document.activeElement).toBe(document.getElementById('hint-btn'));

    requestFocus.mockClear();
    (document.getElementById('outside') as HTMLElement).focus();
    const second = renderHook(() => useFirstRunHint(requestFocus));
    act(() => {
      second.result.current.dismissHint();
    });
    expect(requestFocus).not.toHaveBeenCalled();
  });

  it('degrades to session-only dismissal when storage is unavailable', () => {
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { result } = renderHook(() => useFirstRunHint(vi.fn()));
    act(() => {
      result.current.dismissHint();
    });
    // Session state still updates; nothing is persisted.
    expect(result.current.hintDismissed).toBe(true);
    expect(window.localStorage.getItem(FLAG)).toBeNull();
  });
});
