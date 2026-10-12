import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppShell from '@/components/shell/AppShell';

// T3.9: the globe stage must survive layout/panel state changes — closing
// the data panel (or opening it) only toggles the panel cell, never the
// stage cell that hosts the Earth.
describe('AppShell responsive composition (T3.9)', () => {
  function renderShell(panel: React.ReactNode) {
    return render(
      <AppShell
        header={<div data-testid="header" />}
        rail={<div data-testid="rail" />}
        stage={<div data-testid="stage-globe" />}
        panel={panel}
        status={<div data-testid="status" />}
      />,
    );
  }

  it('keeps the stage mounted when the panel is open', () => {
    renderShell(<div data-testid="panel" />);
    expect(screen.getByTestId('stage-globe')).toBeInTheDocument();
    expect(screen.getByTestId('panel')).toBeInTheDocument();
  });

  it('keeps the stage mounted when the panel is closed', () => {
    renderShell(null);
    expect(screen.getByTestId('stage-globe')).toBeInTheDocument();
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  it('switches workspace geometry without moving the stage cell', () => {
    const { rerender } = renderShell(<div data-testid="panel" />);
    const workspace = screen.getByRole('main', { name: 'Earth Sentinel workspace' });
    expect(workspace).not.toHaveClass('sentinel-workspace--no-panel');

    rerender(
      <AppShell
        header={<div data-testid="header" />}
        rail={<div data-testid="rail" />}
        stage={<div data-testid="stage-globe" />}
        panel={null}
        status={<div data-testid="status" />}
      />,
    );
    expect(workspace).toHaveClass('sentinel-workspace--no-panel');
    expect(screen.getByTestId('stage-globe')).toBeInTheDocument();
  });
});
