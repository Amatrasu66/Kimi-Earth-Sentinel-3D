import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SeverityFilter from '@/components/intelligence/SeverityFilter';

// T3.9: the five-segment filter must fit narrow panels without clipping.
// Wrapping (not truncation or hiding) keeps every severity + count visible;
// selection behaviour is unchanged.
describe('SeverityFilter responsive layout (T3.9)', () => {
  const counts = { low: 12, moderate: 150, high: 64, critical: 200 };

  it('renders all five options with counts (nothing hidden to fit)', () => {
    render(<SeverityFilter counts={counts} total={426} value="all" onChange={vi.fn()} />);
    for (const label of ['all', 'critical', 'high', 'moderate', 'low']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label} \\d+$`, 'i') })).toBeInTheDocument();
    }
  });

  it('wraps instead of overflowing on narrow panels', () => {
    const { container } = render(<SeverityFilter counts={counts} total={426} value="all" onChange={vi.fn()} />);
    const group = container.querySelector('[role="group"]');
    expect(group).toHaveClass('flex-wrap');
  });

  it('keeps aria-pressed selection state intact', () => {
    render(<SeverityFilter counts={counts} total={426} value="high" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^high \d+$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^all \d+$/i })).toHaveAttribute('aria-pressed', 'false');
  });
});
