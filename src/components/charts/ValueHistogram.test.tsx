import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ValueHistogram from '@/components/charts/ValueHistogram';
import type { DataPoint } from '@/types';

function point(id: string, magnitude: number): DataPoint {
  return {
    id,
    lat: 10,
    lon: 20,
    magnitude,
    severity: magnitude >= 6 ? 'critical' : 'moderate',
    timestamp: new Date().toISOString(),
  };
}

describe('ValueHistogram', () => {
  it('renders nothing below the numeric threshold', () => {
    const { container } = render(
      <ValueHistogram points={[point('a', 5), point('b', 6)]} activeLayer="earthquakes" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing without numeric spread', () => {
    const pts = Array.from({ length: 6 }, (_, i) => point(`p${i}`, 5));
    const { container } = render(<ValueHistogram points={pts} activeLayer="earthquakes" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('summarizes a real spread accessibly', () => {
    const pts = [4.1, 4.5, 5.0, 5.2, 6.1, 6.8, 7.0].map((m, i) => point(`q${i}`, m));
    render(<ValueHistogram points={pts} activeLayer="earthquakes" />);
    expect(screen.getByRole('img', { name: /magnitude spread across 7 current points/i })).toBeInTheDocument();
    expect(screen.getByText('Magnitude spread')).toBeInTheDocument();
  });
});
