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
    active: 'dotted' | 'webgl' | 'webgpu' | 'cesium' | 'loading',
    source: 'automatic' | 'forced' = 'automatic',
  ) => ({
    active,
    detail:
      active === 'dotted'
        ? 'ready · 1076 land dots'
        : active === 'cesium'
          ? 'ready · GIBS true-color (no token)'
          : 'starting globe…',
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

  it('names the Cesium Earth renderer instead of leaving the dock on Starting…', () => {
    // Regression: RENDERER_NAMES lacked a `cesium` key, so the dock badge
    // fell through to "Starting…" while the Cesium globe was running.
    render(
      <StatusDock
        coordinates={null}
        activeLayer={null}
        dataCount={0}
        rendererInfo={info('cesium', 'forced')}
      />,
    );
    const badge = screen.getByRole('status', {
      name: 'Renderer: Cesium Earth · forced · ready · GIBS true-color (no token)',
    });
    expect(badge).toHaveTextContent('Cesium Earth · forced');
    expect(badge).not.toHaveTextContent('Starting…');
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

// T3.10: provenance updates used to announce twice (header chip + dock
// chip) on top of the panel banner — three live regions for one change.
// The banner is now the single announcer; the dock chip is a visual copy.
describe('StatusDock provenance chip (T3.10)', () => {
  it('keeps provenance out of the live regions while leaving it readable', () => {
    render(
      <StatusDock
        coordinates={null}
        activeLayer="earthquakes"
        dataCount={3}
        dataStatus={{ status: 'live', source: 'USGS', fetched_at: '2026-10-11T00:00:00Z' }}
      />,
    );

    // The renderer badge is the only status role left in the dock.
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveAttribute('aria-label', expect.stringContaining('Renderer'));

    // The provenance text itself is still present for browse-mode reading.
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('USGS')).toBeInTheDocument();
  });

  it('exposes cursor coordinates as accessible text instead of a generic aria-label', () => {
    render(<StatusDock coordinates={{ lat: 12.5, lon: -45.25 }} activeLayer={null} dataCount={0} />);
    expect(screen.getByText(/Cursor coordinates/)).toBeInTheDocument();
  });
});

describe('StatusDock responsive layout (T3.9)', () => {
  it('uses responsive footer padding and gap', () => {
    render(
      <StatusDock
        coordinates={null}
        activeLayer="earthquakes"
        dataCount={10}
        dataStatus={{ status: 'live', source: 'USGS', fetched_at: '2026-10-11T00:00:00Z' }}
        rendererInfo={{ active: 'dotted', detail: 'ready', textures: { loaded: 0, total: 0 }, source: 'automatic' }}
      />,
    );
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveClass('gap-2.5');
    expect(footer).toHaveClass('px-2.5');
    expect(footer).toHaveClass('sm:px-3');
    expect(footer).toHaveClass('md:px-4');
  });

  it('shows provenance chip at md breakpoint', () => {
    render(
      <StatusDock
        coordinates={null}
        activeLayer="earthquakes"
        dataCount={10}
        dataStatus={{ status: 'live', source: 'USGS', fetched_at: '2026-10-11T00:00:00Z' }}
      />,
    );
    const chip = screen.getByText('LIVE').parentElement;
    expect(chip).toHaveClass('md:inline-flex');
  });

  it('shows active layer name at sm with constrained max-width', () => {
    render(
      <StatusDock
        coordinates={null}
        activeLayer="earthquakes"
        dataCount={10}
      />,
    );
    const layerName = screen.getByText('earthquakes').parentElement;
    expect(layerName).toHaveClass('max-w-[140px]');
  });

  it('shows UTC clock at md breakpoint', () => {
    render(
      <StatusDock
        coordinates={null}
        activeLayer="earthquakes"
        dataCount={10}
      />,
    );
    const clock = screen.getByLabelText('Current UTC time');
    expect(clock).toHaveClass('md:block');
  });

  it('shows renderer short name at sm breakpoint', () => {
    render(
      <StatusDock
        coordinates={null}
        activeLayer="earthquakes"
        dataCount={10}
        rendererInfo={{ active: 'dotted', detail: 'ready', textures: { loaded: 0, total: 0 }, source: 'automatic' }}
      />,
    );
    const rendererText = screen.getByText('Dotted Earth · automatic');
    expect(rendererText).toHaveClass('sm:inline');
  });

  it('left zone uses min-w-0 and responsive gap', () => {
    render(
      <StatusDock
        coordinates={null}
        activeLayer="earthquakes"
        dataCount={10}
        dataStatus={{ status: 'live', source: 'USGS', fetched_at: '2026-10-11T00:00:00Z' }}
      />,
    );
    const leftZone = screen.getByText('earthquakes').parentElement?.parentElement;
    expect(leftZone).toHaveClass('min-w-0');
    expect(leftZone).toHaveClass('gap-2');
  });
});
