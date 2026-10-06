import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
