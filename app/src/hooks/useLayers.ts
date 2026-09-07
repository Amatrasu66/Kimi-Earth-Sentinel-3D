import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import type { LayerMetadata, LayerData, LayerId } from '@/types';

export function useLayers() {
  const [layers, setLayers] = useState<LayerMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getLayers()
      .then(data => {
        setLayers(data.layers);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { layers, loading, error };
}

export function useLayerData(layerId: LayerId | null, options?: { limit?: number; min_severity?: string }) {
  const [data, setData] = useState<LayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    if (!layerId) return;
    
    setLoading(true);
    setError(null);
    
    api.getLayerData(layerId, options)
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [layerId, options?.limit, options?.min_severity]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
