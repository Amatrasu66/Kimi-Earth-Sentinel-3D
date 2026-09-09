import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DataPanel from '@/components/panels/DataPanel';
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
