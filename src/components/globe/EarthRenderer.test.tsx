import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// Both renderer branches are stubbed at the module boundary so this test
// proves prop plumbing — one authoritative `sunDirection` tuple reaching
// each path — without booting WebGPU/R3F (no GPU in jsdom/CI).
// T4.5: both 3D branches are `next/dynamic` (WebGL included), so the stub
// resolves per import path — the loader source names its target module.
// Phase 2: the Cesium branch resolves the same way (no sun plumbing — the
// PoC accepts the prop for contract parity and wires it in Phase 4+).
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => {
    if (String(loader).includes('GlobeScene')) {
      return function MockGlobeScene(props: { sunDirection?: unknown }) {
        return (
          <div data-testid="globe-scene" data-sun={JSON.stringify(props.sunDirection)} />
        );
      };
    }
    if (String(loader).includes('CesiumEarth')) {
      return function MockCesiumEarth(props: {
        onCoordinatePick?: (lat: number, lon: number) => void;
      }) {
        return (
          <div
            data-testid="cesium-earth"
            data-pick={typeof props.onCoordinatePick}
            onClick={() => props.onCoordinatePick?.(12.5, -45.25)}
          />
        );
      };
    }
    return function MockWebGPUEarth(props: { sunDirection?: unknown }) {
      return (
        <div data-testid="webgpu-earth" data-sun={JSON.stringify(props.sunDirection)} />
      );
    };
  },
}));

import EarthRenderer from './EarthRenderer';

const SUN: [number, number, number] = [0.12, 0.9, 0.34];

function renderForced(renderer: 'webgl' | 'webgpu' | 'cesium', sunDirection = SUN) {
  window.history.replaceState(null, '', `/?renderer=${renderer}`);
  return render(
    <EarthRenderer
      activeLayer={null}
      dataPoints={[]}
      onMarkerClick={() => {}}
      onMarkerHover={() => {}}
      sunDirection={sunDirection}
      onActiveRenderer={() => {}}
      onCoordinatePick={() => {}}
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

describe('EarthRenderer Cesium branch (Phase 2 PoC)', () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it('selects the Cesium branch for ?renderer=cesium without touching legacy branches', () => {
    renderForced('cesium');
    expect(screen.getByTestId('cesium-earth')).toBeInTheDocument();
    expect(screen.queryByTestId('globe-scene')).not.toBeInTheDocument();
    expect(screen.queryByTestId('webgpu-earth')).not.toBeInTheDocument();
  });

  it('passes the coordinate-pick callback through to the Cesium branch', () => {
    const onCoordinatePick = vi.fn();
    window.history.replaceState(null, '', '/?renderer=cesium');
    render(
      <EarthRenderer
        activeLayer={null}
        dataPoints={[]}
        onMarkerClick={() => {}}
        onMarkerHover={() => {}}
        sunDirection={SUN}
        onActiveRenderer={() => {}}
        onCoordinatePick={onCoordinatePick}
      />,
    );
    expect(screen.getByTestId('cesium-earth').getAttribute('data-pick')).toBe(
      'function',
    );
    screen.getByTestId('cesium-earth').click();
    expect(onCoordinatePick).toHaveBeenCalledWith(12.5, -45.25);
  });

  it('keeps an invalid renderer value on the dotted default', () => {
    window.history.replaceState(null, '', '/?renderer=canvas');
    const { container } = render(
      <EarthRenderer
        activeLayer={null}
        dataPoints={[]}
        onMarkerClick={() => {}}
        onMarkerHover={() => {}}
        sunDirection={SUN}
        onActiveRenderer={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('cesium-earth')).not.toBeInTheDocument();
  });
});

describe('EarthRenderer default mode (GLOBE-1)', () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it('mounts no fullscreen container when the URL does not opt into a 3D path', () => {
    window.history.replaceState(null, '', '/');
    const onActiveRenderer = vi.fn();
    const { container } = render(
      <EarthRenderer
        activeLayer={null}
        dataPoints={[]}
        onMarkerClick={() => {}}
        onMarkerHover={() => {}}
        sunDirection={SUN}
        onActiveRenderer={onActiveRenderer}
      />,
    );

    // The dotted Earth is hosted by GlobeStage, so this fixed container
    // must stay out of the way instead of drawing a blank/black layer.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('globe-scene')).not.toBeInTheDocument();
    expect(screen.queryByTestId('webgpu-earth')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: 'Initializing Earth renderer' }),
    ).not.toBeInTheDocument();
    // Diagnostics belong to the stage-mounted globe in this mode.
    expect(onActiveRenderer).not.toHaveBeenCalled();
  });
});
