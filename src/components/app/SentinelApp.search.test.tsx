/**
 * T3.5 search-overlay and globe-navigation tests: the results surface opens
 * bounded without unmounting the globe, location/event selection follows the
 * existing fly-to path and closes the surface, typing alone never navigates,
 * and query typing preserves passthrough params (notably `renderer`).
 * No browser automation — jsdom + mocked data/search hooks only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SentinelApp from '@/components/app/SentinelApp';

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));

const QUAKES = [
  { id: 'usgs-1', type: 'earthquake', title: 'M5.2 Test Quake', lat: 35.6, lon: 139.6, severity: 'high', timestamp: '2026-10-11T00:00:00Z' },
  { id: 'usgs-2', type: 'earthquake', title: 'M3.1 Minor Quake', lat: -20, lon: -70, severity: 'low', timestamp: '2026-10-11T00:00:00Z' },
];

vi.mock('@/components/globe/EarthRenderer', () => ({
  default: () => <div data-testid="earth-stub" />,
}));

// Stage globe mock that surfaces the fly-to prop, so selection can be traced
// through the existing destination-navigation path without a real canvas.
vi.mock('@/components/globe/dotted/DottedEarth', () => ({
  default: function MockDottedEarth(props: { flyTo?: { lat: number; lon: number; key: number } | null }) {
    return (
      <div
        data-testid="dotted-earth"
        data-fly-lat={props.flyTo?.lat ?? ''}
        data-fly-lon={props.flyTo?.lon ?? ''}
        data-fly-key={props.flyTo?.key ?? ''}
      />
    );
  },
}));

vi.mock('@/hooks/useLayers', () => ({
  useLayers: () => ({ layers: [], loading: false, error: null }),
  useLayerData: (layerId: string | null) => {
    if (layerId === 'earthquakes') {
      return { data: { layer_id: 'earthquakes', points: QUAKES }, loading: false, validating: false, error: null, dataStatus: null, meta: { cacheHit: null }, refetch: vi.fn() };
    }
    return { data: null, loading: false, validating: false, error: null, dataStatus: null, meta: { cacheHit: null }, refetch: vi.fn() };
  },
  useIdlePrefetchLayer: () => {},
}));

// New-York-style payload: one location row plus one event row, mirroring the
// real `/api/v1/search` envelope contract (grouped locations-first in UI).
vi.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({
    results: [
      { id: 'nyc', type: 'location', name: 'New York', lat: 40.7128, lon: -74.006, snippet: 'US' },
      { id: 'evt-nyc', type: 'event', name: 'Quake near NYC', lat: 40.7, lon: -74.0, snippet: 'earthquakes' },
    ],
    loading: false,
    error: null,
    search: (...args: unknown[]) => searchMock(...args),
  }),
}));

vi.mock('@/services/api', () => ({
  api: {
    getEvent: vi.fn(async (id: string) => ({
      id, layer_id: 'earthquakes', type: 'earthquake', title: `Detail ${id}`,
      lat: 35.6, lon: 139.6, timestamp: '2026-10-11T00:00:00Z', severity: 'high',
    })),
    search: vi.fn(async () => ({ query: '', results: [] })),
    getLayers: vi.fn(async () => ({ layers: [] })),
  },
}));

function setUrl(search: string) {
  window.history.replaceState(null, '', search === '' ? '/' : `/${search}`);
}

beforeEach(() => {
  setUrl('');
  searchMock.mockClear();
  window.localStorage.clear();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  setUrl('');
  vi.restoreAllMocks();
});

describe('search overlay keeps the globe mounted (T3.5)', () => {
  it('opens a bounded results surface without unmounting globe or guidance', async () => {
    setUrl('?layer=earthquakes&q=New+York');
    render(<SentinelApp />);

    // Restored query drives a real debounced lookup, which opens results.
    // (Generous async timeout: the 300 ms debounce plus app render must
    // survive heavily loaded full-suite runs.)
    const listbox = await screen.findByRole('listbox', undefined, { timeout: 5000 });
    expect(searchMock).toHaveBeenCalledWith('New York');
    expect(screen.getByRole('combobox')).toHaveValue('New York');

    // Viewport-bounded panel: compact cap, internal list scroll.
    expect(listbox.className).toContain('max-h-[min(224px,36vh)]');
    const panel = listbox.parentElement;
    expect(panel?.className).toContain('max-h-[min(320px,50vh)]');

    // The globe is never gated on search: stage globe, renderer stub, and
    // first-run guidance all stay mounted while results are open.
    expect(screen.getByTestId('dotted-earth')).toBeInTheDocument();
    expect(screen.getByTestId('earth-stub')).toBeInTheDocument();
    expect(screen.getByText('Getting started')).toBeInTheDocument();
  });
});

describe('search-to-globe navigation (T3.5)', () => {
  it('typing alone never navigates; choosing a location flies the globe and closes', async () => {
    setUrl('?layer=earthquakes');
    render(<SentinelApp />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'New York' } });
    await screen.findByRole('listbox', undefined, { timeout: 5000 });
    const locationOption = screen.getByRole('option', { name: /New York/ });

    // Merely typing performs a lookup but implies no selection: no flight.
    expect(searchMock).toHaveBeenCalledWith('New York');
    expect(screen.getByTestId('dotted-earth')).toHaveAttribute('data-fly-lat', '');

    fireEvent.click(locationOption);

    // Existing destination-navigation path: fly-to reaches the stage globe.
    expect(screen.getByTestId('dotted-earth')).toHaveAttribute('data-fly-lat', '40.7128');
    expect(screen.getByTestId('dotted-earth')).toHaveAttribute('data-fly-lon', '-74.006');
    // Successful selection closes the surface and preserves the query.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('New York');
  });

  it('event selection retains the existing destination-navigation behavior', async () => {
    setUrl('?layer=earthquakes');
    render(<SentinelApp />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'New York' } });
    await screen.findByRole('option', { name: /Quake near NYC/ }, { timeout: 5000 });

    fireEvent.click(screen.getByRole('option', { name: /Quake near NYC/ }));

    // Events keep the established contract: fly to coordinates, then close.
    expect(screen.getByTestId('dotted-earth')).toHaveAttribute('data-fly-lat', '40.7');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('Quake near NYC');
  });

  it('query typing preserves the renderer passthrough via replace (never push)', async () => {
    setUrl('?layer=earthquakes&renderer=webgl');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    render(<SentinelApp />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'New' } });
    expect(screen.getByRole('combobox')).toHaveValue('New');
    expect(pushSpy).not.toHaveBeenCalled();
    const last = replaceSpy.mock.calls[replaceSpy.mock.calls.length - 1];
    expect(last?.[2]).toBe('?layer=earthquakes&q=New&renderer=webgl');
  });
});
