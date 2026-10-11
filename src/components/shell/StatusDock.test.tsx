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

describe('StatusDock renderer badge (GLOBE-1)', () => {
  const info = (
    active: 'dotted' | 'webgl' | 'webgpu' | 'loading',
    source: 'automatic' | 'forced' = 'automatic',
  ) => ({
    active,
    detail: active === 'dotted' ? 'ready · 1076 land dots' : 'starting globe…',
    textures: { loaded: 0, total: 0 },
    source,
  });

  it('names the default dotted Earth renderer instead of mislabelling it', () => {
    render(
      <StatusDock
        coordinates={null}
        activeLayer={null}
        dataCount={0}
        rendererInfo={info('dotted')}
      />,
    );
    const badge = screen.getByRole('status', {
      name: 'Renderer: Dotted Earth · automatic · ready · 1076 land dots',
    });
    expect(badge).toHaveTextContent('Dotted Earth · automatic');
  });

  it('still distinguishes a forced 3D override', () => {
    render(
      <StatusDock
        coordinates={null}
        activeLayer={null}
        dataCount={0}
        rendererInfo={info('webgl', 'forced')}
      />,
    );
    expect(screen.getByRole('status', { name: /WebGL · forced/ })).toBeInTheDocument();
  });

  it('reads Starting… while the renderer is unresolved', () => {
    render(
      <StatusDock
        coordinates={null}
        activeLayer={null}
        dataCount={0}
        rendererInfo={info('loading')}
      />,
    );
    expect(screen.getByRole('status', { name: /Renderer: Renderer/ })).toHaveTextContent(
      'Starting…',
    );
  });
});
