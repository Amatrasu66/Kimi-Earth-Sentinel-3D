/**
 * T3.3 application URL-state integration tests: restore, sync (push vs
 * replace), Back/Forward via popstate, conflict clearing. No browser
 * automation — jsdom history + mocked data hooks only. Unit coverage for
 * the pure parse/serialize layer lives in `src/lib/url-state.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SentinelApp from '@/components/app/SentinelApp';
import { api } from '@/services/api';

const QUAKES = [
  { id: 'usgs-1', type: 'earthquake', title: 'M5.2 Test Quake', lat: 35.6, lon: 139.6, severity: 'high', timestamp: '2026-10-11T00:00:00Z' },
  { id: 'usgs-2', type: 'earthquake', title: 'M3.1 Minor Quake', lat: -20, lon: -70, severity: 'low', timestamp: '2026-10-11T00:00:00Z' },
];

vi.mock('@/components/globe/EarthRenderer', () => ({
  default: () => <div data-testid="earth-stub" />,
}));

vi.mock('@/hooks/useLayers', () => ({
  useLayers: () => ({ layers: [], loading: false, error: null }),
  useLayerData: (layerId: string | null) => {
    if (layerId === 'earthquakes') {
      return { data: { layer_id: 'earthquakes', points: QUAKES }, loading: false, validating: false, error: null, dataStatus: null, meta: { cacheHit: null }, refetch: vi.fn() };
    }
    return { data: null, loading: false, validating: false, error: null, dataStatus: null, meta: { cacheHit: null }, refetch: vi.fn() };
  },
  // T3.6 idle prefetch is a no-op in URL-state tests (background concern only).
  useIdlePrefetchLayer: () => {},
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

function currentSearch(): string {
  return window.location.search;
}

beforeEach(() => {
  setUrl('');
  // jsdom has no matchMedia (used by use-mobile in the tree) — stub it.
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

describe('URL restore on load (T3.3)', () => {
  it('restores layer, event, query, severity, view and preserves renderer', async () => {
    setUrl('?layer=earthquakes&event=usgs-1&q=tokyo&sev=high&view=list&renderer=webgl');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    render(<SentinelApp />);

    // Event selection resolves from loaded layer data (real detail fetch).
    await screen.findByLabelText('Event detail');
    expect(screen.getByText('M5.2 Test Quake')).toBeInTheDocument();
    expect(api.getEvent).toHaveBeenCalledWith('usgs-1', expect.anything());
    // Search text restored into the box.
    expect(screen.getByRole('combobox')).toHaveValue('tokyo');
    // Mount canonicalization replaces (never pushes history spam).
    expect(pushSpy).not.toHaveBeenCalled();
    expect(currentSearch()).toBe('?layer=earthquakes&event=usgs-1&q=tokyo&sev=high&view=list&renderer=webgl');
    // Severity restore surfaces after backing out to the layer list
    // (detail mode replaces the list; the filter itself was restored).
    fireEvent.click(screen.getByRole('button', { name: 'Back to layer view' }));
    expect(await screen.findByRole('button', { name: /M5\.2 Test Quake/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /M3\.1 Minor Quake/ })).not.toBeInTheDocument();
  });

  it('drops invalid params without provider calls and canonicalizes', async () => {
    setUrl('?layer=nope&event=..&q=a&sev=extreme&view=map&renderer=webgl');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    render(<SentinelApp />);
    // No layer active: first-run hint stays, no data panel.
    expect(await screen.findByText('Select layer')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Event detail|Layer data/)).not.toBeInTheDocument();
    // Canonical form keeps only the valid passthrough.
    const last = replaceSpy.mock.calls[replaceSpy.mock.calls.length - 1];
    expect(last?.[2]).toBe('?renderer=webgl');
  });
});

describe('URL sync strategy (T3.3)', () => {
  it('pushes discrete layer selections as shareable entries', () => {
    setUrl('');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    render(<SentinelApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Earthquakes layer, shortcut 5' }));
    expect(pushSpy).toHaveBeenCalledWith(null, '', '?layer=earthquakes');
  });

  it('replaces (never pushes) on query typing', async () => {
    setUrl('');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    render(<SentinelApp />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tok' } });
    expect(screen.getByRole('combobox')).toHaveValue('tok');
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenLastCalledWith(null, '', '?q=tok');
  });

  it('clears conflicting event selection when switching layers', async () => {
    setUrl('?layer=earthquakes&event=usgs-1');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    render(<SentinelApp />);
    await screen.findByLabelText('Event detail');
    // Switch to a layer whose data has no usgs-1: selection must clear.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Wildfires layer, shortcut 8' }));
    expect(screen.queryByLabelText('Event detail')).not.toBeInTheDocument();
    const last = pushSpy.mock.calls[pushSpy.mock.calls.length - 1];
    expect(last?.[2]).toBe('?layer=wildfires');
  });
});

describe('browser Back/Forward via popstate (T3.3)', () => {
  it('Back closes the event detail; Forward restores it', async () => {
    setUrl('?layer=earthquakes');
    render(<SentinelApp />);
    // Select an event by clicking its list row (discrete navigation → push).
    fireEvent.click(await screen.findByRole('button', { name: /M5\.2 Test Quake/ }));
    await screen.findByLabelText('Event detail');
    expect(currentSearch()).toBe('?layer=earthquakes&event=usgs-1');

    // Browser Back: URL moves first, popstate syncs state (detail closes).
    act(() => {
      window.history.replaceState(null, '', '?layer=earthquakes');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByLabelText('Event detail')).not.toBeInTheDocument();
    expect(currentSearch()).toBe('?layer=earthquakes');

    // Browser Forward: the event restores from loaded data again.
    act(() => {
      window.history.replaceState(null, '', '?layer=earthquakes&event=usgs-1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await screen.findByLabelText('Event detail');
  });

  it('Back/Forward restores layer, severity, query, and view', async () => {
    setUrl('?layer=earthquakes&q=tokyo&sev=low&view=list');
    render(<SentinelApp />);
    expect(screen.getByRole('combobox')).toHaveValue('tokyo');

    act(() => {
      window.history.replaceState(null, '', '?layer=wildfires&q=fire&sev=critical');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('combobox')).toHaveValue('fire');
    expect(currentSearch()).toBe('?layer=wildfires&q=fire&sev=critical');

    act(() => {
      window.history.replaceState(null, '', '?layer=earthquakes&q=tokyo&sev=low&view=list');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('combobox')).toHaveValue('tokyo');
    expect(currentSearch()).toBe('?layer=earthquakes&q=tokyo&sev=low&view=list');
  });
});
