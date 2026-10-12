import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SettingsModal from '@/components/panels/SettingsModal';
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

  it('Single-key shortcuts switch is present and functional', () => {
    renderSettings();
    selectTab(/Shortcuts/);
    const switchControl = screen.getByRole('switch', { name: 'Toggle single-key shortcuts' });
    expect(switchControl).toBeInTheDocument();
    expect(switchControl).toBeChecked();
  });
});
