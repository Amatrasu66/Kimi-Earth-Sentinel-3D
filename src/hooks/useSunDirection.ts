"use client";

import { useEffect, useState } from 'react';
import { DEFAULT_SUN_DIRECTION } from '@/components/globe/earthConfig';
import { getSunDirection } from '@/lib/solar';
import type { SunDirection } from '@/lib/solar';

/**
 * Shared solar-direction tick interval (T2.4): 60 s.
 *
 * The subsolar point drifts ≈ 0.25° of longitude per minute (Earth's
 * rotation rate), so a one-minute cadence keeps the terminator within a
 * small fraction of the 1° PRD budget while never perturbing the frame
 * loop, globe interaction, or camera behaviour. Coarser would visibly lag
 * solar noon; finer would re-render for no visual gain.
 */
export const SUN_DIRECTION_UPDATE_INTERVAL_MS = 60_000;

/**
 * Authoritative real-time sun direction for the globe (T2.4).
 *
 * Hydration-safe by construction (same pattern as `StatusDock`'s clock):
 * the initial state is the deterministic `DEFAULT_SUN_DIRECTION` constant,
 * so SSR and the first client render emit identical markup. The live UTC
 * position is computed only inside the mount effect — never during render —
 * then refreshed on a single 60 s interval owned here. There is exactly one
 * timer no matter how many renderers mount: both the WebGPU and WebGL paths
 * receive this hook's single tuple via props, so no per-renderer clocks can
 * diverge. Interval is cleared on unmount.
 */
export function useSunDirection(): SunDirection {
  const [sunDirection, setSunDirection] = useState<SunDirection>(DEFAULT_SUN_DIRECTION);

  useEffect(() => {
    let cancelled = false;
    const update = () => {
      const next = getSunDirection(new Date());
      if (cancelled) return;
      // Wall-clock time is external state: reading it here (never during
      // render) is what keeps SSR markup deterministic. Same pattern as
      // hooks/use-mobile.ts and StatusDock.
      setSunDirection(next);
    };
    update();
    const timer = setInterval(update, SUN_DIRECTION_UPDATE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return sunDirection;
}
