import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [data, setData] = useState<LayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Decompose options into primitives: callers pass inline object
  // literals ({ limit: 500 }), whose identity changes every render. Using
  // the whole object as a dep would refetch in a loop (bug fix).
  const limit = options?.limit;
  const minSeverity = options?.min_severity;
  const requestId = useRef(0);

  const fetchData = useCallback(() => {
    if (!layerId) return;
    const id = ++requestId.current;

    setLoading(true);
    setError(null);

    api
      .getLayerData(layerId, { limit, min_severity: minSeverity })
      .then((layerData) => {
        if (requestId.current !== id) return; // stale response guard
        setData(layerData);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (requestId.current !== id) return;
        setError(err instanceof Error ? err.message : 'Failed to load layer data.');
        setLoading(false);
      });
  }, [layerId, limit, minSeverity]);

  useEffect(() => {
    if (!layerId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    fetchData();
  }, [fetchData, layerId]);

  const dataStatus: DataStatus | null = data?.data_status ?? null;

  return { data, loading, error, dataStatus, refetch: fetchData };
}
