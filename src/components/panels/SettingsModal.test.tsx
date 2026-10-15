import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import SettingsModal, {
  buildDiagnosticRows,
  formatDiagnosticReport,
} from '@/components/panels/SettingsModal';
import type { RendererInfo } from '@/components/globe/EarthRenderer';
import type { DataStatus } from '@/types';

// Controllable viewport mock: the factory is hoisted, so it reads this
// mutable cell lazily — tests flip narrow/wide per case. (Calling vi.mock
// inside a component never re-mocks the already-imported hook.)
const viewportState = { isMobile: false };
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => viewportState.isMobile,
}));

const mockRendererInfo: RendererInfo = {
  active: 'dotted',
  detail: 'ready · 1076 land dots',
  textures: { loaded: 0, total: 0 },
  source: 'automatic',
};

const mockDataStatus: DataStatus = {
  status: 'live',
  source: 'USGS',
  fetched_at: new Date().toISOString(),
};

function renderSettings() {
  return render(
    <SettingsModal
      isOpen={true}
      onClose={vi.fn()}
      isRotating={true}
      onToggleRotation={vi.fn()}
      rendererInfo={mockRendererInfo}
      activeLayer="earthquakes"
      dataStatus={mockDataStatus}
      cacheHit={false}
      singleKeyShortcuts={true}
      onSingleKeyShortcutsChange={vi.fn()}
      lowPowerPreference="auto"
      onLowPowerPreferenceChange={vi.fn()}
      lowPowerActive={false}
    />,
  );
}

