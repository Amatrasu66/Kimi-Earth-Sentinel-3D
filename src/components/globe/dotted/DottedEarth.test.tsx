import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import DottedEarth from './DottedEarth';
import { resetLandAssetCache } from './landGeo';
import type { LandAsset } from './landGeo';
import type { DataPoint } from '@/types';

const SMALL_LAND: LandAsset = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [10, -10],
            [-10, -10],
            [-10, 10],
            [10, 10],
            [10, -10],
          ],
        ],
      },
    },
  ],
};

/**
 * jsdom has no 2D canvas. This recorder stands in for one so the whole
 * draw path (ocean disc, graticule, coastline, dots, markers) actually
 * executes instead of being skipped behind a null context.
 */
function createFakeContext() {
  const counts = { fills: 0, strokes: 0 };
  const noop = () => undefined;
  return {
    counts,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    setTransform: noop,
    transform: noop,
    resetTransform: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    save: noop,
    restore: noop,
    clip: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    rect: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    arcTo: noop,
    ellipse: noop,
    arc: noop,
    fill: () => {
      counts.fills += 1;
    },
    stroke: () => {
      counts.strokes += 1;
    },
    fillText: noop,
    strokeText: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    drawImage: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 0 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: noop,
  };
}

type FakeContext = ReturnType<typeof createFakeContext>;

// Shared by both describe blocks below (each installs it in its own
// beforeEach — the canvas/fetch doubles are per-test).
let ctx: FakeContext;

function pointerEvent(
  target: Element,
  type: 'pointermove' | 'pointerdown' | 'pointerup' | 'pointerleave',
  clientX: number,
  clientY: number,
) {
  act(() => {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }),
    );
  });
}

