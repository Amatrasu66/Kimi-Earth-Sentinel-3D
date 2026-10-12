/**
 * T3.10 accessibility & keyboard-navigation tests: shortcut guards
 * (modal ownership, modifiers, repeat, activatable Space), the Settings
 * single-key switch and its persistence, focus restoration for surfaces
 * that unmount, landmark/skip-link wiring, and the single live-region
 * announcer for provenance. No browser automation — jsdom + mocked API
 * boundary only, mirroring the firstrun harness.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import SentinelApp from '@/components/app/SentinelApp';
import MarkerHoverCard from '@/components/overlays/MarkerHoverCard';
import { api } from '@/services/api';

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
      data_status: { status: 'live', source: 'USGS', fetched_at: FETCHED_AT, message: null },
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

async function renderApp() {
  const view = render(<SentinelApp />, { wrapper: wrapperWithCache() });
  // Default layer applied after hydration.
  await screen.findByLabelText('Layer data', {}, { timeout: 5000 });
  return view;
}

async function openSettings() {
  fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
  await screen.findByRole('dialog');
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

describe('landmarks and skip link (T3.10)', () => {
  it('exposes a main workspace landmark and a focusable skip target', async () => {
    await renderApp();

    const workspace = screen.getByRole('main');
    expect(workspace).toHaveAttribute('id', 'sentinel-workspace');

    const skip = screen.getByRole('link', { name: 'Skip to data panel' });
    expect(skip).toHaveAttribute('href', '#sentinel-data-panel');
    expect(document.getElementById('sentinel-data-panel')).toHaveAttribute('tabindex', '-1');
  });

  it('marks the search zone as a search landmark', async () => {
    await renderApp();
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Search locations and events' })).toBeInTheDocument();
  });

  it('announces the active layer as text and exposes the settings entry point', async () => {
    await renderApp();

    // sr-only text (T3.10): the visual layer name is aria-hidden, so the
    // announcement must come from real text, not a span aria-label.
    expect(screen.getByText('Active layer: Earthquakes')).toBeInTheDocument();
    const settingsButton = screen.getByRole('button', { name: 'Open settings' });
    expect(settingsButton).toHaveAttribute('id', 'sentinel-settings-button');
    expect(settingsButton).toHaveAttribute('aria-haspopup', 'dialog');
  });
});

describe('Escape ownership and inertness behind modals (T3.10)', () => {
  it('closes Settings without also backing out the panel behind it', async () => {
    await renderApp();
    await openSettings();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The panel behind the dialog must survive: Escape closed one surface.
    expect(screen.getByLabelText('Layer data')).toBeInTheDocument();
    expect(window.location.search).toBe('?layer=earthquakes');
  });

  it('keeps single-key shortcuts inert while Settings is open', async () => {
    await renderApp();
    await openSettings();

    fireEvent.keyDown(window, { key: '1' });

    expect(window.location.search).toBe('?layer=earthquakes');
    expect(screen.getByLabelText('Layer data')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not steal focus into the hidden search input behind Settings', async () => {
    await renderApp();
    await openSettings();

    fireEvent.keyDown(window, { key: '/' });

    // The open dialog aria-hides the app behind it (`hidden: true` finds
    // the background input anyway).
    const input = screen.getByRole(
      'combobox',
      { name: 'Search locations and events', hidden: true },
    );
    expect(document.activeElement).not.toBe(input);
  });

  it('focuses search on / when no modal is open', async () => {
    await renderApp();

    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(
      screen.getByRole('combobox', { name: 'Search locations and events' }),
    );
  });

  it('opens Settings on ?', async () => {
    await renderApp();

    fireEvent.keyDown(window, { key: '?' });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('focus restoration (T3.10)', () => {
  it('restores focus to the workspace when the panel is closed', async () => {
    await renderApp();

    const closeButton = screen.getByRole('button', { name: 'Close panel' });
    closeButton.focus();
    fireEvent.click(closeButton);

    await waitFor(() => expect(screen.queryByLabelText('Layer data')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(document.getElementById('sentinel-workspace'));
  });

  it('restores focus to the panel when returning from event details', async () => {
    await renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /M5\.2 Test Quake/ }));
    await screen.findByLabelText('Event detail');

    const backButton = screen.getByRole('button', { name: 'Back to layer view' });
    backButton.focus();
    fireEvent.click(backButton);

    await waitFor(() => expect(screen.getByLabelText('Layer data')).toBeInTheDocument());
    expect(document.activeElement).toBe(document.getElementById('sentinel-data-panel'));
  });

  it('restores focus to the workspace when the first-run hint is dismissed', async () => {
    await renderApp();

    // Explicit accessible name (T3.10): "Dismiss" alone is ambiguous.
    const dismiss = screen.getByRole('button', { name: 'Dismiss getting started hint' });
    dismiss.focus();
    fireEvent.click(dismiss);

    await waitFor(() => expect(screen.queryByText('Getting started')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(document.getElementById('sentinel-workspace'));
  });

  it('restores focus to the settings button when Settings closes', async () => {
    await renderApp();

    const settingsButton = screen.getByRole('button', { name: 'Open settings' });
    settingsButton.focus();
    fireEvent.click(settingsButton);
    await screen.findByRole('dialog');

    // Keyboard user tabs to the dialog close control, then backs out.
    (screen.getByRole('button', { name: 'Close' }) as HTMLButtonElement).focus();
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(settingsButton);
  });

  it('restores focus to the settings button when a ?-opened dialog closes', async () => {
    await renderApp();

    fireEvent.keyDown(window, { key: '?' });
    await screen.findByRole('dialog');

    (screen.getByRole('button', { name: 'Close' }) as HTMLButtonElement).focus();
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Open settings' }),
    );
  });
});

describe('single-key shortcuts switch (T3.10 / PRD U-04, P1-18)', () => {
  async function toggleSingleKeyShortcutsOff() {
    await openSettings();
    // Radix Tabs activates its trigger on mousedown, not on click alone.
    const tab = screen.getByRole('tab', { name: /Shortcuts/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    fireEvent.click(screen.getByRole('switch', { name: 'Toggle single-key shortcuts' }));
    expect(window.localStorage.getItem('sentinel:single-key-shortcuts:v1')).toBe('0');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  }

  it('disables the character-key map, its hints, and persists the choice', async () => {
    await renderApp();
    await toggleSingleKeyShortcutsOff();

    // `1` is inert: the layer (and its URL) never change.
    fireEvent.keyDown(window, { key: '1' });
    expect(window.location.search).toBe('?layer=earthquakes');

    // `/` no longer focuses search.
    fireEvent.keyDown(window, { key: '/' });
    const input = screen.getByRole('combobox', { name: 'Search locations and events' });
    expect(document.activeElement).not.toBe(input);

    // Advertised hints follow the switch: rail labels drop the digit,
    // the hint copy stops mentioning 1–8, and the `/` badge disappears.
    expect(
      screen.getAllByRole('button', { name: 'Toggle Earthquakes layer' }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /shortcut \d/ })).not.toBeInTheDocument();
    const note = screen.getByRole('note', { name: 'Getting started hint' });
    expect(note.textContent).not.toMatch(/1\s*–\s*8/);

    // Escape still backs out (it is not part of the switched-off map).
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText('Layer data')).not.toBeInTheDocument());
  });

  it('reloads with the switch still off and can turn it back on', async () => {
    const first = await renderApp();
    await toggleSingleKeyShortcutsOff();
    fireEvent.keyDown(window, { key: 'Escape' });
    first.unmount();

    // Fresh mount: the persisted choice is re-applied after hydration.
    await renderApp();
    fireEvent.keyDown(window, { key: '1' });
    expect(window.location.search).toBe('?layer=earthquakes');

    // Turning the switch back on re-enables the map.
    await openSettings();
    const tab = screen.getByRole('tab', { name: /Shortcuts/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    fireEvent.click(screen.getByRole('switch', { name: 'Toggle single-key shortcuts' }));
    expect(window.localStorage.getItem('sentinel:single-key-shortcuts:v1')).toBe('1');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.keyDown(window, { key: '1' });
    await waitFor(() => expect(window.location.search).toBe('?layer=temperature'));
  });
});

describe('live-region discipline (T3.10)', () => {
  it('announces provenance from exactly one live region', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getAllByText('LIVE').length).toBeGreaterThan(0));

    const announcers = screen.getAllByRole('status').filter((el) => el.textContent?.includes('LIVE'));
    expect(announcers).toHaveLength(1);
    // The survivor is the panel banner — the single provenance announcer.
    expect(announcers[0]).toHaveAttribute('aria-label', expect.stringContaining('Data status'));
  });

  it('renders hover-only marker details outside the live regions', async () => {
    // Hover sweeps used to announce through role="status" on every pointer
    // move; details are pointer-only now (the list/panel carry them for AT).
    render(
      <MarkerHoverCard
        activeLayer="earthquakes"
        point={{
          id: 'usgs-1',
          type: 'earthquake',
          title: 'M5.2 Test Quake',
          lat: 35.6,
          lon: 139.6,
          severity: 'high',
          timestamp: FETCHED_AT,
        }}
      />,
    );
    expect(screen.getByText('M5.2 Test Quake')).toBeInTheDocument();
    expect(document.querySelector('[role="status"]')).toBeNull();
  });
});
