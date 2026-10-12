/**
 * T3.17 `usePendingEventResolution` ownership tests: the deep-link id
 * resolves against fresh layer data, waits on stale/loading payloads,
 * yields to explicit selection, and drops unresolvable ids without
 * fabricating selections. Hook harness with controllable inputs.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePendingEventResolution } from '@/components/app/usePendingEventResolution';
import type { DataPoint } from '@/types';

const POINT: DataPoint = {
  id: 'usgs-1', type: 'earthquake', title: 'M5.2 Test Quake',
  lat: 35.6, lon: 139.6, severity: 'high', timestamp: '2026-10-11T00:00:00Z',
};

const FRESH = { layer_id: 'earthquakes', points: [POINT] };
const STALE = { layer_id: 'wildfires', points: [] };

interface Inputs {
  pendingEventId: string | null;
  selectedEventId: string | null;
  activeLayer: 'earthquakes' | null;
  layerData: typeof FRESH | typeof STALE | null;
  layerLoading: boolean;
  layerError: unknown;
}

function setup(inputs: Inputs) {
  const resolveEvent = vi.fn();
  const clearPendingEvent = vi.fn();
  const dropPendingEventFromUrl = vi.fn();
  renderHook(
    (props: Inputs) =>
      usePendingEventResolution({
        ...props,
        resolveEvent,
        clearPendingEvent,
        dropPendingEventFromUrl,
      }),
    { initialProps: inputs },
  );
  return { resolveEvent, clearPendingEvent, dropPendingEventFromUrl };
}

const BASE: Inputs = {
  pendingEventId: null,
  selectedEventId: null,
  activeLayer: 'earthquakes',
  layerData: FRESH,
  layerLoading: false,
  layerError: null,
};

describe('pending deep-link resolution', () => {
  it('does nothing without a pending id', () => {
    const spies = setup(BASE);
    expect(spies.resolveEvent).not.toHaveBeenCalled();
    expect(spies.clearPendingEvent).not.toHaveBeenCalled();
    expect(spies.dropPendingEventFromUrl).not.toHaveBeenCalled();
  });

  it('resolves a matching point and consumes the pending id', () => {
    const spies = setup({ ...BASE, pendingEventId: 'usgs-1' });
    expect(spies.clearPendingEvent).toHaveBeenCalledTimes(1);
    expect(spies.resolveEvent).toHaveBeenCalledWith(POINT);
    expect(spies.dropPendingEventFromUrl).not.toHaveBeenCalled();
  });

  it('drops an unresolvable id without fabricating a selection', () => {
    const spies = setup({ ...BASE, pendingEventId: 'usgs-999' });
    expect(spies.clearPendingEvent).toHaveBeenCalledTimes(1);
    expect(spies.resolveEvent).not.toHaveBeenCalled();
    expect(spies.dropPendingEventFromUrl).toHaveBeenCalledTimes(1);
  });

  it('yields to an explicit user selection', () => {
    const spies = setup({ ...BASE, pendingEventId: 'usgs-1', selectedEventId: 'usgs-2' });
    expect(spies.clearPendingEvent).not.toHaveBeenCalled();
    expect(spies.resolveEvent).not.toHaveBeenCalled();
    expect(spies.dropPendingEventFromUrl).not.toHaveBeenCalled();
  });

  it('waits while loading instead of dropping', () => {
    const spies = setup({ ...BASE, pendingEventId: 'usgs-1', layerLoading: true, layerData: null });
    expect(spies.clearPendingEvent).not.toHaveBeenCalled();
    expect(spies.resolveEvent).not.toHaveBeenCalled();
    expect(spies.dropPendingEventFromUrl).not.toHaveBeenCalled();
  });

  it('waits on stale-layer payloads instead of resolving or dropping', () => {
    const spies = setup({ ...BASE, pendingEventId: 'usgs-1', layerData: STALE });
    expect(spies.clearPendingEvent).not.toHaveBeenCalled();
    expect(spies.resolveEvent).not.toHaveBeenCalled();
    expect(spies.dropPendingEventFromUrl).not.toHaveBeenCalled();
  });

  it('drops the id when the load failed with no usable payload', () => {
    const spies = setup({
      ...BASE,
      pendingEventId: 'usgs-1',
      layerData: null,
      layerError: new Error('gone'),
    });
    expect(spies.resolveEvent).not.toHaveBeenCalled();
    expect(spies.dropPendingEventFromUrl).toHaveBeenCalledTimes(1);
  });
});