describe('DottedEarth basemap (GLOBE-1)', () => {
  beforeEach(() => {
    resetLandAssetCache();
    ctx = createFakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((type: string) => (type === '2d' ? ctx : null)) as never,
    );
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(SMALL_LAND),
      } as Response),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetLandAssetCache();
  });

  it('renders an accessible basemap and reports geography loading then ready', async () => {
    const onActiveRenderer = vi.fn();
    render(<DottedEarth onActiveRenderer={onActiveRenderer} isRotating={false} />);

    const canvas = screen.getByRole('img', { name: 'Interactive dotted Earth basemap' });
    expect(canvas).toBeInTheDocument();
    expect(screen.getByText(/Drag the globe to rotate it/)).toBeInTheDocument();

    expect(onActiveRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ active: 'dotted', detail: 'loading geography…' }),
    );
    await waitFor(() =>
      expect(onActiveRenderer).toHaveBeenLastCalledWith(
        expect.objectContaining({
          active: 'dotted',
          detail: expect.stringMatching(/^ready · \d+ land dots$/),
        }),
      ),
    );
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it('draws the sphere even when geography fails, and never claims success', async () => {
    vi.mocked(globalThis.fetch).mockImplementation(() =>
      Promise.reject(new Error('network down')),
    );
    const onActiveRenderer = vi.fn();

    render(<DottedEarth onActiveRenderer={onActiveRenderer} isRotating={false} />);
    expect(screen.getByRole('img')).toBeInTheDocument();

    await waitFor(() =>
      expect(onActiveRenderer).toHaveBeenLastCalledWith(
        expect.objectContaining({
          active: 'dotted',
          detail: 'geography unavailable — local land asset failed to load',
        }),
      ),
    );
    // The ocean disc still painted: the stage is never blank.
    await waitFor(() => expect(ctx.counts.fills).toBeGreaterThan(0));
  });

  it('paints coastline and land dots on the first frames after geography resolves', async () => {
    render(<DottedEarth isRotating={false} />);
    await waitFor(() => expect(ctx.counts.strokes).toBeGreaterThan(1));
    await waitFor(() => expect(ctx.counts.fills).toBeGreaterThan(1));
  });

  it('hovers and selects a marker that sits under the pointer', async () => {
    const point: DataPoint = {
      id: 'eq-1',
      lat: 12,
      lon: 0,
      severity: 'high',
      timestamp: '2026-10-06T21:47:29.000Z',
      title: 'Test quake',
    };
    const onMarkerHover = vi.fn();
    const onMarkerClick = vi.fn();

    render(
      <DottedEarth
        dataPoints={[point]}
        onMarkerHover={onMarkerHover}
        onMarkerClick={onMarkerClick}
        isRotating={false}
      />,
    );

    const canvas = screen.getByRole('img');
    // Wait for the first painted frame: the ResizeObserver test double
    // reports 300×100, so the disc centre is (150, 50) and the initial
    // view (lon 0, lat 12) puts the marker exactly there.
    await waitFor(() => expect(ctx.counts.fills).toBeGreaterThan(0));

    pointerEvent(canvas, 'pointermove', 150, 50);
    expect(onMarkerHover).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'eq-1' }),
    );

    pointerEvent(canvas, 'pointermove', 8, 8);
    expect(onMarkerHover).toHaveBeenLastCalledWith(null);

    pointerEvent(canvas, 'pointerdown', 150, 50);
    pointerEvent(canvas, 'pointerup', 150, 50);
    expect(onMarkerClick).toHaveBeenCalledTimes(1);
    expect(onMarkerClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'eq-1' }));
  });

  it('does not treat a drag as a click', async () => {
    const point: DataPoint = {
      id: 'eq-1',
      lat: 12,
      lon: 0,
      severity: 'low',
      timestamp: '2026-10-06T21:47:29.000Z',
    };
    const onMarkerClick = vi.fn();
    render(
      <DottedEarth dataPoints={[point]} onMarkerClick={onMarkerClick} isRotating={false} />,
    );

    const canvas = screen.getByRole('img');
    await waitFor(() => expect(ctx.counts.fills).toBeGreaterThan(0));

    pointerEvent(canvas, 'pointerdown', 150, 50);
    pointerEvent(canvas, 'pointermove', 170, 50);
    pointerEvent(canvas, 'pointerup', 170, 50);
    expect(onMarkerClick).not.toHaveBeenCalled();
  });

  it('releases hover and reports nothing after unmount', async () => {
    const onMarkerHover = vi.fn();
    const onActiveRenderer = vi.fn();
    const { unmount } = render(
      <DottedEarth onMarkerHover={onMarkerHover} onActiveRenderer={onActiveRenderer} isRotating={false} />,
    );

    await waitFor(() => expect(onActiveRenderer).toHaveBeenCalled());
    await waitFor(() => expect(ctx.counts.fills).toBeGreaterThan(0));

    const callsBefore = onActiveRenderer.mock.calls.length;
    unmount();
    expect(onMarkerHover).toHaveBeenLastCalledWith(null);

    // Nothing may fire from a torn-down engine (rAF or geography promise).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(onActiveRenderer).toHaveBeenCalledTimes(callsBefore);
  });

  it('ignores invalid coordinates instead of drawing a marker at NaN', async () => {
    const onMarkerHover = vi.fn();
    render(
      <DottedEarth
        dataPoints={[
          { id: 'bad', lat: Number.NaN, lon: 0, severity: 'low', timestamp: 'x' },
        ]}
        onMarkerHover={onMarkerHover}
        isRotating={false}
      />,
    );
    const canvas = screen.getByRole('img');
    await waitFor(() => expect(ctx.counts.fills).toBeGreaterThan(0));

    pointerEvent(canvas, 'pointermove', 150, 50);
    expect(onMarkerHover).toHaveBeenLastCalledWith(null);
  });
});

/**
 * Reduced-motion behaviour (T3.11): the dotted engine reads the shared
 * `usePrefersReducedMotion` subscription through a ref, so a mid-session
 * mid-session OS change settles the loop with no remount, and fly-to jumps
 * instead of travelling. The ResizeObserver double reports 300×100, so the
 * disc centre is (150, 50) — a jumped-to target projects exactly there.
 */
function mockReducedMotion(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  const mql = {
    matches: initialMatches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn((_type: string, cb: () => void) => {
      listeners.add(cb);
    }),
    removeEventListener: vi.fn((_type: string, cb: () => void) => {
      listeners.delete(cb);
    }),
  };
  const prev = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => {
      mql.matches = matches;
      return mql;
    }),
  });
  return {
    setMatches(next: boolean) {
      matches = next;
      act(() => {
        listeners.forEach((cb) => cb());
      });
    },
    restore() {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: prev,
      });
    },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const TOKYO: DataPoint = {
  id: 'tokyo',
  lat: 35.7,
  lon: 139.7,
  severity: 'moderate',
  timestamp: '2026-10-06T21:47:29.000Z',
  title: 'Tokyo',
};

