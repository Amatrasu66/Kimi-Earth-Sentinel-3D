import { useState, useEffect, useCallback, useEffectEvent, useRef } from 'react';
import { api } from '@/services/api';
import type { DataStatus, LayerMetadata, LayerData, LayerId } from '@/types';

export function useLayers() {
  const [layers, setLayers] = useState<LayerMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getLayers()
      .then((data) => {
        if (cancelled) return;
        setLayers(data.layers);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load layers.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
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

  // fetchData runs outside the effect body (useEffectEvent) so the effect
  // itself never calls setState synchronously — it only signals the fetch.
  // Manual refreshes bump `nonce`, which re-runs the same effect.
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const fetchData = useEffectEvent(() => {
    if (!layerId) return;
    const id = ++requestId.current;

    setLoading(true);
    setError(null);

    api
      .getLayerData(layerId, { limit, min_severity: minSeverity })
      .then((layerData) => {
        if (requestId.current !== id) return; // stale response guard
        setRawData(layerData);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (requestId.current !== id) return;
        setError(err instanceof Error ? err.message : 'Failed to load layer data.');
        setLoading(false);
      });
  });

  useEffect(() => {
    fetchData();
  }, [layerId, limit, minSeverity, nonce]);

  // When no layer is selected there is nothing to show. Derived (not
  // stored) so no cascading setState-in-effect is needed; switching layers
  // keeps the previous payload visible until the new one arrives.
  const data = layerId ? rawData : null;
  const dataStatus: DataStatus | null = data?.data_status ?? null;

  return { data, loading: layerId ? loading : false, error, dataStatus, refetch };
}
