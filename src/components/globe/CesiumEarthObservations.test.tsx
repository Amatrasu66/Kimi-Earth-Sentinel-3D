import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

// Fake Cesium runtime: no WebGL, no network. `loadCesiumRuntime` is the
// only seam substituted; every other export of the observation and config
// modules stays real (validation, colors, and cap are production code).
const { loadCesiumRuntime } = vi.hoisted(() => ({ loadCesiumRuntime: vi.fn() }));

vi.mock('./cesiumConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cesiumConfig')>()),
  loadCesiumRuntime,
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => false,
}));

import CesiumEarth from './CesiumEarth';
import { SEVERITY_COLORS } from '@/types';
import type { DataPoint } from '@/types';

type InputAction = (movement: { position?: { x: number; y: number } }) => void;

interface FakeEntity {
  id: string;
  options: Record<string, unknown>;
}

function makeViewer() {
  const entities = new Map<string, FakeEntity>();
  const camera = {
    setView: vi.fn(),
    flyTo: vi.fn(),
    // Fixed fixture: 15°N, 70.7°W in radians, echoing camera altitude.
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
      pick: vi.fn((): unknown => undefined),
    },
    imageryLayers: {
      addImageryProvider: vi.fn(() => ({ show: true, alpha: 1 })),
      contains: vi.fn(() => false),
      remove: vi.fn(() => true),
      lowerToBottom: vi.fn(),
    },
    entities: {
      add: vi.fn((options: { id: string } & Record<string, unknown>) => {
        const entity: FakeEntity = { id: options.id, options };
        entities.set(options.id, entity);
        return entity;
      }),
      remove: vi.fn((entity: FakeEntity) => entities.delete(entity.id)),
    },
    resolutionScale: 1,
    destroy: vi.fn(),
    isDestroyed: vi.fn(() => false),
    __entities: entities,
  };
  return viewer;
}

type FakeViewer = ReturnType<typeof makeViewer>;

