import { useState } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

// Fake Cesium runtime: no WebGL, no network. `loadCesiumRuntime` is the
// only `cesiumConfig` seam substituted; the provider factory module is
// wrapped so one synthetic second base (`test-future-base`) behaves like a
// future verified provider — this exercises the replacement orchestration
// that is unreachable with today's single real base. `resolveBaseLayerId`
// passes test ids through for the same reason; the real validation lives
// in `imageryLayers.test.ts`.
const { loadCesiumRuntime } = vi.hoisted(() => ({ loadCesiumRuntime: vi.fn() }));

vi.mock('./cesiumConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cesiumConfig')>()),
  loadCesiumRuntime,
}));

vi.mock('./cesiumImageryProviders', async (importOriginal) => {
  const real = await importOriginal<typeof import('./cesiumImageryProviders')>();
  return {
    ...real,
    createBaseImageryProvider: vi.fn(
      (cesium: unknown, layerId: unknown, now?: Date) => {
        if (layerId === 'test-future-base') {
          return {
            errorEvent: { addEventListener: vi.fn(() => () => {}) },
          };
        }
        return real.createBaseImageryProvider(
          cesium as Parameters<typeof real.createBaseImageryProvider>[0],
          layerId,
          now,
        );
      },
    ),
  };
});

vi.mock('./imageryLayers', async (importOriginal) => {
  const real = await importOriginal<typeof import('./imageryLayers')>();
  return {
    ...real,
    resolveBaseLayerId: (layerId: unknown) =>
      typeof layerId === 'string' && layerId !== ''
        ? layerId
        : real.DEFAULT_BASE_LAYER_ID,
  };
});

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => false,
}));

import CesiumEarth from './CesiumEarth';

interface FakeLayer {
  show: boolean;
  alpha: number;
}

function makeViewer(initialBaseLayer?: FakeLayer) {
  // Like the real Viewer, the constructor-provided base layer is part of
  // the collection from the start (so `contains` sees it).
  const layers: FakeLayer[] = initialBaseLayer ? [initialBaseLayer] : [];
  const camera = {
    setView: vi.fn(),
    flyTo: vi.fn(),
    pickEllipsoid: vi.fn(() => ({ x: 1, y: 2, z: 3 })),
    position: { height: 5_000_000 },
  };
  const viewer = {
    camera,
    scene: {
      canvas: document.createElement('canvas'),
      globe: {
        ellipsoid: { radii: 'wgs84' },
        maximumScreenSpaceError: 2,
        enableLighting: true as boolean,
        baseColor: undefined as { css?: string } | undefined,
      },
      backgroundColor: undefined as { css?: string } | undefined,
      msaaSamples: 4,
    },
    imageryLayers: {
      addImageryProvider: vi.fn(() => {
        const layer: FakeLayer = { show: true, alpha: 1 };
        layers.push(layer);
        return layer;
      }),
      contains: vi.fn((layer: FakeLayer) => layers.includes(layer)),
      remove: vi.fn((layer: FakeLayer) => {
        const index = layers.indexOf(layer);
        if (index >= 0) layers.splice(index, 1);
        return true;
      }),
      lowerToBottom: vi.fn((layer: FakeLayer) => {
        const index = layers.indexOf(layer);
        if (index >= 0) {
          layers.splice(index, 1);
          layers.unshift(layer);
        }
      }),
    },
    resolutionScale: 1,
    destroy: vi.fn(),
    isDestroyed: vi.fn(() => false),
    __layers: layers,
  };
  return viewer;
}

type FakeViewer = ReturnType<typeof makeViewer>;

