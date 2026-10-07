import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import StatusDock from '@/components/shell/StatusDock';

const T0 = new Date('2026-10-06T21:47:29.000Z');
const T1 = new Date('2026-10-06T21:47:35.000Z');

function dock() {
  return <StatusDock coordinates={null} activeLayer={null} dataCount={0} />;
}

describe('StatusDock UTC clock hydration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('produces identical SSR markup at different wall-clock times', () => {
    // renderToString runs no effects — the exact SSR path. A clock value
    // leaking from render (useState initializer, module scope, Date.now())
    // would make these differ and break hydration.
    vi.setSystemTime(T0);
    const first = renderToString(dock());
    vi.setSystemTime(T1);
    const second = renderToString(dock());
    expect(first).toBe(second);
    expect(first).not.toContain('2026-10-06');
    expect(first).toContain('— —');
  });

  it('shows the live UTC clock after client mount and keeps ticking', () => {
    vi.setSystemTime(T0);
    render(dock());
    const clock = screen.getByLabelText('Current UTC time');
    expect(clock).toHaveTextContent('2026-10-06 21:47:29 UTC');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(clock).toHaveTextContent('2026-10-06 21:47:31 UTC');
  });

  it('keeps informational semantics: aria-live off', () => {
    vi.setSystemTime(T0);
    render(dock());
    expect(screen.getByLabelText('Current UTC time')).toHaveAttribute('aria-live', 'off');
  });
});