// Radix Tabs triggers activate on mousedown (see @radix-ui/react-tabs:
// onMouseDown → onValueChange); a bare fireEvent.click never fires it, and
// jsdom never moves focus on click either. Left-button mousedown is the
// faithful selection gesture here.
function selectTab(name: RegExp) {
  const tab = screen.getByRole('tab', { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
}

describe('SettingsModal responsive layout (T3.9)', () => {
  beforeEach(() => {
    viewportState.isMobile = false;
  });

  it('renders centered Dialog on wide viewports with dvh-bounded width', () => {
    viewportState.isMobile = false;
    renderSettings();
    const dialogContent = screen.getByRole('dialog');
    expect(dialogContent).toHaveClass('max-h-[85dvh]');
    expect(dialogContent).toHaveClass('w-full');
    expect(dialogContent).toHaveClass('max-w-[520px]');
    expect(dialogContent).toHaveClass('sentinel-panel');
  });

  it('renders bottom Sheet on narrow viewports (not the centered dialog)', () => {
    viewportState.isMobile = true;
    renderSettings();
    const sheetContent = screen.getByRole('dialog');
    // Sheet base carries the bottom-drawer geometry; the desktop dialog
    // width cap must not leak into the sheet branch.
    expect(sheetContent.className).toContain('bottom-0');
    expect(sheetContent.className).toContain('max-h-[88dvh]');
    expect(sheetContent.className).not.toContain('max-w-[520px]');
  });

  it('bounds tab content height with independent scrolling', () => {
    renderSettings();
    const tabsList = screen.getByRole('tablist');
    expect(tabsList).toBeInTheDocument();
    const triggers = screen.getAllByRole('tab');
    expect(triggers).toHaveLength(4);
    // The scrollable tab body (sibling after the tablist wrapper) keeps
    // actions reachable on short viewports.
    const tabBody = tabsList.parentElement?.nextElementSibling;
    expect(tabBody).toHaveClass('max-h-[55dvh]');
    expect(tabBody).toHaveClass('overflow-y-auto');
  });

  it('DiagnosticsPanel keeps long values inside the viewport (break-all)', () => {
    renderSettings();
    selectTab(/Diagnostics/);
    // The value cell itself wraps long strings; the row stays flexible.
    const dd = screen.getByText('checking…');
    expect(dd.tagName).toBe('DD');
    expect(dd).toHaveClass('break-all');
    expect(dd).toHaveClass('text-right');
    expect(dd.parentElement).toHaveClass('flex');
  });

  it('Shortcuts tab keeps shortcut hints visible with compact styling', () => {
    renderSettings();
    selectTab(/Shortcuts/);
    // The master-switch description advertises the gated keys…
    const toggleCard = screen.getByText('Single-key shortcuts').closest('div')?.parentElement;
    const toggleKbd = within(toggleCard as HTMLElement).getByText('1');
    expect(toggleKbd).toHaveClass('bg-white/10');
    // …and the shortcut list keeps every row (nothing dropped to fit).
    for (const action of ['Toggle environmental layers', 'Focus search']) {
      expect(screen.getByText(action)).toBeInTheDocument();
    }
  });

  it('Globe tab content uses sentinel-inset for consistent spacing', () => {
    renderSettings();
    // Label -> wrapping div -> flex row -> sentinel-inset card.
    const insetDivs = screen
      .getAllByText('Auto-rotate')
      .map((el) => el.parentElement?.parentElement?.parentElement);
    insetDivs.forEach((div) => {
      expect(div).toHaveClass('sentinel-inset');
      expect(div).toHaveClass('rounded-lg');
      expect(div).toHaveClass('p-3');
    });
  });

  it('About tab shows version and data sources', () => {
    renderSettings();
    selectTab(/About/);
    expect(screen.getByText('Earth Sentinel 3D v1.0.0')).toBeInTheDocument();
    expect(screen.getByText(/Data sources:/)).toBeInTheDocument();
    expect(screen.getByText(/Earth textures:/)).toBeInTheDocument();
  });

  it('About tab credits FIRMS and GIBS (T3.13)', () => {
    renderSettings();
    selectTab(/About/);
    expect(screen.getByText(/NASA FIRMS/)).toBeInTheDocument();
    expect(screen.getByText(/NASA GIBS/)).toBeInTheDocument();
    expect(screen.getByText(/NASA Visible Earth/)).toBeInTheDocument();
  });

  it('Single-key shortcuts switch is present and functional', () => {
    renderSettings();
    selectTab(/Shortcuts/);
    const switchControl = screen.getByRole('switch', { name: 'Toggle single-key shortcuts' });
    expect(switchControl).toBeInTheDocument();
    expect(switchControl).toBeChecked();
  });
});

describe('SettingsModal low-power mode (T4.6)', () => {
  afterEach(() => {
    cleanup();
  });

  function renderWithLowPower(preference: 'auto' | 'on' | 'off', active: boolean) {
    const onChange = vi.fn();
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        isRotating={true}
        onToggleRotation={vi.fn()}
        rendererInfo={mockRendererInfo}
        activeLayer="earthquakes"
        dataStatus={mockDataStatus}
        cacheHit={false}
        lowPowerPreference={preference}
        onLowPowerPreferenceChange={onChange}
        lowPowerActive={active}
      />,
    );
    return { onChange };
  }

  it('offers Auto / On / Off as a radio group with the stored mode checked', () => {
    renderWithLowPower('auto', false);
    const group = screen.getByRole('radiogroup', { name: 'Low-power mode' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Low-power mode auto' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Low-power mode on' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('radio', { name: 'Low-power mode off' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('forwards mode changes to the caller (persistence lives there)', () => {
    const { onChange } = renderWithLowPower('auto', false);
    fireEvent.click(screen.getByRole('radio', { name: 'Low-power mode on' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('on');
  });

  it('shows the preference next to what is actually rendering', () => {
    renderWithLowPower('off', false);
    expect(screen.getByText('Off — full quality')).toBeInTheDocument();
  });

  it('reports the resolved low-power state in Diagnostics', () => {
    const mm = mockReducedMotion(false);
    try {
      renderWithLowPower('on', true);
      selectTab(/Diagnostics/);
      expect(screen.getByText('Low-power mode')).toBeInTheDocument();
      expect(screen.getByText('On — low-power rendering active')).toBeInTheDocument();
    } finally {
      mm.restore();
    }
  });

  it('keeps reduced motion independent: forcing low-power on never claims reduced motion', () => {
    const mm = mockReducedMotion(false);
    try {
      renderWithLowPower('on', true);
      selectTab(/Diagnostics/);
      expect(screen.getByText('Full')).toBeInTheDocument();
      expect(screen.queryByText(/Reduced \(system\)/)).not.toBeInTheDocument();
    } finally {
      mm.restore();
    }
  });
});

describe('SettingsModal geographic grid (Phase 3)', () => {
  afterEach(() => {
    cleanup();
  });

  function renderWithGrid(visible: boolean) {
    const onChange = vi.fn();
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        isRotating={true}
        onToggleRotation={vi.fn()}
        rendererInfo={mockRendererInfo}
        activeLayer="earthquakes"
        dataStatus={mockDataStatus}
        cacheHit={false}
        globeGrid={visible}
        onGlobeGridChange={onChange}
      />,
    );
    return { onChange };
  }

  it('exposes the grid switch with an accessible name and current state', () => {
    renderWithGrid(true);
    const gridSwitch = screen.getByRole('switch', { name: 'Toggle geographic grid' });
    expect(gridSwitch).toBeInTheDocument();
    expect(gridSwitch).toBeChecked();
  });

  it('is off by default and forwards changes to the caller (persistence lives there)', () => {
    const { onChange } = renderWithGrid(false);
    const gridSwitch = screen.getByRole('switch', { name: 'Toggle geographic grid' });
    expect(gridSwitch).not.toBeChecked();

    fireEvent.click(gridSwitch);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

// Controllable reduced-motion double for the Diagnostics tab.
function mockReducedMotion(initialMatches: boolean) {
  const matches = initialMatches;
  const listeners = new Set<() => void>();
  const mql = {
    matches: initialMatches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn((_type: string, cb: () => void) => {
      listeners.add(cb);
    }),
    removeEventListener: vi.fn((_type: string, cb: () => void) => {
      listeners.delete(cb);
    }),
  };
  const prev = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => {
      mql.matches = matches;
      return mql;
    }),
  });
  return {
    restore() {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: prev,
      });
    },
  };
}

function mockClipboard(writeText: (text: string) => Promise<void>) {
  const prev = navigator.clipboard;
  const writeTextFn = vi.fn(writeText);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: { writeText: writeTextFn },
  });
  return {
    writeTextFn,
    restore() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        writable: true,
        value: prev,
      });
    },
  };
}

describe('SettingsModal diagnostics content (T3.13)', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the motion preference and server-cache rows from live state', () => {
    const mm = mockReducedMotion(false);
    try {
      renderSettings();
      selectTab(/Diagnostics/);
      expect(screen.getByText('Motion preference')).toBeInTheDocument();
      expect(screen.getByText('Full')).toBeInTheDocument();
      expect(screen.getByText('Server cache')).toBeInTheDocument();
      // cacheHit={false} renders a miss, never an implied hit.
      expect(screen.getByText(/miss \(fresh provider response\)/)).toBeInTheDocument();
    } finally {
      mm.restore();
    }
  });

  it('reports a reduced system motion preference truthfully', () => {
    const mm = mockReducedMotion(true);
    try {
      renderSettings();
      selectTab(/Diagnostics/);
      expect(screen.getByText(/Reduced \(system\)/)).toBeInTheDocument();
    } finally {
      mm.restore();
    }
  });

  it('copies exactly the displayed report and confirms success', async () => {
    const mm = mockReducedMotion(false);
    const clip = mockClipboard(() => Promise.resolve());
    try {
      renderSettings();
      selectTab(/Diagnostics/);
      fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostics report' }));
      await screen.findByText('Report copied.');
      expect(clip.writeTextFn).toHaveBeenCalledTimes(1);
      const copied = String(clip.writeTextFn.mock.calls[0]?.[0] ?? '');
      expect(copied).toContain('Earth Sentinel 3D diagnostics');
      expect(copied).toContain('API base: /api/v1');
      expect(copied).toContain('Current layer: earthquakes');
      expect(copied).toContain('Motion preference: Full');
      // Never secrets or key-bearing parameters.
      expect(copied).not.toMatch(/api_key|API_KEY|token|secret|password/i);
      expect(copied).not.toMatch(/[?&](key|api_key|token)=/i);
    } finally {
      clip.restore();
      mm.restore();
    }
  });

  it('reports clipboard failure gracefully instead of throwing', async () => {
    const mm = mockReducedMotion(false);
    const clip = mockClipboard(() => Promise.reject(new Error('denied')));
    try {
      renderSettings();
      selectTab(/Diagnostics/);
      fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostics report' }));
      await screen.findByText(/Copy failed/);
      expect(screen.getByRole('button', { name: 'Copy diagnostics report' })).toBeInTheDocument();
    } finally {
      clip.restore();
      mm.restore();
    }
  });
});

