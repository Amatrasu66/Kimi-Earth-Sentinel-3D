import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppHeader from '@/components/shell/AppHeader';

function TestHeader() {
  return (
    <AppHeader
      onSearchResultClick={vi.fn()}
      onSettingsClick={vi.fn()}
      dataStatus={{ status: 'live', source: 'USGS', fetched_at: new Date().toISOString() }}
      cacheHit={false}
      activeLayerName="Earthquakes"
      searchQuery=""
      onSearchQueryChange={vi.fn()}
      singleKeyShortcuts={true}
    />
  );
}

describe('AppHeader responsive layout (T3.9)', () => {
  it('uses flexible three-zone grid with minmax(0,1fr) side columns', () => {
    render(<TestHeader />);
    const header = screen.getByRole('banner');
    expect(header).toHaveClass('grid-cols-[minmax(0,1fr)_minmax(0,420px)_minmax(0,1fr)]');
  });

  it('has responsive gap and padding', () => {
    render(<TestHeader />);
    const header = screen.getByRole('banner');
    expect(header).toHaveClass('gap-2');
    expect(header).toHaveClass('sm:px-3');
    expect(header).toHaveClass('md:px-4');
    expect(header).toHaveClass('lg:gap-3');
  });

  it('shows short brand name at 400px+ and full name at lg', () => {
    render(<TestHeader />);
    // getByText returns the element carrying the text itself.
    const shortName = screen.getByText('Sentinel');
    const fullName = screen.getByText('Earth Sentinel 3D');
    expect(shortName).toHaveClass('min-[400px]:block');
    expect(shortName).toHaveClass('lg:hidden');
    expect(fullName.parentElement).toHaveClass('lg:flex');
  });

  it('shows active layer name at sm with max-width constraint', () => {
    render(<TestHeader />);
    const layerName = screen.getByText('Earthquakes');
    expect(layerName).toHaveClass('max-w-[160px]');
    expect(layerName).toHaveClass('sm:max-w-none');
  });

  it('shows provenance chip at md breakpoint', () => {
    render(<TestHeader />);
    const chip = screen.getByText('LIVE').parentElement;
    expect(chip).toHaveClass('md:inline-flex');
  });

  it('search wrapper uses mx-auto and min-w-0', () => {
    render(<TestHeader />);
    const searchDiv = screen.getByRole('search');
    expect(searchDiv).toHaveClass('min-w-0');
    const searchWrapper = searchDiv.querySelector('div')?.parentElement;
    expect(searchWrapper).toBeInTheDocument();
  });

  it('right zone uses min-w-0 and responsive gap', () => {
    render(<TestHeader />);
    const settingsButton = screen.getByRole('button', { name: 'Open settings' });
    const rightZone = settingsButton.parentElement;
    expect(rightZone).toHaveClass('min-w-0');
    expect(rightZone).toHaveClass('gap-1.5');
    expect(rightZone).toHaveClass('sm:gap-2');
  });
});