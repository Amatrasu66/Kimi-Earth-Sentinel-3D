/**
 * T4.6 `useLowPowerMode` ownership tests: auto default, persistence
 * round-trip, hydration-safe restore of stored/malformed values, and
 * storage-failure degradation. No app shell — hook harness only.
 *
 * Reduced-motion independence is pinned at the policy level
 * (`low-power.test.ts`) and by the renderers consuming both values
 * separately; this hook never touches the motion preference.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { useLowPowerMode } from '@/components/app/useLowPowerMode';

const FLAG = 'sentinel:low-power:v1';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function Probe() {
  const { preference, lowPowerActive } = useLowPowerMode();
  return createElement('span', {
    'data-preference': preference,
    'data-active': String(lowPowerActive),
  });
}

describe('low-power preference', () => {
  it('is auto by default and persists each mode', () => {
    const { result } = renderHook(() => useLowPowerMode());
    expect(result.current.preference).toBe('auto');

    act(() => {
      result.current.setPreference('on');
    });
    expect(result.current.preference).toBe('on');
    expect(window.localStorage.getItem(FLAG)).toBe('on');

    act(() => {
      result.current.setPreference('off');
    });
    expect(result.current.preference).toBe('off');
    expect(window.localStorage.getItem(FLAG)).toBe('off');
  });

  it('manual On reports active even where Auto would stay full quality', () => {
    window.localStorage.setItem(FLAG, 'on');
    const { result } = renderHook(() => useLowPowerMode());
    expect(result.current.preference).toBe('on');
    expect(result.current.lowPowerActive).toBe(true);
  });

  it('manual Off reports inactive', () => {
    window.localStorage.setItem(FLAG, 'off');
    const { result } = renderHook(() => useLowPowerMode());
    expect(result.current.preference).toBe('off');
    expect(result.current.lowPowerActive).toBe(false);
  });

  it('restores a stored mode after hydration and falls back on malformed values', () => {
    window.localStorage.setItem(FLAG, 'on');
    expect(renderHook(() => useLowPowerMode()).result.current.preference).toBe('on');

    window.localStorage.setItem(FLAG, 'nonsense');
    expect(renderHook(() => useLowPowerMode()).result.current.preference).toBe('auto');
  });

  it('defaults to auto when storage is unreadable and keeps session state on write failure', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const first = renderHook(() => useLowPowerMode());
    expect(first.result.current.preference).toBe('auto');
    first.unmount();
    vi.restoreAllMocks();

    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const second = renderHook(() => useLowPowerMode());
    act(() => {
      second.result.current.setPreference('on');
    });
    expect(second.result.current.preference).toBe('on');
    expect(second.result.current.lowPowerActive).toBe(true);
  });

  it('renders deterministically on the server (inactive, auto)', () => {
    const html = renderToString(createElement(Probe));
    expect(html).toContain('data-preference="auto"');
    expect(html).toContain('data-active="false"');
  });
});
