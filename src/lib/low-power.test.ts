/**
 * T4.6 low-power policy tests (deterministic, offline).
 *
 * These pin code-level contracts only: preference parsing, the
 * conservative auto heuristic, manual overrides, tier/DPR/effect policy,
 * and status text. They prove nothing about battery, FPS, or GPU memory —
 * those need real owner device measurements.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOW_POWER_PREFERENCE,
  LOW_POWER_DPR_CAP,
  cloudLayerEnabled,
  describeLowPowerState,
  effectiveTextureTier,
  lowPowerAutoReason,
  maxDprForMode,
  parseLowPowerPreference,
  probeLowPowerSignals,
  resolveLowPowerActive,
  shouldAutoLowPower,
} from './low-power';
import type { LowPowerSignals } from './low-power';

const UNKNOWN: LowPowerSignals = { saveData: false, coarsePointer: false, deviceMemoryGB: null };

describe('parseLowPowerPreference', () => {
  it('accepts the three modes and defaults malformed values to auto', () => {
    expect(parseLowPowerPreference('auto')).toBe('auto');
    expect(parseLowPowerPreference('on')).toBe('on');
    expect(parseLowPowerPreference('off')).toBe('off');
    expect(parseLowPowerPreference(null)).toBe('auto');
    expect(parseLowPowerPreference(undefined)).toBe('auto');
    expect(parseLowPowerPreference('')).toBe('auto');
    expect(parseLowPowerPreference('ON')).toBe('auto');
    expect(parseLowPowerPreference('full')).toBe('auto');
    expect(parseLowPowerPreference(42)).toBe('auto');
    expect(DEFAULT_LOW_POWER_PREFERENCE).toBe('auto');
  });
});

describe('shouldAutoLowPower (conservative heuristic)', () => {
  it('stays off when every signal is missing or negative', () => {
    expect(shouldAutoLowPower(UNKNOWN)).toBe(false);
  });

  it('engages on Save-Data alone', () => {
    expect(shouldAutoLowPower({ ...UNKNOWN, saveData: true })).toBe(true);
  });

  it('engages on a coarse pointer alone', () => {
    expect(shouldAutoLowPower({ ...UNKNOWN, coarsePointer: true })).toBe(true);
  });

  it('engages only on known-tiny device memory (≤2 GB); unknown never fires', () => {
    expect(shouldAutoLowPower({ ...UNKNOWN, deviceMemoryGB: 2 })).toBe(true);
    expect(shouldAutoLowPower({ ...UNKNOWN, deviceMemoryGB: 1 })).toBe(true);
    expect(shouldAutoLowPower({ ...UNKNOWN, deviceMemoryGB: 4 })).toBe(false);
    expect(shouldAutoLowPower({ ...UNKNOWN, deviceMemoryGB: 8 })).toBe(false);
    expect(shouldAutoLowPower({ ...UNKNOWN, deviceMemoryGB: null })).toBe(false);
  });
});

describe('resolveLowPowerActive (manual override)', () => {
  it('manual On overrides a fully negative Auto evaluation', () => {
    expect(resolveLowPowerActive('on', UNKNOWN)).toBe(true);
  });

  it('manual Off vetoes every auto trigger', () => {
    const constrained: LowPowerSignals = { saveData: true, coarsePointer: true, deviceMemoryGB: 1 };
    expect(resolveLowPowerActive('off', constrained)).toBe(false);
  });

  it('auto follows the heuristic', () => {
    expect(resolveLowPowerActive('auto', UNKNOWN)).toBe(false);
    expect(resolveLowPowerActive('auto', { ...UNKNOWN, saveData: true })).toBe(true);
  });
});

describe('describeLowPowerState (preference vs active)', () => {
  it('distinguishes the selected preference from what is active', () => {
    expect(describeLowPowerState('on', true, UNKNOWN)).toMatch(/^On — low-power rendering active/);
    expect(describeLowPowerState('off', false, UNKNOWN)).toBe('Off — full quality');
    expect(describeLowPowerState('auto', false, UNKNOWN)).toBe('Auto — full quality on this device');
    expect(describeLowPowerState('auto', true, { ...UNKNOWN, saveData: true })).toContain(
      'Auto — low-power active (Data Saver is on)',
    );
  });

  it('names the triggering signal', () => {
    expect(lowPowerAutoReason({ ...UNKNOWN, coarsePointer: true })).toBe('mobile display');
    expect(lowPowerAutoReason({ ...UNKNOWN, deviceMemoryGB: 2 })).toContain('limited device memory');
    expect(lowPowerAutoReason(UNKNOWN)).toBeNull();
  });
});

describe('rendering policy', () => {
  it('forces the standard tier in low-power and restores adaptive when off', () => {
    expect(effectiveTextureTier(true, 'high')).toBe('standard');
    expect(effectiveTextureTier(true, 'standard')).toBe('standard');
    // Off restores the adaptive result — never an unconditional high.
    expect(effectiveTextureTier(false, 'high')).toBe('high');
    expect(effectiveTextureTier(false, 'standard')).toBe('standard');
  });

  it('caps DPR at 1 in low-power and keeps the existing caps otherwise', () => {
    expect(maxDprForMode({ coarsePointer: false, lowPowerActive: true })).toBe(LOW_POWER_DPR_CAP);
    expect(maxDprForMode({ coarsePointer: true, lowPowerActive: true })).toBe(LOW_POWER_DPR_CAP);
    expect(maxDprForMode({ coarsePointer: true, lowPowerActive: false })).toBe(1.5);
    expect(maxDprForMode({ coarsePointer: false, lowPowerActive: false })).toBe(2);
    expect(LOW_POWER_DPR_CAP).toBe(1);
  });

  it('disables only the decorative cloud shell in low-power', () => {
    expect(cloudLayerEnabled(true)).toBe(false);
    expect(cloudLayerEnabled(false)).toBe(true);
  });
});

describe('probeLowPowerSignals (SSR-safe shape)', () => {
  it('returns a well-formed conservative reading without throwing', () => {
    const signals = probeLowPowerSignals();
    expect(typeof signals.saveData).toBe('boolean');
    expect(typeof signals.coarsePointer).toBe('boolean');
    expect(
      signals.deviceMemoryGB === null || typeof signals.deviceMemoryGB === 'number',
    ).toBe(true);
    // Whatever this machine reports, resolving must not throw.
    expect(() => resolveLowPowerActive('auto', signals)).not.toThrow();
  });
});
