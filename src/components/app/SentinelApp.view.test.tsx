/**
 * T3.15 globe/list view toggle tests: the visible toggle reflects URL
 * state, both presentations show real data through the single existing
 * data path, and switching preserves layer/search/severity/selection,
 * provenance, and passthrough params (notably `renderer`). No browser
 * automation — jsdom history + mocked data hooks only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SentinelApp from '@/components/app/SentinelApp';
import { api } from '@/services/api';

const FETCHED_AT = '2026-10-11T00:00:00Z';

const QUAKES = [
  { id: 'usgs-1', type: 'earthquake', title: 'M5.2 Test Quake', lat: 35.6, lon: 139.6, severity: 'high', timestamp: '2026-10-11T00:00:00Z' },
  { id: 'usgs-2', type: 'earthquake', title: 'M3.1 Minor Quake', lat: -20, lon: -70, severity: 'low', timestamp: '2026-10-11T00:00:00Z' },
];

// Stable empty payload: the app syncs `data.points` into render state by
// identity, so a fresh `[]` per hook call would never settle (infinite
// re-render). The existing URL suites rely on the same stability (QUAKES).
const NO_POINTS: typeof QUAKES = [];

// Per-test layer-data variants (success/loading/empty/unavailable/error)
// without a second fetch path — the app reads one hook either way.
const mockLayerState = vi.hoisted(() => ({
  empty: false,
  loading: false,
  error: null as string | null,
  status: 'live' as 'live' | 'simulated' | 'unavailable' | null,
}));

const refetchSpy = vi.hoisted(() => vi.fn());

vi.mock('@/components/globe/EarthRenderer', () => ({
  default: () => <div data-testid="earth-stub" />,
}));

// Stage globe mock: presence proves the globe presentation is mounted.
vi.mock('@/components/globe/dotted/DottedEarth', () => ({
  default: function MockDottedEarth() {
    return <div data-testid="dotted-earth" />;
  },
}));

vi.mock('@/hooks/useLayers', () => ({
  useLayers: () => ({ layers: [], loading: false, error: null }),
  useLayerData: (layerId: string | null) => {
    if (layerId !== 'earthquakes') {
      return { data: null, loading: false, validating: false, error: null, dataStatus: null, meta: { cacheHit: null }, refetch: refetchSpy };
    }
    return {
      data: { layer_id: 'earthquakes', points: mockLayerState.empty ? NO_POINTS : QUAKES },
      loading: mockLayerState.loading,
      validating: false,
      error: mockLayerState.error ? { message: mockLayerState.error } : null,
      dataStatus: mockLayerState.status
        ? { status: mockLayerState.status, source: 'USGS', fetched_at: FETCHED_AT, message: null }
        : null,
      meta: { cacheHit: null },
      refetch: refetchSpy,
    };
  },
  // T3.6 idle prefetch is a no-op in view tests (background concern only).
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

function liveAnnouncers(): HTMLElement[] {
  return screen.getAllByRole('status').filter((el) => el.textContent?.includes('LIVE'));
}

beforeEach(() => {
  setUrl('');
  mockLayerState.empty = false;
  mockLayerState.loading = false;
  mockLayerState.error = null;
  mockLayerState.status = 'live';
  refetchSpy.mockClear();
  window.localStorage.clear();
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

describe('toggle reflects URL state (T3.15.1)', () => {
  it('renders Globe pressed by default (bare URL canonicalizes without view)', async () => {
    setUrl('');
    render(<SentinelApp />);
    expect(await screen.findByTestId('dotted-earth')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Globe view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'false');
    expect(currentSearch()).toBe('?layer=earthquakes');
  });

  it('renders List pressed for ?view=list and honors the severity filter', async () => {
    setUrl('?layer=earthquakes&sev=high&view=list');
    render(<SentinelApp />);
    expect(await screen.findByTestId('list-stage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Globe view' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
    // The severity filter is shared with globe mode — only the high row shows.
    expect(screen.getByRole('button', { name: /M5\.2 Test Quake/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /M3\.1 Minor Quake/ })).not.toBeInTheDocument();
  });

  it('exposes one View group with native buttons (keyboard-operable)', async () => {
    setUrl('');
    render(<SentinelApp />);
    await screen.findByTestId('dotted-earth');
    const group = screen.getByRole('group', { name: 'View' });
    expect(group).toBeInTheDocument();
    for (const name of ['Globe view', 'List view']) {
      expect(screen.getByRole('button', { name }).tagName).toBe('BUTTON');
    }
  });
});

describe('globe presentation (T3.15.2)', () => {
  it('shows the globe stage, keeps the panel list, and skips to the panel', async () => {
    setUrl('?layer=earthquakes');
    render(<SentinelApp />);
    expect(await screen.findByTestId('dotted-earth')).toBeInTheDocument();
    expect(screen.getByTestId('earth-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('list-stage')).not.toBeInTheDocument();
    // Globe mode keeps the existing panel list alternative + skip target.
    expect(screen.getByLabelText('Layer data')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /M5\.2 Test Quake/ })).toBeInTheDocument();
    const skip = screen.getByRole('link', { name: 'Skip to data panel' });
    expect(skip).toHaveAttribute('href', '#sentinel-data-panel');
  });
});

describe('list presentation shows real observations (T3.15.3)', () => {
  it('swaps the globe for the primary list with the same real points', async () => {
    setUrl('?layer=earthquakes&view=list');
    render(<SentinelApp />);
    expect(await screen.findByTestId('list-stage')).toBeInTheDocument();
    expect(screen.queryByTestId('dotted-earth')).not.toBeInTheDocument();
    expect(screen.queryByTestId('earth-stub')).not.toBeInTheDocument();
    // Real payload rows — exactly the two fetched points, never fabricated.
    const rows = screen.getAllByRole('button', { name: /Quake/ });
    expect(rows).toHaveLength(2);
    expect(screen.getByRole('button', { name: /M5\.2 Test Quake/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /M3\.1 Minor Quake/ })).toBeInTheDocument();
    // Layer + provenance travel with the presentation switch.
    expect(screen.getByRole('button', { name: 'Toggle Earthquakes layer, shortcut 5' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status', { name: /Data status: LIVE/ })).toBeInTheDocument();
    expect(liveAnnouncers()).toHaveLength(1);
    // Skip link follows the active presentation.
    const skip = screen.getByRole('link', { name: 'Skip to event list' });
    expect(skip).toHaveAttribute('href', '#sentinel-list-stage');
  });
});

describe('truthful states in list mode (T3.15.4)', () => {
  it('represents the initial request as loading (no empty-state flash)', async () => {
    mockLayerState.loading = true;
    setUrl('?layer=earthquakes&view=list');
    render(<SentinelApp />);
    expect(await screen.findByRole('status', { name: 'Loading layer data' })).toBeInTheDocument();
    expect(screen.queryByText('No events right now')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quake/ })).not.toBeInTheDocument();
  });

  it('shows genuine empty results distinctly from loading and errors', async () => {
    mockLayerState.empty = true;
    setUrl('?layer=earthquakes&view=list');
    render(<SentinelApp />);
    expect(await screen.findByText('No events right now')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading layer data' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows filtered-empty distinctly when the severity filter matches nothing', async () => {
    setUrl('?layer=earthquakes&sev=critical&view=list');
    render(<SentinelApp />);
    expect(await screen.findByText('No matching events')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quake/ })).not.toBeInTheDocument();
  });

  it('keeps unavailable provenance without fabricating rows', async () => {
    mockLayerState.empty = true;
    mockLayerState.status = 'unavailable';
    setUrl('?layer=earthquakes&view=list');
    render(<SentinelApp />);
    expect(await screen.findByRole('status', { name: /Data status: UNAVAILABLE/ })).toBeInTheDocument();
    expect(screen.getByText('No events right now')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quake/ })).not.toBeInTheDocument();
    expect(api.getEvent).not.toHaveBeenCalled();
  });

  it('shows failures with a retry path through the existing refresh mechanism', async () => {
    mockLayerState.error = 'Network error — is the API reachable?';
    mockLayerState.status = null;
    setUrl('?layer=earthquakes&view=list');
    render(<SentinelApp />);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetchSpy).toHaveBeenCalled();
  });
});

describe('view switch preserves layer and provenance (T3.15.5)', () => {
  it('toggles presentations without resetting layer, severity, or data status', async () => {
    setUrl('?layer=earthquakes&sev=high');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    render(<SentinelApp />);
    await screen.findByTestId('dotted-earth');

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(await screen.findByTestId('list-stage')).toBeInTheDocument();
    expect(currentSearch()).toBe('?layer=earthquakes&sev=high&view=list');
    expect(pushSpy).toHaveBeenCalledWith(null, '', '?layer=earthquakes&sev=high&view=list');
    // Same layer, same filter, same provenance — presentation only.
    expect(screen.getByRole('button', { name: 'Toggle Earthquakes layer, shortcut 5' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /M5\.2 Test Quake/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /M3\.1 Minor Quake/ })).not.toBeInTheDocument();
    expect(liveAnnouncers()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Globe view' }));
    expect(await screen.findByTestId('dotted-earth')).toBeInTheDocument();
    expect(screen.queryByTestId('list-stage')).not.toBeInTheDocument();
    // The default view is omitted from the canonical URL (existing rule).
    expect(currentSearch()).toBe('?layer=earthquakes&sev=high');
  });

  it('creates no history entry for a redundant click on the active view', async () => {
    setUrl('?layer=earthquakes');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    render(<SentinelApp />);
    await screen.findByTestId('dotted-earth');
    pushSpy.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Globe view' }));
    expect(pushSpy).not.toHaveBeenCalled();
    expect(currentSearch()).toBe('?layer=earthquakes');
  });
});

describe('renderer passthrough survives toggling (T3.15.6)', () => {
  it('never changes ?renderer= when switching presentations', async () => {
    setUrl('?layer=earthquakes&renderer=webgl');
    render(<SentinelApp />);
    // Forced 3D renderer: the fullscreen path is mounted (stub) and the
    // stage keeps its bare frame — the dotted globe correctly stands down.
    expect(await screen.findByTestId('earth-stub')).toBeInTheDocument();
    expect(screen.getByText('SENTINEL STAGE · WGS 84')).toBeInTheDocument();
    expect(screen.queryByTestId('dotted-earth')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(await screen.findByTestId('list-stage')).toBeInTheDocument();
    expect(screen.queryByTestId('earth-stub')).not.toBeInTheDocument();
    expect(currentSearch()).toBe('?layer=earthquakes&view=list&renderer=webgl');

    fireEvent.click(screen.getByRole('button', { name: 'Globe view' }));
    expect(await screen.findByTestId('earth-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('list-stage')).not.toBeInTheDocument();
    expect(currentSearch()).toBe('?layer=earthquakes&renderer=webgl');
  });
});

describe('Back/Forward restores the view (T3.15.7)', () => {
  it('restores globe and list presentations via popstate', async () => {
    setUrl('?layer=earthquakes');
    render(<SentinelApp />);
    await screen.findByTestId('dotted-earth');

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(await screen.findByTestId('list-stage')).toBeInTheDocument();
    expect(currentSearch()).toBe('?layer=earthquakes&view=list');

    act(() => {
      window.history.replaceState(null, '', '?layer=earthquakes');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(await screen.findByTestId('dotted-earth')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Globe view' })).toHaveAttribute('aria-pressed', 'true');

    act(() => {
      window.history.replaceState(null, '', '?layer=earthquakes&view=list');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(await screen.findByTestId('list-stage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('search and event selection in list mode (T3.15.8)', () => {
  it('keeps query typing on replace without leaving the list presentation', async () => {
    setUrl('?layer=earthquakes&view=list');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    render(<SentinelApp />);
    await screen.findByTestId('list-stage');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tok' } });
    expect(screen.getByRole('combobox')).toHaveValue('tok');
    expect(pushSpy).not.toHaveBeenCalled();
    const last = replaceSpy.mock.calls[replaceSpy.mock.calls.length - 1];
    expect(last?.[2]).toBe('?layer=earthquakes&q=tok&view=list');
    expect(screen.getByTestId('list-stage')).toBeInTheDocument();
  });

  it('opens the event detail from a list row and returns focus to the list', async () => {
    setUrl('?layer=earthquakes&view=list');
    render(<SentinelApp />);
    await screen.findByTestId('list-stage');

    fireEvent.click(screen.getByRole('button', { name: /M5\.2 Test Quake/ }));
    await screen.findByLabelText('Event detail');
    expect(api.getEvent).toHaveBeenCalledWith('usgs-1', expect.anything());
    expect(currentSearch()).toBe('?layer=earthquakes&event=usgs-1&view=list');
    // The stage swaps the list for the detail (the same swap globe mode
    // performs) — the row is never rendered twice, and one announcer stays.
    expect(screen.getByTestId('list-stage')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'M5.2 Test Quake' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /M5\.2 Test Quake/ })).not.toBeInTheDocument();
    expect(liveAnnouncers()).toHaveLength(1);

    const back = screen.getByRole('button', { name: 'Back to layer view' });
    back.focus();
    fireEvent.click(back);
    expect(await screen.findByRole('button', { name: /M5\.2 Test Quake/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Event detail')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(document.getElementById('sentinel-list-stage'));
    expect(currentSearch()).toBe('?layer=earthquakes&view=list');
  });
});

describe('invalid view fallback (T3.15.9)', () => {
  it('falls back to globe and canonicalizes the URL', async () => {
    setUrl('?layer=earthquakes&view=map');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    render(<SentinelApp />);
    expect(await screen.findByTestId('dotted-earth')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Globe view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('list-stage')).not.toBeInTheDocument();
    const last = replaceSpy.mock.calls[replaceSpy.mock.calls.length - 1];
    expect(last?.[2]).toBe('?layer=earthquakes');
  });
});

describe('keyboard and toggle semantics (T3.15.10)', () => {
  it('moves focus visibly and activates from the keyboard', async () => {
    setUrl('?layer=earthquakes');
    render(<SentinelApp />);
    await screen.findByTestId('dotted-earth');

    const listButton = screen.getByRole('button', { name: 'List view' });
    listButton.focus();
    expect(document.activeElement).toBe(listButton);
    // Native button activation flips the pressed state + presentation.
    fireEvent.click(listButton);
    expect(await screen.findByTestId('list-stage')).toBeInTheDocument();
    expect(listButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Globe view' })).toHaveAttribute('aria-pressed', 'false');
    // Focus survives the presentation swap (the toggle lives in the header).
    expect(document.activeElement).toBe(listButton);
  });
});
