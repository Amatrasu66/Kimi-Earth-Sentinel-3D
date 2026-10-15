import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

// Fake Cesium runtime: no WebGL, no network. The component under test loads
// it through `loadCesiumRuntime`, which is the only seam substituted here —
// every other export of `./cesiumConfig` stays real.
const { loadCesiumRuntime } = vi.hoisted(() => ({ loadCesiumRuntime: vi.fn() }));

vi.mock('./cesiumConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cesiumConfig')>()),
  loadCesiumRuntime,
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => false,
}));

import CesiumEarth from './CesiumEarth';

interface FakeCamera {
  setView: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
  pickEllipsoid: ReturnType<typeof vi.fn>;
  position: { height: number };
}

function makeViewer() {
  const errorListeners: Array<() => void> = [];
  const camera: FakeCamera = {
    setView: vi.fn(),
    flyTo: vi.fn(),
    pickEllipsoid: vi.fn(() => ({ x: 1, y: 2, z: 3 })),
    position: { height: 5_000_000 },
  };
  const viewer = {
    camera,
    scene: {
      canvas: document.createElement('canvas'),
      globe: { ellipsoid: { radii: 'wgs84' }, maximumScreenSpaceError: 2 },
    },
    resolutionScale: 1,
    destroy: vi.fn(),
    isDestroyed: vi.fn(() => false),
    __errorListeners: errorListeners,
  };
  return viewer;
}

type FakeViewer = ReturnType<typeof makeViewer>;

let viewers: FakeViewer[];
let clickCallback: ((movement: { position?: { x: number; y: number } }) => void) | null;
let ViewerCtor: ReturnType<typeof vi.fn>;

function fakeCesiumNamespace() {
  return {
    WebMapTileServiceImageryProvider: vi.fn(function (this: unknown) {
      return {
        errorEvent: {
          addEventListener: vi.fn(() => () => {}),
          removeEventListener: vi.fn(),
        },
      };
    }),
    ImageryLayer: vi.fn(function (this: unknown) {
      return {};
    }),
    EllipsoidTerrainProvider: vi.fn(function (this: unknown) {
      return {};
    }),
    Viewer: ViewerCtor,
    ScreenSpaceEventHandler: vi.fn(function (this: unknown) {
      return {
        setInputAction: vi.fn((cb: typeof clickCallback) => {
          clickCallback = cb;
        }),
        destroy: vi.fn(),
      };
    }),
    ScreenSpaceEventType: { LEFT_CLICK: 'LEFT_CLICK' },
    Cartesian3: { fromDegrees: vi.fn((lon: number, lat: number, h: number) => ({ lon, lat, h })) },
    Cartographic: {
      // Fixed fixture: 15°N, 70.7°W in radians, echoing camera altitude.
      fromCartesian: vi.fn((pos: { height?: number }) => ({
        latitude: 0.261799,
        longitude: -1.234,
        height: pos?.height ?? 0,
      })),
    },
    Math: {
      toDegrees: (r: number) => (r * 180) / Math.PI,
      toRadians: (d: number) => (d * Math.PI) / 180,
    },
    Ellipsoid: { WGS84: {} },
    Credit: vi.fn(function (this: unknown) {
      return {};
    }),
  };
}

const baseProps = {
  activeLayer: null as null,
  dataPoints: [],
  onMarkerClick: () => {},
  onMarkerHover: () => {},
};

