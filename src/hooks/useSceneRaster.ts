/**
 * Phase 7 SWR scene-raster client (mirrors the Phase 6 `useSceneSearch`).
 *
 * One resolution request per selected scene — availability is resolved when
 * the scene is selected, never polled; retries stay off (a failed
 * resolution stands until the user retriggers by re-selecting). The key IS
 * the canonical request path (built by `buildSceneRasterPath`), so the
 * cache key and the fetched URL can never diverge; a null key (no scene
 * selected or a malformed id) fetches nothing and errors nothing.
 */
import useSWR from 'swr';
import { useCallback } from 'react';
import { api } from '@/services/api';
import { isSceneId } from '@/server/validation';
import type { DataStatus, SceneRasterPayload } from '@/types';

export interface SceneRasterEnvelope {
  data: SceneRasterPayload;
  meta: { cacheHit: boolean };
}

/**
 * Canonical `/scenes/raster` request path — the exact request URL and the
 * SWR key in one representation. Returns null when no valid scene id is
 * selected (no request is ever made with a malformed id).
 */
export function buildSceneRasterPath(
  sceneId: string | null | undefined,
): string | null {
  if (!isSceneId(sceneId)) return null;
  return `/scenes/raster?scene=${sceneId.trim().toLowerCase()}`;
}

async function fetchSceneRasterKey(key: string): Promise<SceneRasterEnvelope> {
  const { data, meta } = await api.fetchSceneRasterPath(key);
  return { data, meta: { cacheHit: meta.cache_hit ?? false } };
}

export interface UseSceneRasterResult {
  payload: SceneRasterPayload | null;
  loading: boolean;
  error: Error | null;
  dataStatus: DataStatus | null;
  cacheHit: boolean;
  refetch: () => void;
}

export function useSceneRaster(
  sceneId: string | null | undefined,
): UseSceneRasterResult {
  const key = buildSceneRasterPath(sceneId);
  const swr = useSWR<SceneRasterEnvelope>(key, fetchSceneRasterKey, {
    dedupingInterval: 2000,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    refreshInterval: 0,
    keepPreviousData: false,
  });
  const { mutate } = swr;
  const refetch = useCallback(() => {
    void mutate();
  }, [mutate]);
  return {
    payload: swr.data?.data ?? null,
    loading: swr.isLoading || swr.isValidating,
    error: (swr.error as Error | undefined) ?? null,
    dataStatus: swr.data?.data.data_status ?? null,
    cacheHit: swr.data?.meta.cacheHit ?? false,
    refetch,
  };
}