let viewers: FakeViewer[];
let inputActions: Record<string, InputAction>;
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
      return { show: true, alpha: 1 };
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
    HeightReference: { CLAMP_TO_GROUND: 'CLAMP_TO_GROUND', NONE: 'NONE' },
    Viewer: ViewerCtor,
    ScreenSpaceEventHandler: vi.fn(function (this: unknown) {
      return {
        setInputAction: vi.fn((cb: InputAction, type: string) => {
          inputActions[type] = cb;
        }),
        destroy: vi.fn(),
      };
    }),
    ScreenSpaceEventType: {
      LEFT_DOWN: 'LEFT_DOWN',
      LEFT_UP: 'LEFT_UP',
      MOUSE_MOVE: 'MOUSE_MOVE',
    },
    Cartesian3: { fromDegrees: vi.fn((lon: number, lat: number, h = 0) => ({ lon, lat, h })) },
    Cartographic: {
      fromCartesian: vi.fn(() => ({ latitude: 0.261799, longitude: -1.234, height: 0 })),
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

function quake(id: string, lat = 35.6, lon = 139.6): DataPoint {
  return {
    id,
    lat,
    lon,
    severity: 'high',
    magnitude: 5.2,
    timestamp: '2026-10-15T00:00:00Z',
    title: `Quake ${id}`,
  };
}

const baseCallbacks = {
  onMarkerClick: () => {},
  onMarkerHover: () => {},
};

beforeEach(() => {
  viewers = [];
  inputActions = {};
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

function tap(x: number, y: number) {
  inputActions['LEFT_DOWN']?.({ position: { x, y } });
  inputActions['LEFT_UP']?.({ position: { x, y } });
}

async function renderReady(extra: Record<string, unknown> = {}) {
  const onMarkerClick = vi.fn();
  const onMarkerHover = vi.fn();
  const onCoordinatePick = vi.fn();
  const utils = render(
    <CesiumEarth
      activeLayer={null}
      dataPoints={[]}
      {...baseCallbacks}
      onMarkerClick={onMarkerClick}
      onMarkerHover={onMarkerHover}
      onCoordinatePick={onCoordinatePick}
      {...extra}
    />,
  );
  await waitFor(() => expect(ViewerCtor).toHaveBeenCalledTimes(1));
  return { ...utils, onMarkerClick, onMarkerHover, onCoordinatePick };
}

describe('CesiumEarth observation sync (Phase 5, O1)', () => {
  it('renders one severity-colored entity per valid point on mount', async () => {
    const points = [
      quake('q1'),
      { ...quake('q2'), severity: 'critical' as const },
      { ...quake('q3'), severity: 'low' as const },
    ];
    await renderReady({ dataPoints: points });
    expect(viewers[0].__entities.size).toBe(3);
    for (const point of points) {
      const entity = viewers[0].__entities.get(point.id);
      expect(entity).toBeDefined();
      const billboard = entity?.options.billboard as { color: { css: string } };
      expect(billboard.color.css).toBe(SEVERITY_COLORS[point.severity]);
    }
  });

  it('skips invalid points and renders nothing for empty layers', async () => {
    const { rerender } = await renderReady({
      dataPoints: [quake('ok'), quake('bad', 500, 0)],
    });
    expect(viewers[0].__entities.size).toBe(1);
    expect(viewers[0].__entities.has('ok')).toBe(true);

    rerender(
      <CesiumEarth
        activeLayer={null}
        dataPoints={[]}
        {...baseCallbacks}
        onMarkerClick={() => {}}
        onMarkerHover={() => {}}
      />,
    );
    await waitFor(() => expect(viewers[0].__entities.size).toBe(0));
  });

  it('diffs entities by stable id when data updates', async () => {
    const { rerender } = await renderReady({
      dataPoints: [quake('a'), quake('b')],
      onMarkerClick: () => {},
      onMarkerHover: () => {},
    });
    const add = viewers[0].entities.add;
    expect(add).toHaveBeenCalledTimes(2);
    const entityA = viewers[0].__entities.get('a');

    rerender(
      <CesiumEarth
        activeLayer={null}
        dataPoints={[quake('a'), quake('c')]}
        {...baseCallbacks}
        onMarkerClick={() => {}}
        onMarkerHover={() => {}}
      />,
    );
    await waitFor(() => expect(add).toHaveBeenCalledTimes(3));
    // b removed, c added, a untouched (no duplicate, no churn).
    expect(viewers[0].__entities.has('b')).toBe(false);
    expect(viewers[0].__entities.get('a')).toBe(entityA);
    expect(viewers[0].__entities.has('c')).toBe(true);
  });

  it('syncs a representative client payload (500 points) without errors', async () => {
    const points = Array.from({ length: 500 }, (_, i) =>
      quake(`q${i}`, (i % 170) - 85, (i % 360) - 180),
    );
    await renderReady({ dataPoints: points });
    expect(viewers[0].__entities.size).toBe(500);
    expect(ViewerCtor).toHaveBeenCalledTimes(1);
  });
});

describe('CesiumEarth observation picking (Phase 5, O2–O4)', () => {
  it('selects the picked observation on entity click', async () => {
    const point = quake('quake-1');
    const { onMarkerClick, onCoordinatePick } = await renderReady({
      dataPoints: [point],
    });
    const entity = viewers[0].__entities.get('quake-1');
    viewers[0].scene.pick.mockReturnValue({ id: entity });

    tap(400, 300);
    expect(onMarkerClick).toHaveBeenCalledTimes(1);
    expect(onMarkerClick).toHaveBeenCalledWith(point);
    // An entity hit never falls through to the coordinate readout.
    expect(onCoordinatePick).not.toHaveBeenCalled();
  });

  it('falls through to the coordinate readout on entity misses', async () => {
    const { onMarkerClick, onCoordinatePick } = await renderReady({
      dataPoints: [quake('q1')],
    });
    // Globe pick (no string entity id) → miss.
    viewers[0].scene.pick.mockReturnValue({ id: { radii: 'wgs84' } });

    tap(400, 300);
    expect(onMarkerClick).not.toHaveBeenCalled();
    expect(onCoordinatePick).toHaveBeenCalledTimes(1);
  });

  it('hovers observations and clears on misses (rAF-throttled)', async () => {
    const point = quake('quake-9');
    const { onMarkerHover } = await renderReady({ dataPoints: [point] });
    const entity = viewers[0].__entities.get('quake-9');

    viewers[0].scene.pick.mockReturnValue({ id: entity });
    inputActions['MOUSE_MOVE']?.({ position: { x: 50, y: 50 } });
    await waitFor(() => expect(onMarkerHover).toHaveBeenCalledWith(point));
    expect(viewers[0].scene.canvas.style.cursor).toBe('pointer');

    viewers[0].scene.pick.mockReturnValue(undefined);
    inputActions['MOUSE_MOVE']?.({ position: { x: 5, y: 5 } });
    await waitFor(() =>
      expect(onMarkerHover).toHaveBeenLastCalledWith(null),
    );
    expect(viewers[0].scene.canvas.style.cursor).toBe('grab');
  });
});

describe('CesiumEarth observation lifecycle (Phase 5)', () => {
  it('disposes entities, handlers, and hover state on unmount', async () => {
    const onMarkerHover = vi.fn();
    const { unmount } = await renderReady({
      dataPoints: [quake('a'), quake('b')],
      onMarkerHover,
    });
    expect(viewers[0].__entities.size).toBe(2);

    unmount();
    expect(viewers[0].__entities.size).toBe(0);
    expect(viewers[0].entities.remove).toHaveBeenCalledTimes(2);
    expect(viewers[0].destroy).toHaveBeenCalledTimes(1);
    // Hover parity: leaving the globe clears the card.
    expect(onMarkerHover).toHaveBeenLastCalledWith(null);
  });

  it('leaves exactly one live Viewer with one entity set under StrictMode', async () => {
    render(
      <StrictMode>
        <CesiumEarth
          activeLayer={null}
          dataPoints={[quake('a'), quake('b')]}
          {...baseCallbacks}
          onMarkerClick={() => {}}
          onMarkerHover={() => {}}
        />
      </StrictMode>,
    );
    await waitFor(() => {
      const live = viewers.filter((v) => v.destroy.mock.calls.length === 0);
      expect(live).toHaveLength(1);
      expect(live[0].__entities.size).toBe(2);
    });
    expect(viewers.length).toBeLessThanOrEqual(2);
  });
});
