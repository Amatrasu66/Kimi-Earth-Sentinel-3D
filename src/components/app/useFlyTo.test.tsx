/**
 * T3.17 `useFlyTo` ownership tests: invalid coordinates are dropped,
 * valid destinations dispatch with an incrementing retrigger key.
 */
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFlyTo } from '@/components/app/useFlyTo';

describe('fly-to destination', () => {
  it('starts with no flight and drops invalid coordinates', () => {
    const { result } = renderHook(() => useFlyTo());
    expect(result.current.flyTo).toBeNull();

    act(() => {
      result.current.flyToLocation(95, 0);
    });
    act(() => {
      result.current.flyToLocation(0, 200);
    });
    act(() => {
      result.current.flyToLocation(Number.NaN, Number.NaN);
    });
    expect(result.current.flyTo).toBeNull();
  });

  it('dispatches valid destinations with an incrementing key', () => {
    const { result } = renderHook(() => useFlyTo());
    act(() => {
      result.current.flyToLocation(35.6, 139.6);
    });
    expect(result.current.flyTo).toEqual({ lat: 35.6, lon: 139.6, key: 1 });

    // Same destination retriggers via the key.
    act(() => {
      result.current.flyToLocation(35.6, 139.6);
    });
    expect(result.current.flyTo).toEqual({ lat: 35.6, lon: 139.6, key: 2 });
  });
});
