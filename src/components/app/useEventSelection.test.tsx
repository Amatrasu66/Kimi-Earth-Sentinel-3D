/**
 * T3.17 `useEventSelection` ownership tests: loading/detail lifecycle,
 * race safety (slow A vs fast B), abort-on-clear, failure fallback from
 * point data, and unmount abort. No app shell — hook harness only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { RefObject } from 'react';
import { useEventSelection } from '@/components/app/useEventSelection';
import { api } from '@/services/api';
import type { DataPoint, EventDetail, LayerId } from '@/types';

vi.mock('@/services/api', () => ({
  api: { getEvent: vi.fn() },
}));

const FETCHED_AT = '2026-10-11T00:00:00Z';

const POINT_A: DataPoint = {
  id: 'usgs-1', type: 'earthquake', title: 'M5.2 Test Quake',
  lat: 35.6, lon: 139.6, severity: 'high', timestamp: FETCHED_AT,
};

const POINT_B: DataPoint = {
  id: 'usgs-2', type: 'earthquake', title: 'M3.1 Minor Quake',
  lat: -20, lon: -70, severity: 'low', timestamp: FETCHED_AT,
};

function detailFor(id: string): EventDetail {
  return {
    id, layer_id: 'earthquakes', type: 'earthquake', title: `Detail ${id}`,
    lat: 0, lon: 0, timestamp: FETCHED_AT, severity: 'high',
  };
}

function layerRef(layer: LayerId | null): RefObject<LayerId | null> {
  return { current: layer };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.mocked(api.getEvent).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('selection lifecycle', () => {
  it('loads the detail for the selected point', async () => {
    vi.mocked(api.getEvent).mockResolvedValue(detailFor('usgs-1'));
    const { result } = renderHook(() => useEventSelection(layerRef('earthquakes')));

    act(() => {
      result.current.selectEvent(POINT_A);
    });
    expect(result.current.selectedEvent).toEqual(POINT_A);
    expect(result.current.eventDetailLoading).toBe(true);

    await waitFor(() => expect(result.current.eventDetail).toEqual(detailFor('usgs-1')));
    expect(result.current.eventDetailLoading).toBe(false);
    expect(api.getEvent).toHaveBeenCalledWith('usgs-1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('lets a newer selection win over a slower earlier response', async () => {
    const slow = deferred<EventDetail>();
    const fast = deferred<EventDetail>();
    vi.mocked(api.getEvent).mockImplementation((id: string) =>
      id === 'usgs-1' ? slow.promise : fast.promise,
    );
    const { result } = renderHook(() => useEventSelection(layerRef('earthquakes')));

    act(() => {
      result.current.selectEvent(POINT_A);
    });
    act(() => {
      result.current.selectEvent(POINT_B);
    });
    await act(async () => {
      fast.resolve(detailFor('usgs-2'));
      await fast.promise;
    });
    await act(async () => {
      slow.resolve(detailFor('usgs-1'));
      await slow.promise;
    });

    expect(result.current.selectedEvent).toEqual(POINT_B);
    expect(result.current.eventDetail).toEqual(detailFor('usgs-2'));
    expect(result.current.eventDetailLoading).toBe(false);
  });

  it('aborts the in-flight fetch and resets on clear', async () => {
    const pending = deferred<EventDetail>();
    vi.mocked(api.getEvent).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useEventSelection(layerRef('earthquakes')));

    act(() => {
      result.current.selectEvent(POINT_A);
    });
    expect(result.current.eventDetailLoading).toBe(true);

    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.selectedEvent).toBeNull();
    expect(result.current.eventDetail).toBeNull();
    expect(result.current.eventDetailLoading).toBe(false);

    // The late response must not repopulate a cleared selection.
    await act(async () => {
      pending.resolve(detailFor('usgs-1'));
      await pending.promise;
    });
    expect(result.current.selectedEvent).toBeNull();
    expect(result.current.eventDetail).toBeNull();
  });
});

describe('failure honesty', () => {
  it('builds fallback detail from point data naming the active layer', async () => {
    vi.mocked(api.getEvent).mockRejectedValue(new Error('Layer gone.'));
    const { result } = renderHook(() => useEventSelection(layerRef('earthquakes')));

    act(() => {
      result.current.selectEvent(POINT_A);
    });
    await waitFor(() => expect(result.current.eventDetail).not.toBeNull());
    expect(result.current.eventDetail).toMatchObject({
      id: 'usgs-1',
      layer_id: 'earthquakes',
      title: 'M5.2 Test Quake',
    });
    expect(result.current.eventDetailLoading).toBe(false);
  });

  it('falls back to unknown layer labels without an active layer', async () => {
    vi.mocked(api.getEvent).mockRejectedValue(new Error('Layer gone.'));
    const { result } = renderHook(() => useEventSelection(layerRef(null)));

    act(() => {
      result.current.selectEvent({ ...POINT_A, type: undefined, title: undefined } as DataPoint);
    });
    await waitFor(() => expect(result.current.eventDetail).not.toBeNull());
    expect(result.current.eventDetail).toMatchObject({
      layer_id: 'unknown',
      type: 'event',
      title: 'Unknown Event',
    });
  });

  it('swallows aborts without fabricating detail', async () => {
    const pending = deferred<EventDetail>();
    vi.mocked(api.getEvent).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useEventSelection(layerRef('earthquakes')));

    act(() => {
      result.current.selectEvent(POINT_A);
    });
    const signal = vi.mocked(api.getEvent).mock.calls[0][1]?.signal as AbortSignal;
    await act(async () => {
      pending.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      await pending.promise.catch(() => {});
    });
    expect(signal.aborted).toBe(false);
    expect(result.current.eventDetail).toBeNull();
  });
});

describe('unmount safety', () => {
  it('aborts the in-flight fetch on unmount', async () => {
    const pending = deferred<EventDetail>();
    vi.mocked(api.getEvent).mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => useEventSelection(layerRef('earthquakes')));

    act(() => {
      result.current.selectEvent(POINT_A);
    });
    const signal = vi.mocked(api.getEvent).mock.calls[0][1]?.signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(detailFor('usgs-1'));
      await pending.promise;
    });
    expect(api.getEvent).toHaveBeenCalledTimes(1);
  });
});
