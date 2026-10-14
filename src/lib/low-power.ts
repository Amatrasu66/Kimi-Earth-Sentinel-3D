/**
 * Low-power rendering policy (T4.6) — pure, SSR-safe, headless-testable.
 *
 * No `three`, no React, no `window` at module scope, so the initial route
 * can import this freely (T4.5 bundle budget). Browser APIs are read only
 * inside `probeLowPowerSignals()`, which is guarded for SSR.
 *
 * Model:
 * - preference `auto` (default) / `on` / `off`, persisted by
 *   `useLowPowerMode` (same localStorage contract as the single-key
 *   shortcut flag).
 * - `auto` engages only on conservative, already-available signals:
 *   Save-Data, coarse pointer, or known-tiny `deviceMemory` (≤2 GB).
 *   Unknown signals never engage. WebGPU support is deliberately NOT a
 *   signal in either direction.
 * - the resolved boolean is mount-stable (consumers snapshot it without
 *   subscribing), so a fluctuating signal can never flap the mode.
 *
 * Active low-power rendering means: standard texture tier, DPR ceiling 1,
 * and the decorative cloud shell off — on every renderer that has them.
 * Reduced motion stays fully independent (see `usePrefersReducedMotion`).
 */
import type { TextureTier } from '@/components/globe/textureTiers';

export type LowPowerPreference = 'auto' | 'on' | 'off';

export const DEFAULT_LOW_POWER_PREFERENCE: LowPowerPreference = 'auto';

export const LOW_POWER_STORAGE_KEY = 'sentinel:low-power:v1';

/** `deviceMemory` at or below this (GB, Chrome-only) counts as constrained. */
export const LOW_DEVICE_MEMORY_GB = 2;

/** DPR ceiling while low-power rendering is active (all renderers). */
export const LOW_POWER_DPR_CAP = 1;

/** Normal DPR ceilings (pre-existing policy, centralized here in T4.6). */
export const STANDARD_DPR_CAP_COARSE = 1.5;
export const STANDARD_DPR_CAP_FINE = 2;

export function parseLowPowerPreference(raw: unknown): LowPowerPreference {
  return raw === 'on' || raw === 'off' || raw === 'auto' ? raw : DEFAULT_LOW_POWER_PREFERENCE;
}

export interface LowPowerSignals {
  /** `navigator.connection.saveData` — explicit user data-saving intent. */
  saveData: boolean;
  /** Coarse primary pointer (mobile-class GPU/thermals). */
  coarsePointer: boolean;
  /** Chrome `navigator.deviceMemory` fuzzy GB; null when unknown. */
  deviceMemoryGB: number | null;
}

/**
 * Read capability signals defensively. SSR (or any missing API) yields the
 * all-unknown shape, which never engages auto mode — the server snapshot
 * is therefore deterministic (`false`, matching the hook's SSR default).
 */
export function probeLowPowerSignals(): LowPowerSignals {
  const unknown: LowPowerSignals = { saveData: false, coarsePointer: false, deviceMemoryGB: null };
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return unknown;
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    const deviceMemoryGB =
      typeof nav.deviceMemory === 'number' && Number.isFinite(nav.deviceMemory)
        ? nav.deviceMemory
        : null;
    return {
      saveData: nav.connection?.saveData ?? false,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
      deviceMemoryGB,
    };
  } catch {
    return unknown;
  }
}

/** Conservative auto heuristic: engage only on clear constraint signals. */
export function shouldAutoLowPower(signals: LowPowerSignals): boolean {
  if (signals.saveData) return true;
  if (signals.coarsePointer) return true;
  if (signals.deviceMemoryGB !== null && signals.deviceMemoryGB <= LOW_DEVICE_MEMORY_GB) return true;
  return false;
}

/**
 * Resolve whether low-power rendering is active. Manual `on` always wins;
 * manual `off` always vetoes the heuristic.
 */
export function resolveLowPowerActive(
  preference: LowPowerPreference,
  signals: LowPowerSignals,
): boolean {
  if (preference === 'on') return true;
  if (preference === 'off') return false;
  return shouldAutoLowPower(signals);
}

/** First matching auto reason, for the Settings status line. Null when inactive. */
export function lowPowerAutoReason(signals: LowPowerSignals): string | null {
  if (signals.saveData) return 'Data Saver is on';
  if (signals.coarsePointer) return 'mobile display';
  if (signals.deviceMemoryGB !== null && signals.deviceMemoryGB <= LOW_DEVICE_MEMORY_GB) {
    return `limited device memory (${signals.deviceMemoryGB} GB)`;
  }
  return null;
}

/** User-readable status: the selected preference vs what is active now. */
export function describeLowPowerState(
  preference: LowPowerPreference,
  active: boolean,
  signals: LowPowerSignals,
): string {
  if (preference === 'on') return 'On — low-power rendering active';
  if (preference === 'off') return 'Off — full quality';
  const reason = active ? lowPowerAutoReason(signals) : null;
  return reason
    ? `Auto — low-power active (${reason})`
    : 'Auto — full quality on this device';
}

/** Centralized DPR ceiling: low-power caps at 1 everywhere it applies. */
export function maxDprForMode(options: {
  coarsePointer: boolean;
  lowPowerActive: boolean;
}): number {
  if (options.lowPowerActive) return LOW_POWER_DPR_CAP;
  return options.coarsePointer ? STANDARD_DPR_CAP_COARSE : STANDARD_DPR_CAP_FINE;
}

/**
 * The drifting cloud shell is the one decorative effect present in both 3D
 * paths (WebGL `CloudLayer`, WebGPU clouds mesh) that can go without
 * touching geography, markers, lighting or provenance. Off in low-power.
 */
export function cloudLayerEnabled(lowPowerActive: boolean): boolean {
  return !lowPowerActive;
}

/** Low-power forces the existing standard tier; off restores adaptive. */
export function effectiveTextureTier(
  lowPowerActive: boolean,
  adaptiveTier: TextureTier,
): TextureTier {
  return lowPowerActive ? 'standard' : adaptiveTier;
}
