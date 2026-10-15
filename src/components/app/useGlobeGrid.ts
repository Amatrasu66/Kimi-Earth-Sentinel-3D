import { useState, useCallback, useEffect } from 'react';

// Phase 3 §10.3 (PHASE_3_SCIENTIFIC_EARTH): the optional geographic
// reference grid on the Cesium globe. Same client-only storage contract as
// the hint flag and single-key switch: read after hydration, default off,
// malformed/missing values fall back to off.
//
// The default lives here (not in `cesiumConfig.ts`) on purpose: this hook
// is in the initial bundle graph, so importing the Cesium config module
// would pull it — and everything it grows into — into the first load.
const GLOBE_GRID_STORAGE_KEY = 'sentinel:globe-grid:v1';
const DEFAULT_GLOBE_GRID_VISIBLE = false;

function readGlobeGridVisible(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_GLOBE_GRID_VISIBLE;
    }
    return window.localStorage.getItem(GLOBE_GRID_STORAGE_KEY) === '1';
  } catch {
    return DEFAULT_GLOBE_GRID_VISIBLE;
  }
}

function writeGlobeGridVisible(visible: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(GLOBE_GRID_STORAGE_KEY, visible ? '1' : '0');
  } catch {
    /* storage unavailable — the setting lasts for this session only */
  }
}

export interface GlobeGridApi {
  /** Whether the Cesium graticule layer is shown. */
  globeGridVisible: boolean;
  /** Persists the Settings → Globe "Geographic grid" switch. */
  setGlobeGridVisible: (visible: boolean) => void;
}

/**
 * Geographic reference grid preference (Phase 3 §10.3).
 *
 * Off by default — the grid must never surprise observers — and the
 * persisted choice applies after hydration so SSR output always renders
 * the off variant (no hydration mismatch).
 */
export function useGlobeGrid(): GlobeGridApi {
  const [globeGridVisible, setVisible] = useState(DEFAULT_GLOBE_GRID_VISIBLE);

  // Persisted choice applies after hydration (state only — no write-back,
  // so a stored value is never clobbered by the mount itself).
  useEffect(() => {
    // External storage → state sync after hydration (SSR deterministic).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(readGlobeGridVisible());
  }, []);

  const setGlobeGridVisible = useCallback((visible: boolean) => {
    setVisible(visible);
    writeGlobeGridVisible(visible);
  }, []);

  return { globeGridVisible, setGlobeGridVisible };
}
