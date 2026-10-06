import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/services/api';
import type { DataStatus, LayerMetadata, LayerData, LayerId } from '@/types';

// Fetch-in-effect data layer with abort cleanup (standard pattern, not
// derived-state sync) — exempt from set-state-in-effect.
/* eslint-disable react-hooks/set-state-in-effect */

export function useLayers() {
  const [layers, setLayers] = useState<LayerMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Layer-list fetch with abort cleanup — the standard fetch-in-effect
  // pattern (not a cascading render).
  useEffect(() => {
    const controller = new AbortController();
    api
      .getLayers({ signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setLayers(data.layers);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load layers.');
        setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, []);

  return { layers, loading, error };
}

interface UseLayerDataOptions {
  limit?: number;
  min_severity?: string;
}

export function useLayerData(layerId: LayerId | null, options?: UseLayerDataOptions) {
  const [rawData, setRawData] = useState<LayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Decompose options into primitives: callers pass inline object
  // literals ({ limit: 500 }), whose identity changes every render. Using
  // the whole object as a dep would refetch in a loop (bug fix).
  const limit = options?.limit;
  const minSeverity = options?.min_severity;
  const requestId = useRef(0);
  const inflightRef = useRef<AbortController | null>(null);

  // Fetch callback keyed on primitives only (not the options object, whose
// identity changes every render). Stable unless a value actually changes,
// so the effect below never refetches in a loop. (Replaces useEffectEvent,
// which is unavailable in the React copy Next.js bundles for the server
// layer — identical fetch/abort/race-guard semantics.)
  // Manual refreshes bump `nonce`, which re-runs the fetch effect.
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const fetchData = useCallback(() => {
    if (!layerId) return;
    const id = ++requestId.current;

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    inflightRef.current?.abort();
    inflightRef.current = controller;

    api
      .getLayerData(
        layerId,
        { limit, min_severity: minSeverity },
        { signal: controller.signal },
      )
      .then((layerData) => {
        if (requestId.current !== id || controller.signal.aborted) return;
        setRawData(layerData);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (requestId.current !== id || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load layer data.');
        setLoading(false);
      });
  }, [layerId, limit, minSeverity]);

  // Layer-data fetch with abort cleanup — the standard fetch-in-effect
  // pattern (not a cascading render).
  useEffect(() => {
    fetchData();
    return () => {
      inflightRef.current?.abort();
    };
  }, [fetchData, nonce]);

  // When no layer is selected there is nothing to show. Derived (not
  // stored) so no cascading setState-in-effect is needed; switching layers
  // keeps the previous payload visible until the new one arrives.
  const data = layerId ? rawData : null;
  const dataStatus: DataStatus | null = data?.data_status ?? null;

  return { data, loading: layerId ? loading : false, error, dataStatus, refetch };
}
