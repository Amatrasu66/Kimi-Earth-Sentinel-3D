import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SeverityDistribution from '@/components/intelligence/SeverityDistribution';

describe('SeverityDistribution', () => {
  it('renders nothing when there is no data', () => {
    const { container } = render(<SeverityDistribution counts={{}} total={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces counts per severity for assistive tech', () => {
    render(<SeverityDistribution counts={{ low: 3, critical: 1 }} total={4} />);
    expect(screen.getByRole('img', { name: /low 3.*critical 1/i })).toBeInTheDocument();
  });

  it('shows a legend row with counts, not color alone', () => {
    render(<SeverityDistribution counts={{ moderate: 2, high: 5 }} total={7} />);
    expect(screen.getByText(/moderate 2/i)).toBeInTheDocument();
    expect(screen.getByText(/high 5/i)).toBeInTheDocument();
  });
});
