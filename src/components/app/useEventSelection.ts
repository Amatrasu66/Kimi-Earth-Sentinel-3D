import { useState, useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { api } from '@/services/api';
import type { DataPoint, EventDetail, LayerId } from '@/types';

export interface EventSelectionApi {
  selectedEvent: DataPoint | null;
  eventDetail: EventDetail | null;
  eventDetailLoading: boolean;
  /** Race-safe detail opener; stable identity for the memoized renderer. */
  selectEvent: (point: DataPoint) => void;
  /** Aborts any in-flight fetch and clears selection + detail. */
  clearSelection: () => void;
}

/**
 * Event selection + detail lifecycle (extracted T3.17).
 *
 * Owns the selected marker, its detail payload, and the race/abort
 * protocol: a slower response for event A can never overwrite a newer
 * selection B, and rapid clicks abort in-flight fetches instead of
 * piling up.
 *
 * The active layer arrives as a ref (fed by the owner every commit) rather
 * than a value: `selectEvent` only needs it for the failure fallback, and
 * closing over the value would recreate the callback on every layer
 * switch — re-rendering the memoized renderer subtree for shell-only
 * reasons. Reading the ref keeps the identity permanently stable while
 * always observing the current commit.
 */
export function useEventSelection(activeLayerRef: RefObject<LayerId | null>): EventSelectionApi {
  const [selectedEvent, setSelectedEvent] = useState<DataPoint | null>(null);
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [eventDetailLoading, setEventDetailLoading] = useState(false);
  const eventRequestId = useRef(0);
  const eventAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      eventAbortRef.current?.abort();
    };
  }, []);

  const clearSelection = useCallback(() => {
    eventRequestId.current += 1; // invalidate any in-flight detail fetch
    eventAbortRef.current?.abort();
    setSelectedEvent(null);
    setEventDetail(null);
    setEventDetailLoading(false);
  }, []);

  const selectEvent = useCallback(
    async (point: DataPoint) => {
      const id = ++eventRequestId.current;
      eventAbortRef.current?.abort();
      const controller = new AbortController();
      eventAbortRef.current = controller;
      setSelectedEvent(point);
      setEventDetail(null);
      setEventDetailLoading(true);

      try {
        const detail = await api.getEvent(point.id, { signal: controller.signal });
        if (eventRequestId.current !== id || controller.signal.aborted) return;
        setEventDetail(detail);
      } catch (err) {
        if (eventRequestId.current !== id || controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        // If API fails, create detail from point data
        setEventDetail({
          id: point.id,
          layer_id: activeLayerRef.current || 'unknown',
          type: point.type || activeLayerRef.current || 'event',
          title: point.title || 'Unknown Event',
          lat: point.lat,
          lon: point.lon,
          timestamp: point.timestamp,
          description: point.description || '',
          severity: point.severity,
          magnitude: point.magnitude,
          depth: point.depth,
        });
      } finally {
        if (eventRequestId.current === id) setEventDetailLoading(false);
      }
    },
    [activeLayerRef],
  );

  return { selectedEvent, eventDetail, eventDetailLoading, selectEvent, clearSelection };
}
