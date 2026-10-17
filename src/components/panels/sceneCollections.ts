/**
 * Scene-collection option registry for the Sentinel search UI (Phase 6).
 * Kept in its own tiny module so the dynamic SceneSearchPanel chunk owns
 * it and the initial route bundle never sees it.
 */
import type { SceneCollectionId } from '@/types';

export const SCENE_COLLECTION_OPTIONS: SceneCollectionId[] = [
  'sentinel-2-l1c',
  'sentinel-2-l2a',
  'sentinel-1-grd',
];

export const SCENE_COLLECTION_LABELS: Record<SceneCollectionId, string> = {
  'sentinel-2-l1c': 'Sentinel-2 L1C',
  'sentinel-2-l2a': 'Sentinel-2 L2A',
  'sentinel-1-grd': 'Sentinel-1 GRD',
};
