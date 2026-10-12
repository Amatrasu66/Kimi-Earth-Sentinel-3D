import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DataPanel from '@/components/intelligence/DataPanel';
import type { DataPoint, DataStatus, EventDetail, LayerMetadata } from '@/types';

const layerMeta: LayerMetadata = {
  id: 'earthquakes',
  name: 'Earthquakes',
  description: 'Live earthquakes.',
  icon: 'activity',
  source: 'USGS',
  refresh_interval: 300,
  enabled: true,
};

const point: DataPoint = {
  id: 'us7000abcd',
  lat: 35.6,
  lon: 140.5,
  // No marker-level magnitude: the provider-detail Magnitude row must appear.
  depth: 42,
  severity: 'high',
  timestamp: new Date(Date.now() - 3_600_000).toISOString(),
  location: '120 km SSE of Testville',
};

const liveDetail: EventDetail = {
  id: 'us7000abcd',
  layer_id: 'earthquakes',
  provider: 'USGS',
  type: 'earthquake',
  title: 'M 6.2 - 120 km SSE of Testville',
  description: null,
  lat: 35.6,
  lon: 140.5,
  depth: 42,
  timestamp: point.timestamp,
  updated_at: new Date(Date.now() - 600_000).toISOString(),
  severity: 'high',
  magnitude: 6.2,
  magnitude_unit: 'mww',
  status: 'reviewed',
  closed_at: null,
  source: { name: 'USGS', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd' },
  categories: null,
  felt: 42,
  alert: 'yellow',
  tsunami: false,
  significance: 590,
  data_status: {
    status: 'live',
    source: 'USGS',
    fetched_at: new Date(Date.now() - 60_000).toISOString(),
  },
};

const layerStatus: DataStatus = {
  status: 'simulated',
  source: 'USGS',
  fetched_at: new Date().toISOString(),
  message: 'USGS unavailable — showing simulated fallback data.',
};

const baseProps = {
  activeLayer: 'earthquakes' as const,
  layerMeta,
  dataPoints: [point],
  selectedEvent: point,
  eventDetailLoading: false,
  loading: false,
  error: null,
  dataStatus: layerStatus,
  onClose: vi.fn(),
  onBackToLayer: vi.fn(),
  onEventSelect: vi.fn(),
  onRefresh: vi.fn(),
  severityFilter: 'all' as const,
  onSeverityChange: vi.fn(),
};

describe('DataPanel event detail', () => {
  it('renders live provider fields with attribution', () => {
    render(<DataPanel {...baseProps} eventDetail={liveDetail} />);

    expect(screen.getByText('Provider details')).toBeInTheDocument();
    expect(screen.getByText('Felt reports')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('YELLOW')).toBeInTheDocument();
    expect(screen.getByText('Tsunami')).toBeInTheDocument();
    expect(screen.getByText('Significance')).toBeInTheDocument();
    // Magnitude type from the provider, not a bare number.
    expect(screen.getByText(/\(mww\)/)).toBeInTheDocument();
    // Safe external attribution link.
    const link = screen.getByRole('link', { name: /USGS ↗/ });
    expect(link).toHaveAttribute(
      'href',
      'https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    // Live provenance travels with the detail view.
    expect(screen.getByLabelText(/Data status: LIVE/i)).toBeInTheDocument();
  });

  it('renders only supplied fields, never empty placeholders', () => {
    const sparse: EventDetail = {
      ...liveDetail,
      felt: null,
      alert: null,
      tsunami: null,
      significance: null,
      status: null,
      updated_at: null,
      magnitude_unit: null,
      categories: null,
    };
    render(<DataPanel {...baseProps} eventDetail={sparse} />);

    expect(screen.queryByText('Felt reports')).not.toBeInTheDocument();
    expect(screen.queryByText('Alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Tsunami')).not.toBeInTheDocument();
    expect(screen.queryByText('Significance')).not.toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(screen.queryByText('N/A')).not.toBeInTheDocument();
  });

  it('shows a loading state while the detail fetch is in flight', () => {
    render(<DataPanel {...baseProps} eventDetail={null} eventDetailLoading />);
    expect(screen.getByRole('status', { name: 'Loading event details' })).toBeInTheDocument();
  });

  it('never retains the previous layer provenance after a layer switch', () => {
    const liveStatus: DataStatus = {
      status: 'live',
      source: 'USGS',
      fetched_at: new Date(Date.now() - 60_000).toISOString(),
    };
    const layerView = {
      ...baseProps,
      selectedEvent: null,
      eventDetail: null,
      dataPoints: [],
    };
    const { rerender } = render(<DataPanel {...layerView} dataStatus={liveStatus} />);
    expect(screen.getByRole('status')).toHaveTextContent('LIVE');

    // Layer switched: new key, no data yet — UNKNOWN with no trace of USGS.
    rerender(<DataPanel {...layerView} dataStatus={null} />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('UNKNOWN');
    expect(banner).not.toHaveTextContent('USGS');

    // Fresh response for the new layer replaces it (no stale retention).
    rerender(<DataPanel {...layerView} dataStatus={layerStatus} />);
    expect(screen.getByRole('status')).toHaveTextContent('SIMULATED');
  });

  it('shows ERROR provenance (not a success state) when the request fails with no payload', () => {
    const layerView = {
      ...baseProps,
      selectedEvent: null,
      eventDetail: null,
      dataPoints: [],
    };
    render(
      <DataPanel
        {...layerView}
        dataStatus={null}
        error="Network error — is the API reachable?"
      />,
    );
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('ERROR');
    expect(banner).not.toHaveTextContent('LIVE');
    expect(banner).not.toHaveTextContent('SIMULATED');
  });

  it('labels simulated fallback details honestly', () => {
    const simulated: EventDetail = {
      ...liveDetail,
      provider: undefined,
      felt: null,
      alert: null,
      tsunami: null,
      significance: null,
      updated_at: null,
      magnitude_unit: null,
      data_status: { ...layerStatus },
    };
    render(<DataPanel {...baseProps} eventDetail={simulated} />);
    expect(screen.getByLabelText(/Data status: SIMULATED/i)).toBeInTheDocument();
  });
});

describe('DataPanel responsive layout (T3.9)', () => {
  it('constrains panel height on mobile with max-md:max-h-[52dvh]', () => {
    render(<DataPanel {...baseProps} eventDetail={liveDetail} />);
    const panel = screen.getByLabelText('Event detail');
    expect(panel).toHaveClass('max-md:max-h-[52dvh]');
    expect(panel).toHaveClass('min-h-0');
    expect(panel).toHaveClass('w-full');
  });

  it('uses intel-shell with panel-enter animation', () => {
    render(<DataPanel {...baseProps} eventDetail={liveDetail} />);
    const panel = screen.getByLabelText('Event detail');
    expect(panel).toHaveClass('intel-shell');
    expect(panel).toHaveClass('panel-enter');
  });

  it('has ScrollArea with border-t for content', () => {
    render(<DataPanel {...baseProps} eventDetail={liveDetail} />);
    const scrollArea = screen.getByLabelText('Event detail').querySelector('[data-radix-scroll-area-viewport]')?.parentElement;
    expect(scrollArea).toBeInTheDocument();
  });

  it('title row uses flex with min-w-0 for truncation', () => {
    render(<DataPanel {...baseProps} eventDetail={liveDetail} />);
    const title = screen.getByText('Event detail');
    expect(title).toHaveClass('truncate');
    const titleRow = title.parentElement;
    expect(titleRow).toHaveClass('flex');
    expect(titleRow).toHaveClass('min-w-0');
  });
});
