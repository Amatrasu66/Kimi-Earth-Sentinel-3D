import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DataPoint } from '@/types';

// The engine itself is covered by DottedEarth.test.tsx; this proves the
// stage wiring — that the base globe is mounted by the stage, is never
// gated on a data layer, and is skipped only for an explicit 3D override.
vi.mock('@/components/globe/dotted/DottedEarth', () => ({
  default: function MockDottedEarth(props: { dataPoints?: DataPoint[] }) {
    return (
      <div
        data-testid="dotted-earth"
        data-point-count={String(props.dataPoints?.length ?? 0)}
      />
    );
  },
}));

import GlobeStage from './GlobeStage';

function setUrl(path: string) {
  window.history.replaceState(null, '', path);
}

describe('GlobeStage base Earth (GLOBE-1)', () => {
  afterEach(() => {
    setUrl('/');
  });

  it('mounts the dotted Earth in the default renderer mode', () => {
    setUrl('/');
    render(<GlobeStage />);
    expect(screen.getByTestId('dotted-earth')).toBeInTheDocument();
  });

  it('keeps the drafting frame and locator in every mode', () => {
    setUrl('/');
    const { unmount } = render(<GlobeStage />);
    expect(screen.getByText('SENTINEL STAGE · WGS 84')).toBeInTheDocument();
    expect(document.querySelectorAll('.globe-stage-tick')).toHaveLength(4);
    unmount();

    setUrl('/?renderer=webgl');
    render(<GlobeStage />);
    expect(screen.getByText('SENTINEL STAGE · WGS 84')).toBeInTheDocument();
    expect(document.querySelectorAll('.globe-stage-tick')).toHaveLength(4);
  });

  it('falls back to the bare frame when a 3D renderer is forced', () => {
    setUrl('/?renderer=webgl');
    const forcedGl = render(<GlobeStage />);
    expect(screen.queryByTestId('dotted-earth')).not.toBeInTheDocument();
    forcedGl.unmount();

    setUrl('/?renderer=webgpu');
    render(<GlobeStage />);
    expect(screen.queryByTestId('dotted-earth')).not.toBeInTheDocument();
  });

  it('mounts the globe even with no data layer at all', () => {
    setUrl('/');
    render(<GlobeStage dataPoints={[]} />);
    expect(screen.getByTestId('dotted-earth')).toHaveAttribute('data-point-count', '0');
  });

  it('forwards layer points to the globe', () => {
    setUrl('/');
    const points = [
      { id: 'a', lat: 1, lon: 2, severity: 'low', timestamp: '2026-10-06T00:00:00Z' },
      { id: 'b', lat: 3, lon: 4, severity: 'high', timestamp: '2026-10-06T00:00:00Z' },
    ] as DataPoint[];
    render(<GlobeStage dataPoints={points} />);
    expect(screen.getByTestId('dotted-earth')).toHaveAttribute('data-point-count', '2');
  });
});
