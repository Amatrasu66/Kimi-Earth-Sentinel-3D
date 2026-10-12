import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ValueHistogram from '@/components/charts/ValueHistogram';
import { buildHistogram } from '@/lib/histogram';
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

  it('bins every value exactly once across the observed range', () => {
    const pts = [4.1, 4.5, 5.0, 5.2, 6.1, 6.8, 7.0].map((m, i) => point(`b${i}`, m));
    const model = buildHistogram(pts, 8);
    expect(model).not.toBeNull();
    expect(model!.rows).toHaveLength(8);
    expect(model!.rows.reduce((sum, r) => sum + (r['count'] as number), 0)).toBe(7);
    expect(model!.min).toBe(4.1);
    expect(model!.max).toBe(7.0);
  });
});

describe('ValueHistogram responsive layout (T3.9)', () => {
  it('has minimum height constraint for narrow containers', () => {
    const pts = [4.1, 4.5, 5.0, 5.2, 6.1, 6.8, 7.0].map((m, i) => point(`c${i}`, m));
    const { container } = render(<ValueHistogram points={pts} activeLayer="earthquakes" />);
    const root = container.querySelector('[role="img"]');
    expect(root).toHaveClass('min-h-[140px]');
  });

  it('BarChart uses aspectRatio and ParentSize for responsiveness', () => {
    const pts = [4.1, 4.5, 5.0, 5.2, 6.1, 6.8, 7.0].map((m, i) => point(`d${i}`, m));
    const { container } = render(<ValueHistogram points={pts} activeLayer="earthquakes" />);
    const barChart = container.querySelector('div[style*="aspect-ratio"]');
    expect(barChart).toBeInTheDocument();
  });

  it('shows label and count in header row', () => {
    const pts = [4.1, 4.5, 5.0, 5.2, 6.1, 6.8, 7.0].map((m, i) => point(`e${i}`, m));
    render(<ValueHistogram points={pts} activeLayer="earthquakes" />);
    expect(screen.getByText('Magnitude spread')).toBeInTheDocument();
    expect(screen.getByText('n=7')).toBeInTheDocument();
  });

  it('shows min/max values in footer', () => {
    const pts = [4.1, 4.5, 5.0, 5.2, 6.1, 6.8, 7.0].map((m, i) => point(`f${i}`, m));
    render(<ValueHistogram points={pts} activeLayer="earthquakes" />);
    // Numbers render via String(): 7.0 prints as "7"; unit suffix included.
    expect(screen.getByText('4.1 magnitude')).toBeInTheDocument();
    expect(screen.getByText('7 magnitude')).toBeInTheDocument();
  });
});
