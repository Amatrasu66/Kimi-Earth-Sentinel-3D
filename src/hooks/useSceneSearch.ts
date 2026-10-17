/**
 * Phase 6 SWR scene-search client (mirrors the T3.6 layer-data hook).
 *
 * Quota policy: the route is rate-limited "heavy" server-side, so the hook
 * does no automatic retries and no focus/interval polling — a failed search
 * stands until the user searches again (explicit refresh). The key IS the
 * canonical request path (built by `buildSceneSearchPath`), so the cache key
 * and the fetched URL can never diverge; a null key (missing/invalid bbox)
 * fetches nothing and errors nothing.
 */
import useSWR from 'swr';
import { useCallback } from 'react';
import { api } from '@/services/api';
import { parseBbox } from '@/server/validation';
import type { DataStatus, SceneSearchPayload, SceneSummary } from '@/types';

export interface UseSceneSearchParams {
  bbox: string | null;
  start?: string | null;
  end?: string | null;
  collection?: string | null;
}

export interface SceneEnvelope {
  data: SceneSearchPayload;
  meta: { cacheHit: boolean };
}

/**
 * Canonical `/scenes` request path — the exact request URL and the SWR key
 * in one representation. Returns null when the AOI is missing or malformed
 * (no request is ever made with an invalid bbox).
 */
export function buildSceneSearchPath(params: UseSceneSearchParams): string | null {
  const bbox = typeof params.bbox === 'string' ? params.bbox.trim() : '';
  if (bbox === '') return null;
  if (parseBbox(bbox).error) return null;
  const query = new URLSearchParams();
  query.set('bbox', bbox);
  if (typeof params.start === 'string' && params.start.trim() !== '') {
    query.set('start', params.start.trim());
  }
  if (typeof params.end === 'string' && params.end.trim() !== '') {
    query.set('end', params.end.trim());
  }
  if (typeof params.collection === 'string' && params.collection !== '') {
    query.set('collection', params.collection);
  }
  return `/scenes?${query.toString()}`;
}

async function fetchSceneKey(key: string): Promise<SceneEnvelope> {
  const { data, meta } = await api.fetchScenesPath(key);
  return { data, meta: { cacheHit: meta.cache_hit ?? false } };
}

export interface UseSceneSearchResult {
  payload: SceneSearchPayload | null;
  scenes: SceneSummary[];
  count: number;
  attribution: string | null;
  loading: boolean;
  validating: boolean;
  error: Error | null;
  dataStatus: DataStatus | null;
  cacheHit: boolean;
  refetch: () => void;
}

export function useSceneSearch(params: UseSceneSearchParams): UseSceneSearchResult {
  const key = buildSceneSearchPath(params);
  const swr = useSWR<SceneEnvelope>(key, fetchSceneKey, {
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
    scenes: swr.data?.data.scenes ?? [],
    count: swr.data?.data.count ?? 0,
    attribution: swr.data?.data.attribution ?? null,
    loading: swr.isLoading || swr.isValidating,
    validating: swr.isValidating,
    error: (swr.error as Error | undefined) ?? null,
    dataStatus: swr.data?.data.data_status ?? null,
    cacheHit: swr.data?.meta.cacheHit ?? false,
    refetch,
  };
}
