/**
 * Phase 3 §10.3 `useGlobeGrid` ownership tests: default-off preference,
 * persistence round-trip, hydration-safe restore, and storage-failure
 * degradation. No app shell — hook harness only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGlobeGrid } from '@/components/app/useGlobeGrid';

const FLAG = 'sentinel:globe-grid:v1';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('geographic grid preference (Phase 3)', () => {
  it('is off by default and persists the switch on and off', () => {
    const { result } = renderHook(() => useGlobeGrid());
    expect(result.current.globeGridVisible).toBe(false);

    act(() => {
      result.current.setGlobeGridVisible(true);
    });
    expect(result.current.globeGridVisible).toBe(true);
    expect(window.localStorage.getItem(FLAG)).toBe('1');

    act(() => {
      result.current.setGlobeGridVisible(false);
    });
    expect(result.current.globeGridVisible).toBe(false);
    expect(window.localStorage.getItem(FLAG)).toBe('0');
  });

  it('restores a stored on-switch after hydration', () => {
    window.localStorage.setItem(FLAG, '1');
    const { result } = renderHook(() => useGlobeGrid());
    expect(result.current.globeGridVisible).toBe(true);
  });

  it('treats malformed values as off', () => {
    window.localStorage.setItem(FLAG, 'yes');
    const { result } = renderHook(() => useGlobeGrid());
    expect(result.current.globeGridVisible).toBe(false);
  });

  it('defaults off when storage is unreadable and keeps session state on write failure', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const first = renderHook(() => useGlobeGrid());
    expect(first.result.current.globeGridVisible).toBe(false);
    first.unmount();
    vi.restoreAllMocks();

    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const second = renderHook(() => useGlobeGrid());
    act(() => {
      second.result.current.setGlobeGridVisible(true);
    });
    expect(second.result.current.globeGridVisible).toBe(true);
  });
});
