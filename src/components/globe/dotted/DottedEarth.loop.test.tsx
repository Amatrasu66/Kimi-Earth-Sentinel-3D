/**
 * T4.2 dotted render-loop discipline: idle settle, hidden-tab pause and
 * resume (without time jumps), drag/flight frame demand, unmount cleanup,
 * and mount churn back to baseline. Real timers + painted-frame counts —
 * the same style as DottedEarth.test.tsx — so scheduling behaviour is
 * observed, never scripted. No GPU, no pixels claimed.
 */
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

const TOKYO: DataPoint = {
  id: 'tokyo',
  lat: 35.7,
  lon: 139.7,
  severity: 'moderate',
  timestamp: '2026-10-06T21:47:29.000Z',
  title: 'Tokyo',
};

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

let ctx: FakeContext;
let hidden = false;
const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function setHidden(next: boolean) {
  hidden = next;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function pointerEvent(target: Element, type: string, clientX: number, clientY: number) {
  act(() => {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }),
    );
  });
}

beforeEach(() => {
  resetLandAssetCache();
  hidden = false;
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
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetLandAssetCache();
  if (hiddenDescriptor) {
    Object.defineProperty(document, 'hidden', hiddenDescriptor);
  } else {
    delete (document as { hidden?: boolean }).hidden;
  }
});

async function settledFills(): Promise<number> {
  await waitFor(() => expect(ctx.counts.fills).toBeGreaterThan(0));
  return ctx.counts.fills;
}

describe('dotted loop idle discipline (T4.2)', () => {
  it('schedules nothing once idle with rotation off', async () => {
    render(<DottedEarth isRotating={false} />);
    await settledFills();
    await act(async () => {
      await sleep(150);
    });
    const settled = ctx.counts.fills;
    await act(async () => {
      await sleep(200);
    });
    expect(ctx.counts.fills).toBe(settled);
  });

  it('keeps scheduling while rotating and settles on toggle-off', async () => {
    const { rerender } = render(<DottedEarth isRotating={true} />);
    await settledFills();
    await act(async () => {
      await sleep(120);
    });
    const spinning = ctx.counts.fills;
    await act(async () => {
      await sleep(120);
    });
    expect(ctx.counts.fills).toBeGreaterThan(spinning);

    rerender(<DottedEarth isRotating={false} />);
    await act(async () => {
      await sleep(150);
    });
    const settled = ctx.counts.fills;
    await act(async () => {
      await sleep(200);
    });
    expect(ctx.counts.fills).toBe(settled);
  });

  it('pauses on hidden, resumes current, and freezes flights without jumping', async () => {
    render(
      <DottedEarth dataPoints={[TOKYO]} isRotating={false} flyTo={{ lat: TOKYO.lat, lon: TOKYO.lon, key: 1 }} />,
    );
    // Flight in progress: frames are being consumed.
    await settledFills();
    await act(async () => {
      await sleep(200);
    });
    const inFlight = ctx.counts.fills;
    expect(inFlight).toBeGreaterThan(0);

    // Hidden mid-flight: scheduling stops (the 1.4 s flight cannot finish
    // while no frames run).
    setHidden(true);
    await act(async () => {
      await sleep(250);
    });
    const frozen = ctx.counts.fills;
    await act(async () => {
      await sleep(250);
    });
    expect(ctx.counts.fills).toBe(frozen);

    // Visible again: the SAME flight resumes (frames progress — proof it
    // neither completed in the dark nor teleported) and then settles.
    setHidden(false);
    await act(async () => {
      await sleep(250);
    });
    expect(ctx.counts.fills).toBeGreaterThan(frozen);
    await act(async () => {
      await sleep(1800);
    });
    const landed = ctx.counts.fills;
    await act(async () => {
      await sleep(250);
    });
    expect(ctx.counts.fills).toBe(landed);
  });

  it('schedules frames while dragged and settles on release', async () => {
    render(<DottedEarth isRotating={false} />);
    const canvas = screen.getByRole('img');
    await settledFills();
    await act(async () => {
      await sleep(150);
    });
    expect(ctx.counts.fills).toBeGreaterThan(0);

    // Held drag (no moves needed): the loop runs for its duration.
    pointerEvent(canvas, 'pointerdown', 150, 50);
    await act(async () => {
      await sleep(150);
    });
    const dragging = ctx.counts.fills;
    await act(async () => {
      await sleep(150);
    });
    expect(ctx.counts.fills).toBeGreaterThan(dragging);

    pointerEvent(canvas, 'pointerup', 150, 50);
    await act(async () => {
      await sleep(150);
    });
    const settled = ctx.counts.fills;
    await act(async () => {
      await sleep(200);
    });
    expect(ctx.counts.fills).toBe(settled);
  });
});

describe('dotted loop lifecycle safety (T4.2)', () => {
  it('cancels scheduling and listeners on unmount, then ignores late events', async () => {
    const { unmount } = render(<DottedEarth isRotating={true} />);
    const canvas = screen.getByRole('img');
    await settledFills();
    unmount();

    await act(async () => {
      await sleep(250);
    });
    const settled = ctx.counts.fills;
    // Late visibility flips and pointer traffic must not revive the engine.
    setHidden(true);
    setHidden(false);
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    await act(async () => {
      await sleep(250);
    });
    expect(ctx.counts.fills).toBe(settled);
  });

  it('returns to baseline across mount/pause/resume/unmount churn', async () => {
    for (let cycle = 0; cycle < 3; cycle += 1) {
      resetLandAssetCache();
      const { unmount } = render(<DottedEarth isRotating={true} />);
      await waitFor(() => expect(ctx.counts.fills).toBeGreaterThan(0));
      setHidden(true);
      await act(async () => {
        await sleep(120);
      });
      const frozen = ctx.counts.fills;
      await act(async () => {
        await sleep(120);
      });
      expect(ctx.counts.fills).toBe(frozen);
      setHidden(false);
      unmount();
      await act(async () => {
        await sleep(120);
      });
    }
    // One geography request per mount — never duplicated, never leaked.
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(3);
    const settled = ctx.counts.fills;
    await act(async () => {
      await sleep(250);
    });
    expect(ctx.counts.fills).toBe(settled);
  });
});