describe('diagnostic row builder (T3.13)', () => {
  const base = {
    apiBase: '/api/v1',
    apiSource: 'same-origin · dev build',
    health: 'ok · sentinel v1.0.0',
    latencyMs: 12,
    lastOk: '2026-10-12T00:00:00.000Z',
    activeLayer: 'earthquakes' as const,
    dataStatus: { status: 'live', source: 'USGS', fetched_at: '2026-10-12T00:00:00.000Z' } as DataStatus,
    webgpuProbe: 'supported (test)',
    navigatorGpu: true,
    rendererInfo: mockRendererInfo,
  };

  it('distinguishes server cache hit, miss, and unknown', () => {
    const hit = Object.fromEntries(buildDiagnosticRows({ ...base, reducedMotion: false, cacheHit: true }));
    const miss = Object.fromEntries(buildDiagnosticRows({ ...base, reducedMotion: false, cacheHit: false }));
    const unknown = Object.fromEntries(buildDiagnosticRows({ ...base, reducedMotion: false, cacheHit: null }));
    expect(hit['Server cache']).toMatch(/hit/);
    expect(miss['Server cache']).toMatch(/miss/);
    expect(unknown['Server cache']).toBe('—');
  });

  it('falls back honestly when health or layer data is missing', () => {
    const rows = Object.fromEntries(
      buildDiagnosticRows({ ...base, reducedMotion: false, cacheHit: null, health: null, dataStatus: null, activeLayer: null }),
    );
    expect(rows['Backend health']).toBe('checking…');
    expect(rows['Data status']).toBe('no layer data');
    expect(rows['Current layer']).toBe('none');
  });

  it('formats the copied report from the same rows the UI shows', () => {
    const rows = buildDiagnosticRows({ ...base, reducedMotion: true, cacheHit: true });
    const text = formatDiagnosticReport(rows);
    expect(text).toContain('Motion preference: Reduced (system)');
    expect(text).toContain('Server cache: hit');
    expect(text.split('\n')).toHaveLength(rows.length + 1);
  });

  it('reports the low-power preference next to the resolved state', () => {
    const on = Object.fromEntries(
      buildDiagnosticRows({ ...base, reducedMotion: false, cacheHit: false, lowPowerPreference: 'on', lowPowerActive: true }),
    );
    expect(on['Low-power mode']).toBe('On — low-power rendering active');
    const off = Object.fromEntries(
      buildDiagnosticRows({ ...base, reducedMotion: false, cacheHit: false, lowPowerPreference: 'off', lowPowerActive: false }),
    );
    expect(off['Low-power mode']).toBe('Off — full quality');
  });

  it('reads an em-dash when the caller omits the low-power fields', () => {
    const rows = Object.fromEntries(
      buildDiagnosticRows({ ...base, reducedMotion: false, cacheHit: false }),
    );
    expect(rows['Low-power mode']).toBe('—');
  });
});
