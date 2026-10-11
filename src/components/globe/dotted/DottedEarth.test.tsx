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
  let ctx: FakeContext;

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
