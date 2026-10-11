import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { DEFAULT_SUN_DIRECTION } from '@/components/globe/earthConfig';
import { getSunDirection } from '@/lib/solar';
import { SUN_DIRECTION_UPDATE_INTERVAL_MS, useSunDirection } from './useSunDirection';

const T0 = new Date('2026-06-21T12:00:00.000Z');

function Probe() {
  const sun = useSunDirection();
  return <span data-testid="sun">{JSON.stringify(sun)}</span>;
}

function readProbe(): [number, number, number] {
  return JSON.parse(screen.getByTestId('sun').textContent ?? 'null');
}

describe('useSunDirection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses a single 60 s-or-less-frequent update interval', () => {
    expect(SUN_DIRECTION_UPDATE_INTERVAL_MS).toBe(60_000);
  });

  it('renders deterministically before mount (SSR-safe, no render-time clock)', () => {
    // renderToString runs no effects — the exact SSR path. A `new Date()`
    // leaking from render state, module scope, or the state initializer
    // would make these differ and break hydration.
    vi.setSystemTime(new Date('2026-03-20T12:00:00Z'));
    const first = renderToString(<Probe />);
    vi.setSystemTime(new Date('2026-12-21T12:00:00Z'));
    const second = renderToString(<Probe />);
    expect(first).toBe(second);
    expect(first).toContain(JSON.stringify(DEFAULT_SUN_DIRECTION));
  });

  it('computes the live UTC position after client mount', () => {
    vi.setSystemTime(T0);
    render(<Probe />);
    expect(readProbe()).toEqual(getSunDirection(T0));
    expect(readProbe()).not.toEqual([...DEFAULT_SUN_DIRECTION]);
  });

  it('refreshes on the 60 s interval and cleans it up on unmount', () => {
    vi.setSystemTime(T0);
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = render(<Probe />);
    expect(setIntervalSpy).toHaveBeenCalledOnce();
    expect(setIntervalSpy.mock.calls[0][1]).toBe(SUN_DIRECTION_UPDATE_INTERVAL_MS);

    // 59 s: no tick yet — unrelated UI is not re-rendered every second.
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(readProbe()).toEqual(getSunDirection(T0));

    // 60 s with the wall clock advanced: the shared tuple follows the Sun.
    // (advanceTimersByTime moves the mocked clock, so the tick fires at
    // exactly T0 + 60 s — matching t1 to the millisecond.)
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    const t1 = new Date(T0.getTime() + 60_000);
    expect(readProbe()).toEqual(getSunDirection(t1));

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
    expect(clearIntervalSpy.mock.calls[0][0]).toBe(setIntervalSpy.mock.results[0].value);
  });
});
