import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import LayerRail from '@/components/shell/LayerRail';

// T3.9: layer selection stays usable on narrow screens — the horizontal
// strip keeps all 8 layers with 44px touch targets, full accessible names,
// and pressed state; no second navigation system is introduced.
describe('LayerRail responsive layout (T3.9)', () => {
  it('renders all 8 layers in the mobile strip with 44px targets', () => {
    render(<LayerRail activeLayer={null} onLayerToggle={vi.fn()} />);
    // Both variants render (CSS picks the visible one); scope to horizontal.
    const strips = screen.getAllByRole('toolbar', { name: 'Environmental layers' });
    const mobile = strips.find((el) => el.getAttribute('aria-orientation') === 'horizontal')!;
    const buttons = within(mobile).getAllByRole('button');
    expect(buttons).toHaveLength(8);
    buttons.forEach((btn) => {
      expect(btn).toHaveClass('h-11');
      expect(btn).toHaveClass('min-w-11');
    });
  });

  it('keeps accessible names and pressed state on the mobile strip', () => {
    render(<LayerRail activeLayer="earthquakes" onLayerToggle={vi.fn()} />);
    const strips = screen.getAllByRole('toolbar', { name: 'Environmental layers' });
    const mobile = strips.find((el) => el.getAttribute('aria-orientation') === 'horizontal')!;
    expect(
      within(mobile).getByRole('button', { name: 'Toggle Earthquakes layer' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(mobile).getByRole('button', { name: 'Toggle Wind layer' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles layers from the mobile strip', () => {
    const onToggle = vi.fn();
    render(<LayerRail activeLayer={null} onLayerToggle={onToggle} />);
    const strips = screen.getAllByRole('toolbar', { name: 'Environmental layers' });
    const mobile = strips.find((el) => el.getAttribute('aria-orientation') === 'horizontal')!;
    within(mobile).getByRole('button', { name: 'Toggle Wildfires layer' }).click();
    expect(onToggle).toHaveBeenCalledWith('wildfires');
  });
});