let viewers: FakeViewer[];
let ViewerCtor: ReturnType<typeof vi.fn>;
let baseInstances: FakeLayer[];

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
      const layer: FakeLayer = { show: true, alpha: 1 };
      baseInstances.push(layer);
      return layer;
    }),
    EllipsoidTerrainProvider: vi.fn(function (this: unknown) {
      return {};
    }),
    Color: {
      fromCssColorString: vi.fn((css: string) => ({
        css,
        withAlpha: (alpha: number) => ({ css, alpha }),
      })),
      TRANSPARENT: { css: 'transparent' },
    },
    GridImageryProvider: vi.fn(function (this: unknown) {
      return {};
    }),
    Viewer: ViewerCtor,
    ScreenSpaceEventHandler: vi.fn(function (this: unknown) {
      return { setInputAction: vi.fn(), destroy: vi.fn() };
    }),
    ScreenSpaceEventType: { LEFT_CLICK: 'LEFT_CLICK' },
    Cartesian3: { fromDegrees: vi.fn((lon: number, lat: number, h: number) => ({ lon, lat, h })) },
    Cartographic: {
      fromCartesian: vi.fn(() => ({ latitude: 0.26, longitude: -1.23, height: 0 })),
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
  baseInstances = [];
  ViewerCtor = vi.fn(function (this: unknown, _container: unknown, options?: { baseLayer?: FakeLayer }) {
    const viewer = makeViewer(options?.baseLayer);
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

async function renderReady(extra: Record<string, unknown> = {}) {
  const utils = render(<Harness {...extra} />);
  await waitFor(() => expect(ViewerCtor).toHaveBeenCalledTimes(1));
  const lastDetail = () => {
    const calls = harnessMocks.onActiveRenderer.mock.calls as Array<[{ detail?: string }]>;
    return calls.at(-1)?.[0]?.detail ?? '';
  };
  const lastErrorReport = () => {
    const calls = harnessMocks.onLayerError.mock.calls as Array<[string | null]>;
    return calls.at(-1)?.[0];
  };
  const failureReports = () =>
    (harnessMocks.onLayerError.mock.calls as Array<[string | null]>)
      .map(([message]) => message)
      .filter((message) => message !== null);
  return { ...utils, lastDetail, lastErrorReport, failureReports };
}

// Parent-owned error loop (mirrors SentinelApp): the component reports
// failures up and reads the owned error back for its diagnostics text, so
// the Settings status and the detail line can never disagree.
const harnessMocks = {
  onLayerError: vi.fn(),
  onActiveRenderer: vi.fn(),
};

function Harness({
  baseLayerId = null,
  baseOpacity = 1,
  gridOpacity = 1,
}: {
  baseLayerId?: string | null;
  baseOpacity?: number;
  gridOpacity?: number;
}) {
  const [layerError, setLayerError] = useState<string | null>(null);
  return (
    <CesiumEarth
      {...baseProps}
      baseLayerId={baseLayerId}
      baseOpacity={baseOpacity}
      gridOpacity={gridOpacity}
      layerError={layerError}
      onLayerError={(message) => {
        harnessMocks.onLayerError(message);
        setLayerError(message);
      }}
      onActiveRenderer={harnessMocks.onActiveRenderer}
    />
  );
}

describe('CesiumEarth layer management (Phase 4)', () => {
  it('builds the initial base through the factory and applies opacities without rebuilds', async () => {
    const { rerender } = await renderReady({ baseOpacity: 0.4, gridOpacity: 0.6 });
    expect(baseInstances).toHaveLength(1);
    expect(baseInstances[0].alpha).toBeCloseTo(0.4);
    // Collection order mirrors the Viewer: constructor base first, then the grid.
    expect(viewers[0].__layers).toHaveLength(2);
    expect(viewers[0].__layers[0]).toBe(baseInstances[0]);
    expect(viewers[0].__layers[1].alpha).toBeCloseTo(0.6);

    rerender(<Harness baseOpacity={0.9} gridOpacity={0.2} />);
    await waitFor(() => expect(baseInstances[0].alpha).toBeCloseTo(0.9));
    expect(viewers[0].__layers[1].alpha).toBeCloseTo(0.2);
    // Opacity never rebuilds providers or layers.
    expect(viewers[0].imageryLayers.addImageryProvider).toHaveBeenCalledTimes(1);
    expect(ViewerCtor).toHaveBeenCalledTimes(1);
  });

  it('replaces the base add-then-remove with the new layer pinned to the bottom', async () => {
    const { rerender, failureReports } = await renderReady();
    const initialBase = baseInstances[0];
    const add = viewers[0].imageryLayers.addImageryProvider;

    rerender(<Harness baseLayerId="test-future-base" />);
    await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    const replacement = add.mock.results[1]?.value as FakeLayer;

    // New layer attached first, pinned below the overlay, old one removed.
    expect(viewers[0].imageryLayers.lowerToBottom).toHaveBeenCalledWith(replacement);
    expect(viewers[0].imageryLayers.remove).toHaveBeenCalledWith(initialBase, true);
    // Collection order: replacement base at the bottom, grid above it.
    expect(viewers[0].__layers[0]).toBe(replacement);
    // The replacement inherits the current base opacity.
    expect(replacement.alpha).toBeCloseTo(1);
    // No failure reported (mount clears with null; no failure since).
    expect(failureReports()).toHaveLength(0);

    // Re-selecting the same base is a no-op — never a duplicate layer.
    rerender(<Harness baseLayerId="test-future-base" />);
    await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    expect(viewers[0].__layers.filter((l) => l === replacement)).toHaveLength(1);
  });

  it('preserves the previous working layer when the replacement fails', async () => {
    const { rerender, lastDetail, lastErrorReport, failureReports } = await renderReady();
    const initialBase = baseInstances[0];
    const add = viewers[0].imageryLayers.addImageryProvider;

    // The real factory throws for this id (no verified provider).
    rerender(<Harness baseLayerId="test-broken-base" />);
    await waitFor(() => expect(failureReports()).toHaveLength(1));
    expect(failureReports()[0]).toMatch(/no verified provider/i);

    // Nothing attached, nothing removed: the working layer survives.
    expect(add).toHaveBeenCalledTimes(1);
    expect(viewers[0].imageryLayers.remove).not.toHaveBeenCalled();
    expect(baseInstances[0]).toBe(initialBase);

    // The failure is visible in the diagnostics detail text…
    await waitFor(() => expect(lastDetail()).toMatch(/no verified provider/i));
    // …and recovery clears it: re-selecting the working layer resolves
    // without error.
    rerender(<Harness baseLayerId="gibs-modis-truecolor" />);
    await waitFor(() => expect(lastErrorReport()).toBeNull());
    await waitFor(() => expect(lastDetail()).toContain('GIBS true-color'));
  });

  it('supports repeated sequential switches without leaking layers', async () => {
    const { rerender } = await renderReady();
    const add = viewers[0].imageryLayers.addImageryProvider;
    const remove = viewers[0].imageryLayers.remove;

    rerender(<Harness baseLayerId="test-future-base" />);
    await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    // Back to the verified base: the interim layer is removed, not kept.
    rerender(<Harness baseLayerId="gibs-modis-truecolor" />);
    await waitFor(() => expect(add).toHaveBeenCalledTimes(3));
    expect(remove.mock.calls.length).toBeGreaterThanOrEqual(2);
    // Exactly the overlay plus the latest base survive; one Viewer only.
    expect(viewers[0].__layers).toHaveLength(2);
    expect(ViewerCtor).toHaveBeenCalledTimes(1);
  });
});
