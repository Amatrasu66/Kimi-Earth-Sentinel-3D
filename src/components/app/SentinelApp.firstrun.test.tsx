/**
 * T3.8 first-run experience tests: default layer, URL precedence, history,
 * data-path triggering, hint behavior/persistence, distinct loading states,
 * base-layer safety, and SSR determinism. No browser automation — jsdom +
 * mocked API boundary only (real hooks/SWR path, isolated per test).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';
import SentinelApp from '@/components/app/SentinelApp';
import DataPanel from '@/components/intelligence/DataPanel';
import { ApiError, api } from '@/services/api';
import { DEFAULT_FIRST_RUN_LAYER } from '@/lib/url-state';

vi.mock('@/components/globe/EarthRenderer', () => ({
  default: () => <div data-testid="earth-stub" />,
}));

const QUAKES = [
  { id: 'usgs-1', type: 'earthquake', title: 'M5.2 Test Quake', lat: 35.6, lon: 139.6, severity: 'high', timestamp: '2026-10-11T00:00:00Z' },
  { id: 'usgs-2', type: 'earthquake', title: 'M3.1 Minor Quake', lat: -20, lon: -70, severity: 'low', timestamp: '2026-10-11T00:00:00Z' },
];

const QUAKE_META = {
  id: 'earthquakes',
  name: 'Earthquakes',
  description: 'Live earthquakes.',
  icon: 'activity',
  source: 'USGS',
  refresh_interval: 300,
  enabled: true,
};

const FETCHED_AT = '2026-10-11T00:00:00Z';

function envelopeForPath(path: string) {
  const match = /\/layers\/([^/]+)\/data/.exec(path);
  const layer = match?.[1] ?? 'earthquakes';
  const points = layer === 'earthquakes' ? QUAKES : [];
  return {
    data: {
      layer_id: layer,
      count: points.length,
      points,
      data_status: { status: 'live', source: 'x', fetched_at: FETCHED_AT, message: null },
    },
    meta: { timestamp: FETCHED_AT, cache_hit: false },
  };
}

function wrapperWithCache() {
  const provider = () => new Map();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <SWRConfig value={{ provider }}>{children}</SWRConfig>;
  };
}

function setUrl(search: string) {
  window.history.replaceState(null, '', search === '' ? '/' : `/${search}`);
}

beforeEach(() => {
  setUrl('');
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
  vi.spyOn(api, 'getLayers').mockResolvedValue({ layers: [QUAKE_META] } as never);
  vi.spyOn(api, 'fetchLayerDataPath').mockImplementation((async (path: string) => envelopeForPath(path)) as never);
  vi.spyOn(api, 'getEvent').mockImplementation((async (id: string) => ({
    id, layer_id: 'earthquakes', type: 'earthquake', title: `Detail ${id}`,
    lat: 35.6, lon: 139.6, timestamp: FETCHED_AT, severity: 'high',
  })) as never);
  vi.spyOn(api, 'search').mockResolvedValue({ query: '', results: [] } as never);
});

afterEach(() => {
  setUrl('');
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('default layer selection (T3.8 §2)', () => {
  it('declares earthquakes as the deterministic first-run default', () => {
    expect(DEFAULT_FIRST_RUN_LAYER).toBe('earthquakes');
  });

  it('selects Earthquakes when no layer is specified', async () => {
    setUrl('');
    render(<SentinelApp />, { wrapper: wrapperWithCache() });

    // Rail, header, panel, URL, dock and markers agree on the default.
    expect(
      await screen.findByRole('button', { name: 'Toggle Earthquakes layer, shortcut 5' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle Earthquakes layer, shortcut 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // sr-only text since T3.10 (a span aria-label is ignored by AT).
    expect(await screen.findByText('Active layer: Earthquakes')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Earthquakes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Layer data')).toBeInTheDocument();
    expect(window.location.search).toBe('?layer=earthquakes');
    expect(screen.getByTitle('Active layer: earthquakes')).toHaveTextContent(/2/);
    // Real payload points reach the panel list (never fabricated ids).
    expect(await screen.findByRole('button', { name: /M5\.2 Test Quake/ })).toBeInTheDocument();
    // The request went through the canonical layer-data path.
    expect(api.fetchLayerDataPath).toHaveBeenCalledWith(
      '/layers/earthquakes/data?limit=500',
      expect.anything(),
    );
  });

  it('lets a valid URL layer take precedence over the default', async () => {
    setUrl('?layer=wildfires');
    render(<SentinelApp />, { wrapper: wrapperWithCache() });

    const wildfires = await screen.findByRole('button', { name: 'Toggle Wildfires layer, shortcut 8' });
    expect(wildfires).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Toggle Earthquakes layer, shortcut 5' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(window.location.search).toBe('?layer=wildfires');
    // The valid layer — not the default — drove the data path.
    const calls = (api.fetchLayerDataPath as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(String(calls[0][0])).toBe('/layers/wildfires/data?limit=500');
  });

  it('preserves renderer selection and unrelated params across initialization', async () => {
    setUrl('?renderer=webgl&utm_source=x');
    render(<SentinelApp />, { wrapper: wrapperWithCache() });
    await screen.findByLabelText('Layer data');
    expect(window.location.search).toBe('?layer=earthquakes&renderer=webgl&utm_source=x');
  });

  it('preserves search, severity, and view params alongside the default', async () => {
    setUrl('?q=tokyo&sev=high&view=list');
    render(<SentinelApp />, { wrapper: wrapperWithCache() });
    // T3.15 list presentation: the stage carries the primary event list
    // while the panel stands down — so the list stage (not 'Layer data')
    // is the expected surface, with the same canonical URL contract.
    await screen.findByTestId('list-stage');
    expect(window.location.search).toBe('?layer=earthquakes&q=tokyo&sev=high&view=list');
    expect(screen.getByRole('combobox')).toHaveValue('tokyo');
  });
});

describe('history around the default (T3.8 §2)', () => {
  it('Back/Forward correctly restores the selected layer', async () => {
    setUrl('?layer=earthquakes');
    render(<SentinelApp />, { wrapper: wrapperWithCache() });
    await screen.findByRole('button', { name: /M5\.2 Test Quake/ });

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Wildfires layer, shortcut 8' }));
    expect(window.location.search).toBe('?layer=wildfires');
    expect(screen.getByRole('button', { name: 'Toggle Wildfires layer, shortcut 8' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    act(() => {
      window.history.replaceState(null, '', '?layer=earthquakes');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('button', { name: 'Toggle Earthquakes layer, shortcut 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(window.location.search).toBe('?layer=earthquakes');

    act(() => {
      window.history.replaceState(null, '', '?layer=wildfires');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('button', { name: 'Toggle Wildfires layer, shortcut 8' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('initial data path (T3.8 §2)', () => {
  it('triggers the expected layer-data request without duplicate initial requests', async () => {
    setUrl('');
    render(<SentinelApp />, { wrapper: wrapperWithCache() });
    await screen.findByRole('button', { name: /M5\.2 Test Quake/ });
    // One mount → one canonical request (idle prefetch stands down once
    // the default is active; no second key, no refetch on settle).
    expect(api.fetchLayerDataPath).toHaveBeenCalledTimes(1);
    expect(api.fetchLayerDataPath).toHaveBeenCalledWith(
      '/layers/earthquakes/data?limit=500',
      expect.anything(),
    );
  });
});

describe('first-run hint (T3.8 §3)', () => {
  it('reflects the selected state instead of asking to select a layer', async () => {
    setUrl('');
    render(<SentinelApp />, { wrapper: wrapperWithCache() });
    await screen.findByLabelText('Layer data');

    expect(screen.getByText('Getting started')).toBeInTheDocument();
    expect(screen.queryByText('Select layer')).not.toBeInTheDocument();

    // Closing the layer returns to the select-layer affordance (relevant).
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(await screen.findByText('Select layer')).toBeInTheDocument();
    expect(screen.queryByText('Getting started')).not.toBeInTheDocument();
  });

  it('persists dismissal across reloads without touching SSR', async () => {
    setUrl('');
    const first = render(<SentinelApp />, { wrapper: wrapperWithCache() });
    await screen.findByText('Getting started');

    // Explicit accessible name since T3.10 ("Dismiss" alone was ambiguous).
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss getting started hint' }));
    expect(screen.queryByText('Getting started')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('sentinel:first-run-hint-dismissed:v1')).toBe('1');
    first.unmount();

    // A fresh mount honors the stored dismissal: default layer still
    // applies, but the hint never reappears.
    render(<SentinelApp />, { wrapper: wrapperWithCache() });
    await screen.findByLabelText('Layer data');
    expect(window.location.search).toBe('?layer=earthquakes');
    expect(screen.queryByText('Getting started')).not.toBeInTheDocument();
    expect(screen.queryByText('Select layer')).not.toBeInTheDocument();
  });
});

describe('loading, empty, and failure states (T3.8 §4)', () => {
  const basePanelProps = {
    activeLayer: 'earthquakes' as const,
    layerMeta: { ...QUAKE_META, id: 'earthquakes' as const },
    selectedEvent: null,
    eventDetail: null,
    eventDetailLoading: false,
    dataStatus: null,
    cacheHit: null,
    onClose: vi.fn(),
    onBackToLayer: vi.fn(),
    onEventSelect: vi.fn(),
    onRefresh: vi.fn(),
    severityFilter: 'all' as const,
    onSeverityChange: vi.fn(),
  };

  it('represents the initial request as loading (no empty-state flash)', () => {
    render(<DataPanel {...basePanelProps} dataPoints={[]} loading error={null} />);
    expect(screen.getByRole('status', { name: 'Loading layer data' })).toBeInTheDocument();
    expect(screen.queryByText('No events right now')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows genuine empty results distinctly from loading and errors', () => {
    render(
      <DataPanel
        {...basePanelProps}
        dataPoints={[]}
        loading={false}
        error={null}
        dataStatus={{ status: 'live', source: 'USGS', fetched_at: FETCHED_AT }}
      />,
    );
    expect(screen.getByText('No events right now')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading layer data' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows failures with a retry path through the existing refresh mechanism', () => {
    const onRefresh = vi.fn();
    render(
      <DataPanel
        {...basePanelProps}
        dataPoints={[]}
        loading={false}
        error="Network error — is the API reachable?"
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status', { name: 'Loading layer data' })).not.toBeInTheDocument();
    expect(screen.queryByText('No events right now')).not.toBeInTheDocument();
  });
});

describe('base-layer safety (T3.8 §4)', () => {
  it('keeps the geographic stage on unavailable responses without fabricating data', async () => {
    (api.fetchLayerDataPath as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
      (async () => ({
        data: {
          layer_id: 'earthquakes',
          count: 0,
          points: [],
          data_status: { status: 'unavailable', source: 'USGS', fetched_at: FETCHED_AT, message: null },
        },
        meta: { timestamp: FETCHED_AT, cache_hit: false },
      })) as never,
    );
    setUrl('');
    render(<SentinelApp />, { wrapper: wrapperWithCache() });

    // Provenance passes through verbatim across header/dock/panel chips.
    expect(await screen.findAllByText('UNAVAILABLE')).not.toHaveLength(0);
    expect(screen.getByText('SENTINEL STAGE · WGS 84')).toBeInTheDocument();
    expect(screen.getByText('No events right now')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Test Quake/ })).not.toBeInTheDocument();
    expect(api.getEvent).not.toHaveBeenCalled();
  });

  it('keeps the geographic stage on request failure without fabricating data', async () => {
    (api.fetchLayerDataPath as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
      (async () => {
        throw new ApiError('Layer gone.', { status: 404, code: 'NOT_FOUND' });
      }) as never,
    );
    setUrl('');
    render(<SentinelApp />, { wrapper: wrapperWithCache() });

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByText('SENTINEL STAGE · WGS 84')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Test Quake/ })).not.toBeInTheDocument();
    expect(api.getEvent).not.toHaveBeenCalled();
  });
});

describe('SSR determinism (T3.8 §2)', () => {
  it('introduces no hydration mismatch: SSR stays on the null shell, default is effect-only', () => {
    const first = renderToString(<SentinelApp />);
    const second = renderToString(<SentinelApp />);
    expect(first).toBe(second);
    // Static shell: original select-layer hint, no data panel, no clock leak.
    // (The hint container keeps its accessible name in both variants, so
    // assert on the title element, not the shared aria-label.)
    expect(first).toContain('>Select layer</p>');
    expect(first).not.toContain('>Getting started</p>');
    expect(first).not.toContain('Layer data');
    expect(first).not.toMatch(/202\d-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/);
  });

  it('applies the default client-side after hydration', async () => {
    setUrl('');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    render(<SentinelApp />, { wrapper: wrapperWithCache() });
    // Mount effect canonicalizes the bare URL to the default (replace, no push).
    await waitFor(() => expect(window.location.search).toBe('?layer=earthquakes'));
    expect(replaceSpy).toHaveBeenCalledWith(null, '', '?layer=earthquakes');
  });
});
