/**
 * Phase 4 `useImageryOpacity` ownership tests: registry defaults,
 * validated persistence round-trip, hydration-safe restore, malformed
 * storage degradation, and clamping. No app shell — hook harness only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useImageryOpacity } from '@/components/app/useImageryOpacity';

const BASE_KEY = 'sentinel:imagery-base-opacity:v1';
const GRID_KEY = 'sentinel:imagery-grid-opacity:v1';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('imagery opacity preferences (Phase 4)', () => {
  it('defaults to the registry opacities and persists slider values', () => {
    const { result } = renderHook(() => useImageryOpacity());
    expect(result.current.baseOpacity).toBe(1);
    expect(result.current.gridOpacity).toBe(1);

    act(() => {
      result.current.setBaseOpacity(0.35);
    });
    expect(result.current.baseOpacity).toBeCloseTo(0.35);
    expect(window.localStorage.getItem(BASE_KEY)).toBe('0.35');

    act(() => {
      result.current.setGridOpacity(0.5);
    });
    expect(result.current.gridOpacity).toBeCloseTo(0.5);
    expect(window.localStorage.getItem(GRID_KEY)).toBe('0.5');
  });

  it('restores stored opacities after hydration', () => {
    window.localStorage.setItem(BASE_KEY, '0.25');
    window.localStorage.setItem(GRID_KEY, '0.75');
    const { result } = renderHook(() => useImageryOpacity());
    expect(result.current.baseOpacity).toBeCloseTo(0.25);
    expect(result.current.gridOpacity).toBeCloseTo(0.75);
  });

  it('treats malformed or out-of-range stored values as defaults', () => {
    window.localStorage.setItem(BASE_KEY, 'junk');
    window.localStorage.setItem(GRID_KEY, '2');
    const { result } = renderHook(() => useImageryOpacity());
    // `junk` is unusable; `2` is out of range — both fall back to 1.
    expect(result.current.baseOpacity).toBe(1);
    expect(result.current.gridOpacity).toBe(1);
  });

  it('clamps slider input to the valid range before storing', () => {
    const { result } = renderHook(() => useImageryOpacity());
    act(() => {
      result.current.setBaseOpacity(-3);
    });
    expect(result.current.baseOpacity).toBe(0);
    act(() => {
      result.current.setGridOpacity(99);
    });
    expect(result.current.gridOpacity).toBe(1);
  });

  it('resets both layers to their registry defaults', () => {
    const { result } = renderHook(() => useImageryOpacity());
    act(() => {
      result.current.setBaseOpacity(0.2);
      result.current.setGridOpacity(0.4);
    });
    act(() => {
      result.current.resetImageryOpacity();
    });
    expect(result.current.baseOpacity).toBe(1);
    expect(result.current.gridOpacity).toBe(1);
  });

  it('defaults when storage is unreadable and keeps session state on write failure', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const first = renderHook(() => useImageryOpacity());
    expect(first.result.current.baseOpacity).toBe(1);
    expect(first.result.current.gridOpacity).toBe(1);
    first.unmount();
    vi.restoreAllMocks();

    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const second = renderHook(() => useImageryOpacity());
    act(() => {
      second.result.current.setBaseOpacity(0.3);
    });
    expect(second.result.current.baseOpacity).toBeCloseTo(0.3);
  });
});
