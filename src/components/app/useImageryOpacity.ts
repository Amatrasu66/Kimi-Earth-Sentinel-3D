import { useState, useCallback, useEffect } from 'react';
import {
  CESIUM_GRATICULE_OVERLAY_LAYER,
  GIBS_TRUE_COLOR_BASE_LAYER,
  clampLayerOpacity,
  parseLayerOpacity,
} from '@/components/globe/imageryLayers';

// Phase 4: persisted opacity for the layers that support it. Same
// client-only storage contract as the grid and single-key preferences:
// read after hydration (SSR stays on the registry defaults, so no
// hydration mismatch), malformed or out-of-range values fall back to the
// layer default, and slider input is clamped to 0–1 before it is stored.
const BASE_OPACITY_STORAGE_KEY = 'sentinel:imagery-base-opacity:v1';
const GRID_OPACITY_STORAGE_KEY = 'sentinel:imagery-grid-opacity:v1';

function readStoredOpacity(key: string, fallback: number): number {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    return parseLayerOpacity(window.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

function writeStoredOpacity(key: string, value: number): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, String(clampLayerOpacity(value)));
  } catch {
    /* storage unavailable — the setting lasts for this session only */
  }
}

export interface ImageryOpacityApi {
  /** Effective base-imagery opacity (0–1). */
  baseOpacity: number;
  /** Effective graticule-overlay opacity (0–1). */
  gridOpacity: number;
  /** Persist the base-imagery opacity (clamped to 0–1). */
  setBaseOpacity: (value: number) => void;
  /** Persist the graticule opacity (clamped to 0–1). */
  setGridOpacity: (value: number) => void;
  /** Restore both registry defaults. */
  resetImageryOpacity: () => void;
}

/**
 * Layer opacity preferences (Phase 4).
 *
 * Opacity is a display preference, not navigation state: it lives in
 * local storage (validated, hydration-safe) rather than the URL, so
 * dragging a slider never writes history entries or disrupts shared links.
 * The URL owns only the discrete base-layer selection (`?imagery=`).
 */
export function useImageryOpacity(): ImageryOpacityApi {
  const [baseOpacity, setBaseOpacityState] = useState(
    GIBS_TRUE_COLOR_BASE_LAYER.defaultOpacity,
  );
  const [gridOpacity, setGridOpacityState] = useState(
    CESIUM_GRATICULE_OVERLAY_LAYER.defaultOpacity,
  );

  // Persisted choices apply after hydration (state only — no write-back,
  // so a stored value is never clobbered by the mount itself).
  useEffect(() => {
    // External storage → state sync after hydration (SSR deterministic).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBaseOpacityState(
      readStoredOpacity(
        BASE_OPACITY_STORAGE_KEY,
        GIBS_TRUE_COLOR_BASE_LAYER.defaultOpacity,
      ),
    );
    setGridOpacityState(
      readStoredOpacity(
        GRID_OPACITY_STORAGE_KEY,
        CESIUM_GRATICULE_OVERLAY_LAYER.defaultOpacity,
      ),
    );
  }, []);

  const setBaseOpacity = useCallback((value: number) => {
    const clamped = clampLayerOpacity(value);
    setBaseOpacityState(clamped);
    writeStoredOpacity(BASE_OPACITY_STORAGE_KEY, clamped);
  }, []);

  const setGridOpacity = useCallback((value: number) => {
    const clamped = clampLayerOpacity(value);
    setGridOpacityState(clamped);
    writeStoredOpacity(GRID_OPACITY_STORAGE_KEY, clamped);
  }, []);

  const resetImageryOpacity = useCallback(() => {
    setBaseOpacity(GIBS_TRUE_COLOR_BASE_LAYER.defaultOpacity);
    setGridOpacity(CESIUM_GRATICULE_OVERLAY_LAYER.defaultOpacity);
  }, [setBaseOpacity, setGridOpacity]);

  return {
    baseOpacity,
    gridOpacity,
    setBaseOpacity,
    setGridOpacity,
    resetImageryOpacity,
  };
}
