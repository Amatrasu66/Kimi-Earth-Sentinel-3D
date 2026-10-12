import { useEffect } from 'react';
import type { DataPoint, LayerId } from '@/types';

/** Minimal payload shape the pending id resolves against. */
interface ResolvableLayerData {
  layer_id: string;
  points: DataPoint[];
}

interface UsePendingEventResolutionOptions {
  /** Validated deep-link id awaiting resolvable layer data. */
  pendingEventId: string | null;
  /** Explicit user selection always wins over a pending restore. */
  selectedEventId: string | null;
  activeLayer: LayerId | null;
  layerData: ResolvableLayerData | null;
  layerLoading: boolean;
  /** Truthiness only: an unresolvable id with a failed load is dropped. */
  layerError: unknown;
  /** Race-safe detail opener (owns the fetch lifecycle). */
  resolveEvent: (point: DataPoint) => void;
  /** Take-and-clear the pending id once layer data answers it. */
  clearPendingEvent: () => void;
  /** Drop an unresolvable pending id from the URL (replace, never push). */
  dropPendingEventFromUrl: () => void;
}

/**
 * Deep-link event resolution (T3.3, extracted T3.17).
 *
 * Consumes the pending event id from `useAppUrlState` once its layer's
 * data can answer it. Declared after the data hook on purpose: the layer
 * payload only exists downstream of the URL hook's own `activeLayer`, so
 * no single earlier hook can own this effect without a creation cycle.
 *
 * Resolution reads THIS layer's payload only: right after a switch the
 * previous payload is still present while the new fetch is in flight
 * (layer_id mismatch), and that must wait — never resolve-or-drop
 * against stale points. Unresolvable ids are dropped from the URL, never
 * fabricated into selections.
 */
export function usePendingEventResolution(options: UsePendingEventResolutionOptions): void {
  const {
    pendingEventId,
    selectedEventId,
    activeLayer,
    layerData,
    layerLoading,
    layerError,
    resolveEvent,
    clearPendingEvent,
    dropPendingEventFromUrl,
  } = options;

  useEffect(() => {
    if (!pendingEventId || selectedEventId) {
      return;
    }
    if (!activeLayer || layerLoading) return;
    const fresh = layerData && layerData.layer_id === activeLayer ? layerData : null;
    if (!fresh && !layerError) return;
    const point = (fresh?.points ?? []).find((p) => p.id === pendingEventId) ?? null;
    clearPendingEvent();
    if (point) {
      resolveEvent(point);
    } else {
      dropPendingEventFromUrl();
    }
  }, [
    pendingEventId,
    selectedEventId,
    activeLayer,
    layerData,
    layerError,
    layerLoading,
    resolveEvent,
    clearPendingEvent,
    dropPendingEventFromUrl,
  ]);
}
