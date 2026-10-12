/**
 * T3.17 `useSingleKeyShortcuts` ownership tests: default-on preference,
 * persistence round-trip, hydration-safe restore, and storage-failure
 * degradation. No app shell — hook harness only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSingleKeyShortcuts } from '@/components/app/useSingleKeyShortcuts';

const FLAG = 'sentinel:single-key-shortcuts:v1';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('single-key shortcut preference', () => {
  it('is on by default and persists the switch off and on', () => {
    const { result } = renderHook(() => useSingleKeyShortcuts());
    expect(result.current.singleKeyShortcuts).toBe(true);

    act(() => {
      result.current.setSingleKeyShortcuts(false);
    });
    expect(result.current.singleKeyShortcuts).toBe(false);
    expect(window.localStorage.getItem(FLAG)).toBe('0');

    act(() => {
      result.current.setSingleKeyShortcuts(true);
    });
    expect(result.current.singleKeyShortcuts).toBe(true);
    expect(window.localStorage.getItem(FLAG)).toBe('1');
  });

  it('restores a stored off-switch after hydration', () => {
    window.localStorage.setItem(FLAG, '0');
    const { result } = renderHook(() => useSingleKeyShortcuts());
    expect(result.current.singleKeyShortcuts).toBe(false);
  });

  it('defaults on when storage is unreadable and keeps session state on write failure', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const first = renderHook(() => useSingleKeyShortcuts());
    expect(first.result.current.singleKeyShortcuts).toBe(true);
    first.unmount();
    vi.restoreAllMocks();

    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const second = renderHook(() => useSingleKeyShortcuts());
    act(() => {
      second.result.current.setSingleKeyShortcuts(false);
    });
    expect(second.result.current.singleKeyShortcuts).toBe(false);
  });
});