beforeEach(() => {
  viewers = [];
  clickCallback = null;
  ViewerCtor = vi.fn(function (this: unknown) {
    const viewer = makeViewer();
    viewers.push(viewer);
    return viewer;
  });
  loadCesiumRuntime.mockResolvedValue(fakeCesiumNamespace());
  delete (window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CesiumEarth loading and init (Phase 2)', () => {
  it('shows a loading veil, then sets the asset base URL and builds a token-free Viewer', async () => {
    render(<CesiumEarth {...baseProps} />);
    expect(
      screen.getByRole('status', { name: 'Loading Cesium Earth renderer' }),
    ).toBeInTheDocument();

    await waitFor(() => expect(ViewerCtor).toHaveBeenCalledTimes(1));
    expect(
      (window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL,
    ).toBe('/cesium');

    const [, options] = ViewerCtor.mock.calls[0] as unknown as [
      unknown,
      { baseLayer: unknown; terrainProvider: unknown; animation: boolean; timeline: boolean },
    ];
    // Token-free base + ellipsoid terrain + dashboard-fitting chrome.
    expect(options.baseLayer).toBeDefined();
    expect(options.terrainProvider).toBeDefined();
    expect(options.animation).toBe(false);
    expect(options.timeline).toBe(false);
    // Loading veil clears on ready.
    await waitFor(() =>
      expect(
        screen.queryByRole('status', { name: 'Loading Cesium Earth renderer' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('shows a recoverable error veil when Viewer construction fails', async () => {
    ViewerCtor.mockImplementation(() => {
      throw new Error('WebGL not available');
    });
    const onActiveRenderer = vi.fn();
    render(<CesiumEarth {...baseProps} onActiveRenderer={onActiveRenderer} />);

    const alert = await screen.findByRole('alert', {
      name: 'Cesium Earth failed to initialize',
    });
    expect(alert).toHaveTextContent('WebGL not available');
    expect(alert).toHaveTextContent('?renderer=cesium');
    await waitFor(() =>
      expect(onActiveRenderer).toHaveBeenCalledWith(
        expect.objectContaining({ active: 'cesium' }),
      ),
    );
    const last = onActiveRenderer.mock.calls.at(-1)?.[0] as { detail: string };
    expect(last.detail).toContain('WebGL not available');
  });

  it('shows a recoverable error veil when the runtime module fails to load', async () => {
    loadCesiumRuntime.mockRejectedValueOnce(new Error('chunk failed'));
    render(<CesiumEarth {...baseProps} />);
    const alert = await screen.findByRole('alert', {
      name: 'Cesium Earth failed to initialize',
    });
    expect(alert).toHaveTextContent('chunk failed');
    expect(ViewerCtor).not.toHaveBeenCalled();
  });
});

describe('CesiumEarth lifecycle (Phase 2)', () => {
  it('destroys the Viewer exactly once on unmount and never double-builds', async () => {
    const { unmount } = render(<CesiumEarth {...baseProps} />);
    await waitFor(() => expect(ViewerCtor).toHaveBeenCalledTimes(1));
    unmount();
    expect(viewers).toHaveLength(1);
    expect(viewers[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('leaves exactly one working Viewer under React StrictMode', async () => {
    const { unmount } = render(
      <StrictMode>
        <CesiumEarth {...baseProps} />
      </StrictMode>,
    );
    await waitFor(() => {
      const live = viewers.filter((v) => v.destroy.mock.calls.length === 0);
      expect(live).toHaveLength(1);
    });
    // The abandoned StrictMode pass cleaned up after itself.
    expect(viewers.length).toBeLessThanOrEqual(2);
    unmount();
    for (const viewer of viewers) {
      expect(viewer.destroy).toHaveBeenCalledTimes(1);
    }
  });

  it('applies low-power rendering policy without remounting', async () => {
    const { rerender } = render(<CesiumEarth {...baseProps} />);
    await waitFor(() => expect(ViewerCtor).toHaveBeenCalledTimes(1));
    expect(viewers[0].resolutionScale).toBe(1);

    rerender(<CesiumEarth {...baseProps} lowPowerActive />);
    await waitFor(() => expect(viewers[0].resolutionScale).toBe(0.5));
    expect(viewers[0].scene.globe.maximumScreenSpaceError).toBe(4);
    expect(ViewerCtor).toHaveBeenCalledTimes(1);
  });
});

describe('CesiumEarth picking and fly-to (Phase 2)', () => {
  it('reports validated globe-surface picks in degrees', async () => {
    const onCoordinatePick = vi.fn();
    render(<CesiumEarth {...baseProps} onCoordinatePick={onCoordinatePick} />);
    await waitFor(() => expect(ViewerCtor).toHaveBeenCalledTimes(1));
    expect(clickCallback).not.toBeNull();

    clickCallback?.({ position: { x: 10, y: 20 } });
    expect(onCoordinatePick).toHaveBeenCalledTimes(1);
    const [lat, lon] = onCoordinatePick.mock.calls[0] as [number, number];
    expect(lat).toBeCloseTo(15, 0);
    expect(lon).toBeCloseTo(-70.7, 0);
  });

  it('never calls back for empty-space clicks or invalid picks', async () => {
    const onCoordinatePick = vi.fn();
    render(<CesiumEarth {...baseProps} onCoordinatePick={onCoordinatePick} />);
    await waitFor(() => expect(ViewerCtor).toHaveBeenCalledTimes(1));

    // No position (UI-adjacent click).
    clickCallback?.({});
    // Ellipsoid miss (clicked space).
    viewers[0].camera.pickEllipsoid.mockReturnValueOnce(undefined);
    clickCallback?.({ position: { x: 1, y: 1 } });
    expect(onCoordinatePick).not.toHaveBeenCalled();
  });

  it('flies to search targets at the current altitude', async () => {
    const { rerender } = render(<CesiumEarth {...baseProps} />);
    await waitFor(() => expect(ViewerCtor).toHaveBeenCalledTimes(1));

    rerender(<CesiumEarth {...baseProps} flyTo={{ lat: 35.7, lon: 139.7, key: 1 }} />);
    await waitFor(() => expect(viewers[0].camera.flyTo).toHaveBeenCalledTimes(1));
    const arg = viewers[0].camera.flyTo.mock.calls[0]?.[0] as {
      destination: { lon: number; lat: number; h: number };
      duration: number;
    };
    expect(arg.destination.lon).toBe(139.7);
    expect(arg.destination.lat).toBe(35.7);
    expect(arg.destination.h).toBe(5_000_000);
    expect(arg.duration).toBe(1.4);
  });

  it('ignores out-of-range fly-to targets', async () => {
    render(
      <CesiumEarth {...baseProps} flyTo={{ lat: 500, lon: 0, key: 1 }} />,
    );
    await waitFor(() => expect(ViewerCtor).toHaveBeenCalledTimes(1));
    expect(viewers[0].camera.flyTo).not.toHaveBeenCalled();
    expect(viewers[0].camera.setView).toHaveBeenCalledTimes(1);
  });
});
