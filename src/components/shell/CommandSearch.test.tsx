import { describe, expect, it, vi } from 'vitest';
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

describe('CommandSearch grouped order', () => {
  it('selects the displayed (grouped) item on Enter, not the raw API index', async () => {
    const onResultClick = vi.fn();
    render(<CommandSearch onResultClick={onResultClick} />);

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
    render(<CommandSearch onResultClick={onResultClick} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tok' } });
    await screen.findByRole('option', { name: /Tokyo/ });

    // One ArrowDown moves to the second displayed row (Fire North).
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onResultClick).toHaveBeenCalledWith(1, 2);
  });
});