describe('DottedEarth reduced motion (T3.11)', () => {
  beforeEach(() => {
    resetLandAssetCache();
    ctx = createFakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((type: string) => (type === '2d' ? ctx : null)) as never,
    );
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(SMALL_LAND),
      } as Response),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetLandAssetCache();
  });

  it('paints no further frames while idle with rotation suppressed', async () => {
    const mm = mockReducedMotion(true);
    try {
      render(<DottedEarth isRotating={true} />);
      const canvas = screen.getByRole('img');
      expect(canvas).toBeInTheDocument();
      await waitFor(() => expect(ctx.counts.fills).toBeGreaterThan(0));

      // Settled engine: two idle windows paint exactly the same count.
      await act(async () => {
        await sleep(120);
      });
      const settled = ctx.counts.fills;
      await act(async () => {
        await sleep(150);
      });
      expect(ctx.counts.fills).toBe(settled);
    } finally {
      mm.restore();
    }
  });

  it('keeps the loop alive under no-preference and settles it on a live change', async () => {
    const mm = mockReducedMotion(false);
    try {
      render(<DottedEarth isRotating={true} />);
      await waitFor(() => expect(ctx.counts.fills).toBeGreaterThan(0));

      // Normal motion: the rotation loop keeps scheduling frames.
      await act(async () => {
        await sleep(120);
      });
      const spinning = ctx.counts.fills;
      await act(async () => {
        await sleep(120);
      });
      expect(ctx.counts.fills).toBeGreaterThan(spinning);

      // Flipping the OS preference mid-session stops the loop — no remount,
      // no new subscription, just the shared hook value flowing into the
      // engine ref. Allow one in-flight tick to finish, then require stillness.
      mm.setMatches(true);
      await act(async () => {
        await sleep(120);
      });
      const settled = ctx.counts.fills;
      await act(async () => {
        await sleep(150);
      });
      expect(ctx.counts.fills).toBe(settled);
    } finally {
      mm.restore();
    }
  });

  it('jumps a search fly-to straight to the destination when reduced motion is on', async () => {
    const mm = mockReducedMotion(true);
    try {
      const onMarkerHover = vi.fn();
      const { rerender } = render(
        <DottedEarth dataPoints={[TOKYO]} onMarkerHover={onMarkerHover} isRotating={false} />,
      );
      const canvas = screen.getByRole('img');
      await waitFor(() => expect(ctx.counts.fills).toBeGreaterThan(0));

      // Post-mount fly-to (the app only ever sets it from search choices).
      // The jump lands synchronously; poll until the next frame projects it.
      rerender(
        <DottedEarth
          dataPoints={[TOKYO]}
          onMarkerHover={onMarkerHover}
          isRotating={false}
          flyTo={{ lat: TOKYO.lat, lon: TOKYO.lon, key: 1 }}
        />,
      );
      await waitFor(() => {
        pointerEvent(canvas, 'pointermove', 150, 50);
        expect(onMarkerHover).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'tokyo' }));
      });
    } finally {
      mm.restore();
    }
  });

  it('travels toward a fly-to destination over frames under normal motion', async () => {
    const mm = mockReducedMotion(false);
    try {
      const onMarkerHover = vi.fn();
      const { rerender } = render(
        <DottedEarth dataPoints={[TOKYO]} onMarkerHover={onMarkerHover} isRotating={false} />,
      );
      const canvas = screen.getByRole('img');
      await waitFor(() => expect(ctx.counts.fills).toBeGreaterThan(0));
      const fillsBefore = ctx.counts.fills;

      // The 1.4 s flight has barely started: Tokyo is nowhere near the
      // disc centre yet, so the centre hover finds nothing.
      rerender(
        <DottedEarth
          dataPoints={[TOKYO]}
          onMarkerHover={onMarkerHover}
          isRotating={false}
          flyTo={{ lat: TOKYO.lat, lon: TOKYO.lon, key: 1 }}
        />,
      );
      await waitFor(() => expect(ctx.counts.fills).toBeGreaterThan(fillsBefore));
      pointerEvent(canvas, 'pointermove', 150, 50);
      expect(onMarkerHover).toHaveBeenLastCalledWith(null);
    } finally {
      mm.restore();
    }
  });
});
