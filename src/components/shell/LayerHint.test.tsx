import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LayerHint from '@/components/shell/LayerHint';

describe('LayerHint responsive positioning (T3.9)', () => {
  it('anchors below the header on narrow screens (never over rail/panel)', () => {
    render(<LayerHint onDismiss={vi.fn()} activeLayerName="Earthquakes" singleKeyShortcuts={true} />);
    const hint = screen.getByRole('note', { name: 'Getting started hint' });
    expect(hint).toHaveClass('fixed');
    expect(hint).toHaveClass('z-40');
    expect(hint).toHaveClass('left-4');
    expect(hint).toHaveClass('top-[calc(var(--header-height)+8px)]');
  });

  it('positions at the rail edge on md and up', () => {
    render(<LayerHint onDismiss={vi.fn()} activeLayerName="Earthquakes" singleKeyShortcuts={true} />);
    const hint = screen.getByRole('note', { name: 'Getting started hint' });
    expect(hint).toHaveClass('md:left-[calc(var(--shell-padding)+var(--rail-width)+4px)]');
    expect(hint).toHaveClass('md:top-1/2');
    expect(hint).toHaveClass('md:-translate-y-1/2');
  });

  it('shows "Getting started" copy when layer is active', () => {
    render(<LayerHint onDismiss={vi.fn()} activeLayerName="Earthquakes" singleKeyShortcuts={true} />);
    expect(screen.getByText('Getting started')).toBeInTheDocument();
    expect(screen.getByText(/Earthquakes showing/)).toBeInTheDocument();
    expect(screen.getByText(/Switch layers from the rail or press/)).toBeInTheDocument();
  });

  it('shows "Select layer" copy when no layer is active', () => {
    render(<LayerHint onDismiss={vi.fn()} activeLayerName={null} singleKeyShortcuts={true} />);
    expect(screen.getByText('Select layer')).toBeInTheDocument();
    expect(screen.getByText(/Choose an environmental layer from the rail/)).toBeInTheDocument();
  });

  it('omits shortcut hints when singleKeyShortcuts is false', () => {
    render(<LayerHint onDismiss={vi.fn()} activeLayerName="Earthquakes" singleKeyShortcuts={false} />);
    expect(screen.getByText(/Switch layers from the rail/)).toBeInTheDocument();
    expect(screen.queryByText(/press.*1.*8/)).not.toBeInTheDocument();
  });

  it('has dismiss button with accessible label', () => {
    render(<LayerHint onDismiss={vi.fn()} activeLayerName="Earthquakes" singleKeyShortcuts={true} />);
    const dismissBtn = screen.getByRole('button', { name: 'Dismiss getting started hint' });
    expect(dismissBtn).toBeInTheDocument();
  });

  it('has panel-enter animation class', () => {
    render(<LayerHint onDismiss={vi.fn()} activeLayerName="Earthquakes" singleKeyShortcuts={true} />);
    const hint = screen.getByRole('note', { name: 'Getting started hint' });
    expect(hint).toHaveClass('panel-enter');
  });

  it('has max-width constraint and border accent', () => {
    render(<LayerHint onDismiss={vi.fn()} activeLayerName="Earthquakes" singleKeyShortcuts={true} />);
    const hint = screen.getByRole('note', { name: 'Getting started hint' });
    expect(hint).toHaveClass('max-w-[220px]');
    expect(hint).toHaveClass('border-l-2');
    expect(hint).toHaveClass('border-sentinel-accent/60');
  });
});