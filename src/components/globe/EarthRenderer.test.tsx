import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// Both renderer branches are stubbed at the module boundary so this test
// proves prop plumbing — one authoritative `sunDirection` tuple reaching
// each path — without booting WebGPU/R3F (no GPU in jsdom/CI).
vi.mock('next/dynamic', () => ({
  default: () => {
    return function MockWebGPUEarth(props: { sunDirection?: unknown }) {
      return (
        <div data-testid="webgpu-earth" data-sun={JSON.stringify(props.sunDirection)} />
      );
    };
  },
}));

vi.mock('./GlobeScene', () => ({
  default: function MockGlobeScene(props: { sunDirection?: unknown }) {
    return (
      <div data-testid="globe-scene" data-sun={JSON.stringify(props.sunDirection)} />
    );
  },
}));

import EarthRenderer from './EarthRenderer';

const SUN: [number, number, number] = [0.12, 0.9, 0.34];

function renderForced(renderer: 'webgl' | 'webgpu', sunDirection = SUN) {
  window.history.replaceState(null, '', `/?renderer=${renderer}`);
  return render(
    <EarthRenderer
      activeLayer={null}
      dataPoints={[]}
      onMarkerClick={() => {}}
      onMarkerHover={() => {}}
      sunDirection={sunDirection}
      onActiveRenderer={() => {}}
    />,
  );
}

describe('EarthRenderer sun direction plumbing (T2.4)', () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it('feeds the authoritative tuple to the WebGL fallback path', () => {
    renderForced('webgl');
    expect(screen.queryByTestId('webgpu-earth')).not.toBeInTheDocument();
    expect(screen.getByTestId('globe-scene').getAttribute('data-sun')).toBe(
      JSON.stringify(SUN),
    );
  });

  it('feeds the identical tuple to the WebGPU path', () => {
    renderForced('webgpu');
    expect(screen.queryByTestId('globe-scene')).not.toBeInTheDocument();
    expect(screen.getByTestId('webgpu-earth').getAttribute('data-sun')).toBe(
      JSON.stringify(SUN),
    );
  });

  it('delivers the same value to both paths (single calculation, no fork)', () => {
    const { unmount } = renderForced('webgl');
    const webglSun = screen.getByTestId('globe-scene').getAttribute('data-sun');
    unmount();
    cleanup();

    renderForced('webgpu');
    const webgpuSun = screen.getByTestId('webgpu-earth').getAttribute('data-sun');
    expect(webgpuSun).toBe(webglSun);
    expect(webgpuSun).toBe(JSON.stringify(SUN));
  });
});
