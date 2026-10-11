import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import DataStatusBanner from '@/components/overlays/DataStatusBanner';
import type { DataStatus } from '@/types';

const live: DataStatus = {
  status: 'live',
  source: 'USGS',
  fetched_at: new Date(Date.now() - 120_000).toISOString(),
};
const simulated: DataStatus = {
  status: 'simulated',
  source: 'USGS',
  fetched_at: new Date().toISOString(),
  message: 'USGS unavailable — showing simulated fallback data.',
};

describe('DataStatusBanner', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders live provenance distinctly from simulated', () => {
    const { rerender } = render(<DataStatusBanner status={live} />);
    expect(screen.getByRole('status')).toHaveTextContent('LIVE');
    expect(screen.getByRole('status')).toHaveTextContent('USGS');

    rerender(<DataStatusBanner status={simulated} />);
    // Simulated must never look like live data.
    expect(screen.getByRole('status')).toHaveTextContent('SIMULATED');
    expect(screen.getByRole('status')).toHaveTextContent(/fallback data/i);
    expect(screen.getByRole('status')).toHaveTextContent(/simulated fallback data/i);
  });

  it('renders stale and unknown states', () => {
    const { rerender } = render(
      <DataStatusBanner status={{ ...live, status: 'stale' }} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('STALE');

    rerender(<DataStatusBanner status={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('UNKNOWN');
  });

  it('hides the message in compact mode', () => {
    render(<DataStatusBanner status={simulated} compact />);
    expect(screen.queryByText(/simulated fallback data/i)).not.toBeInTheDocument();
  });

  it('maps LIVE vs server CACHED only from the meta.cache_hit bit', () => {
    const { rerender } = render(<DataStatusBanner status={live} cacheHit={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('LIVE');

    // Absent bit (e.g. SWR/client cache reads) is still LIVE — never CACHED.
    rerender(<DataStatusBanner status={live} cacheHit={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('LIVE');

    rerender(<DataStatusBanner status={live} cacheHit={true} />);
    expect(screen.getByRole('status')).toHaveTextContent('CACHED');
    expect(screen.getByRole('status')).not.toHaveTextContent('LIVE');
  });

  it('never relabels explicit STALE or SIMULATED as CACHED', () => {
    const { rerender } = render(
      <DataStatusBanner status={{ ...live, status: 'stale' }} cacheHit={true} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('STALE');

    rerender(<DataStatusBanner status={simulated} cacheHit={true} />);
    expect(screen.getByRole('status')).toHaveTextContent('SIMULATED');
  });

  it('renders UNAVAILABLE and ERROR distinctly', () => {
    const { rerender } = render(
      <DataStatusBanner status={{ ...live, status: 'unavailable' }} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('UNAVAILABLE');

    // Failed request with no payload: ERROR, never a success state.
    rerender(<DataStatusBanner status={null} error="Request failed" />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('ERROR');
    expect(banner).toHaveTextContent('Request failed');
    expect(banner).toHaveAttribute('aria-label', 'Data status: ERROR');
  });

  it('keeps usable data during same-key revalidation (error + payload shows the payload)', () => {
    render(<DataStatusBanner status={live} error="Request failed" />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('LIVE');
    expect(banner).not.toHaveTextContent('ERROR');
  });

  it('shows an explicit unknown-age state for missing or invalid fetched_at', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    const { rerender } = render(
      <DataStatusBanner
        status={{ status: 'live', source: 'USGS', fetched_at: '' } as DataStatus}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('age unknown');

    rerender(
      <DataStatusBanner
        status={{ status: 'live', source: 'USGS', fetched_at: 'not-a-date' } as DataStatus}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('age unknown');
  });

  it('derives age only from fetched_at (never request time) with deterministic buckets', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    render(
      <DataStatusBanner
        status={{ status: 'live', source: 'USGS', fetched_at: '2026-06-01T11:58:00Z' }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('2 min ago');
  });

  it('falls back to an explicit unknown source instead of inventing one', () => {
    const { rerender } = render(
      <DataStatusBanner status={{ ...live, source: '' } as DataStatus} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Unknown source');

    rerender(<DataStatusBanner status={{ ...live, source: null } as unknown as DataStatus} />);
    expect(screen.getByRole('status')).toHaveTextContent('Unknown source');
  });

  it('never retains the previous layer provenance after a switch', () => {
    const { rerender } = render(<DataStatusBanner status={live} />);
    expect(screen.getByRole('status')).toHaveTextContent('LIVE');

    // New key, no data yet: UNKNOWN with no trace of the old source.
    rerender(<DataStatusBanner status={null} />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('UNKNOWN');
    expect(banner).not.toHaveTextContent('USGS');
  });

  it('renders deterministic SSR markup with no wall-clock age (hydration-safe)', () => {
    vi.useFakeTimers();
    const fixed: DataStatus = {
      status: 'live',
      source: 'USGS',
      fetched_at: '2026-06-01T11:58:00Z',
    };
    // renderToString runs no effects — the exact SSR path. A Date.now()
    // leak during render would make these differ and break hydration.
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    const first = renderToString(<DataStatusBanner status={fixed} />);
    vi.setSystemTime(new Date('2026-06-01T12:05:00Z'));
    const second = renderToString(<DataStatusBanner status={fixed} />);
    expect(first).toBe(second);
    // Pre-mount the age slot is an honest pending marker, never a computed age.
    expect(first).toContain('…');
    expect(first).not.toMatch(/\d+ (s|min|h|d) ago/);
  });

  it('refreshes age on a modest cadence, not a high-frequency timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const { unmount } = render(<DataStatusBanner status={live} />);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('starts no timer where no age is shown', () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    render(<DataStatusBanner status={simulated} />);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
