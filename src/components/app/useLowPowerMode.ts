import { useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  DEFAULT_LOW_POWER_PREFERENCE,
  LOW_POWER_STORAGE_KEY,
  parseLowPowerPreference,
  probeLowPowerSignals,
  resolveLowPowerActive,
} from '@/lib/low-power';
import type { LowPowerPreference } from '@/lib/low-power';

// T4.6: Auto / On / Off low-power preference. Same client-only storage
// contract as the hint flag and the single-key switch: read after
// hydration, default auto, malformed values fall back to auto.

function readLowPowerPreference(): LowPowerPreference {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_LOW_POWER_PREFERENCE;
    }
    return parseLowPowerPreference(window.localStorage.getItem(LOW_POWER_STORAGE_KEY));
  } catch {
    return DEFAULT_LOW_POWER_PREFERENCE;
  }
}

function writeLowPowerPreference(preference: LowPowerPreference): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(LOW_POWER_STORAGE_KEY, preference);
  } catch {
    /* storage unavailable — the setting lasts for this session only */
  }
}

const emptySubscribe = () => () => {};

export interface LowPowerModeApi {
  /** The persisted user preference (auto by default). */
  preference: LowPowerPreference;
  /** Persists the Settings → Globe low-power choice. */
  setPreference: (preference: LowPowerPreference) => void;
  /**
   * Whether low-power rendering is active right now. SSR reports false so
   * markup stays deterministic; the client resolves synchronously after
   * hydration. Mount-stable (no subscription), so a fluctuating capability
   * signal can never flap the mode mid-session.
   */
  lowPowerActive: boolean;
}

/**
 * Low-power rendering preference (T4.6).
 *
 * Reduced motion stays fully independent: this hook never reads or writes
 * the motion preference, and the resolved boolean composes with it in the
 * renderers (a reduced-motion + low-power globe is still, dimmed less).
 */
export function useLowPowerMode(): LowPowerModeApi {
  const [preference, setPreferenceState] = useState<LowPowerPreference>(
    DEFAULT_LOW_POWER_PREFERENCE,
  );

  // Persisted choice applies after hydration (state only — no write-back,
  // so a stored value is never clobbered by the mount itself).
  useEffect(() => {
    // External storage → state sync after hydration (SSR deterministic).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreferenceState(readLowPowerPreference());
  }, []);

  const setPreference = useCallback((next: LowPowerPreference) => {
    setPreferenceState(next);
    writeLowPowerPreference(next);
  }, []);

  const lowPowerActive = useSyncExternalStore(
    emptySubscribe,
    () => resolveLowPowerActive(preference, probeLowPowerSignals()),
    () => false,
  );

  return { preference, setPreference, lowPowerActive };
}
