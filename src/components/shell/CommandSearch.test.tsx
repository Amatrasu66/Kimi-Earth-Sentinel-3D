import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CommandSearch from '@/components/shell/CommandSearch';

// Interleaved API order: event first, location second. The UI groups
// locations first, so display order differs from API order — keyboard and
// pointer selection must follow display order, never the raw array.
vi.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({
    results: [
      { id: 'e1', type: 'event', name: 'Fire North', lat: 1, lon: 2 },
      { id: 'l1', type: 'location', name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
    ],
    loading: false,
    error: null,
    search: vi.fn(),
  }),
}));

// T3.3: the search box is controlled (query text lives in the app shell for
// URL state). The harness below reproduces the shell wiring.
function ControlledSearch({ onResultClick }: { onResultClick: (lat: number, lon: number) => void }) {
  const [query, setQuery] = useState('');
  return <CommandSearch onResultClick={onResultClick} query={query} onQueryChange={setQuery} />;
}

describe('CommandSearch grouped order', () => {
  it('selects the displayed (grouped) item on Enter, not the raw API index', async () => {
    const onResultClick = vi.fn();
    render(<ControlledSearch onResultClick={onResultClick} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tok' } });

    // Debounced dropdown opens with grouped sections.
    await screen.findByRole('option', { name: /Tokyo/ });
    expect(screen.getByText('Locations')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();

    // First displayed row is Tokyo (locations group first).
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onResultClick).toHaveBeenCalledWith(35.6762, 139.6503);
    // Choosing closes the results surface.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('arrow navigation follows display order across groups', async () => {
    const onResultClick = vi.fn();
    render(<ControlledSearch onResultClick={onResultClick} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tok' } });
    await screen.findByRole('option', { name: /Tokyo/ });

    // One ArrowDown moves to the second displayed row (Fire North).
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onResultClick).toHaveBeenCalledWith(1, 2);
  });
});

// T3.5: the results surface must stay compact and viewport-bounded so the
// centered globe keeps breathing room; scrolling belongs to the list, and
// the panel must never resize or shift the layout (absolute overlay).
describe('CommandSearch bounded results surface (T3.5)', () => {
  it('constrains the panel and list with viewport-relative caps', async () => {
    render(<ControlledSearch onResultClick={vi.fn()} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tok' } });
    const listbox = await screen.findByRole('listbox');

    // The list scrolls internally within a viewport-relative cap.
    expect(listbox.className).toContain('overflow-y-auto');
    expect(listbox.className).toContain('max-h-[min(224px,36vh)]');

    // The panel stays absolutely positioned (no layout shift) and bounded.
    const panel = listbox.parentElement;
    expect(panel?.className).toContain('absolute');
    expect(panel?.className).toContain('max-h-[min(320px,50vh)]');
    expect(panel?.className).toContain('overflow-hidden');
  });

  it('keeps keyboard focus indication and the selected row visible contract', async () => {
    render(<ControlledSearch onResultClick={vi.fn()} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tok' } });
    await screen.findByRole('option', { name: /Tokyo/ });

    const box = screen.getByRole('combobox');
    expect(box.getAttribute('aria-expanded')).toBe('true');
    // First row is the active descendant before any navigation.
    expect(box.getAttribute('aria-activedescendant')).toContain('sentinel-search-l1');
    expect(screen.getByRole('option', { name: /Tokyo/ }).getAttribute('aria-selected')).toBe('true');
  });
});

// T3.5: selection closes the surface, preserves the query text, and never
// fires a new lookup for the committed name; event rows keep the existing
// destination-navigation behavior (fly to coordinates).
describe('CommandSearch selection lifecycle (T3.5)', () => {
  it('location choice closes the surface and preserves the query', async () => {
    const onResultClick = vi.fn();
    render(<ControlledSearch onResultClick={onResultClick} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tok' } });
    await screen.findByRole('option', { name: /Tokyo/ });

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onResultClick).toHaveBeenCalledWith(35.6762, 139.6503);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('Tokyo');
  });

  it('event choice keeps the existing destination-navigation behavior', async () => {
    const onResultClick = vi.fn();
    render(<ControlledSearch onResultClick={onResultClick} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tok' } });
    const eventOption = await screen.findByRole('option', { name: /Fire North/ });

    // Pointer selection matches keyboard selection: same coordinates path.
    fireEvent.click(eventOption);
    expect(onResultClick).toHaveBeenCalledWith(1, 2);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('Fire North');
  });

  it('Escape closes the surface without changing the query', async () => {
    const onResultClick = vi.fn();
    render(<ControlledSearch onResultClick={onResultClick} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tok' } });
    await screen.findByRole('option', { name: /Tokyo/ });

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('tok');
    expect(onResultClick).not.toHaveBeenCalled();
  });

  it('refocusing after a choice does not resurface stale results; typing re-enables search', async () => {
    const onResultClick = vi.fn();
    render(<ControlledSearch onResultClick={onResultClick} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tok' } });
    await screen.findByRole('option', { name: /Tokyo/ });

    // Commit the choice: surface closes, query becomes the committed name.
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Refocus must not reopen the previous lookup's rows under the new name.
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Fresh typing re-enables the surface (first keystroke consumes the
    // choice's skip-once flag, the next one runs the debounced lookup).
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Tokyo!' } });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Tokyo!?' } });
    await screen.findByRole('listbox');
  });
});

// T3.10: "/" is a character key, so it obeys the single-key switch and the
// standard guards — never focus-stealing behind a modal or a chord.
describe('CommandSearch "/" shortcut guards (T3.10)', () => {
  it('focuses the input when no modal is open', () => {
    render(<ControlledSearch onResultClick={vi.fn()} />);
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
  });

  it('stands down behind an open modal', () => {
    render(
      <>
        <ControlledSearch onResultClick={vi.fn()} />
        <div role="dialog" aria-label="settings">settings</div>
      </>,
    );
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).not.toBe(screen.getByRole('combobox'));
  });

  it('ignores modifier chords', () => {
    render(<ControlledSearch onResultClick={vi.fn()} />);
    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(document.activeElement).not.toBe(screen.getByRole('combobox'));
  });

  it('is switchable off together with the rest of the single-key map', () => {
    function SingleKeyOff() {
      const [query, setQuery] = useState('');
      return (
        <CommandSearch
          onResultClick={vi.fn()}
          query={query}
          onQueryChange={setQuery}
          singleKeyShortcuts={false}
        />
      );
    }
    render(<SingleKeyOff />);

    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).not.toBe(screen.getByRole('combobox'));
    // The dead key is no longer advertised.
    expect(screen.queryByText('/')).not.toBeInTheDocument();
  });
});
