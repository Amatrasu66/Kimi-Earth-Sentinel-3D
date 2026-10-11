import { describe, expect, it } from 'vitest';
import { provenanceChipLabel, resolveProvenance } from './provenance';
import type { DataStatus } from '@/types';

const T = '2026-10-11T00:00:00Z';

function status(overrides: Partial<DataStatus> = {}): DataStatus {
  return {
    status: 'live',
    source: 'USGS',
    fetched_at: T,
    message: null,
    ...overrides,
  } as DataStatus;
}

describe('resolveProvenance (T3.7 mapping)', () => {
  it('maps a fresh live result to LIVE', () => {
    expect(resolveProvenance(status({ status: 'live' }), false, null)).toEqual({
      kind: 'live',
      label: 'LIVE',
    });
    // Absent server bit is still LIVE — never assumed cached.
    expect(resolveProvenance(status({ status: 'live' }), null, null)).toEqual({
      kind: 'live',
      label: 'LIVE',
    });
  });

  it('maps live + server cache_hit to CACHED (never from client caching)', () => {
    expect(resolveProvenance(status({ status: 'live' }), true, null)).toEqual({
      kind: 'cached',
      label: 'CACHED',
    });
  });

  it('keeps explicit STALE and SIMULATED even with cache_hit true', () => {
    // A stale re-serve with the server bit set is still STALE, never CACHED.
    expect(resolveProvenance(status({ status: 'stale' }), true, null).kind).toBe('stale');
    // Simulated fallback served from cache is still SIMULATED, never CACHED/live.
    expect(resolveProvenance(status({ status: 'simulated' }), true, null)).toEqual({
      kind: 'simulated',
      label: 'SIMULATED',
    });
  });

  it('passes UNAVAILABLE through distinctly', () => {
    expect(resolveProvenance(status({ status: 'unavailable' }), false, null)).toEqual({
      kind: 'unavailable',
      label: 'UNAVAILABLE',
    });
  });

  it('reports ERROR only with no usable payload, keeping it distinct from failures-as-data', () => {
    expect(resolveProvenance(null, null, 'Request failed')).toEqual({
      kind: 'error',
      label: 'ERROR',
    });
    // Same-key revalidation failure with preserved data: the payload wins,
    // so usable data is never relabelled as an error.
    expect(resolveProvenance(status({ status: 'live' }), false, 'Request failed').kind).toBe(
      'live',
    );
    expect(
      resolveProvenance(status({ status: 'simulated' }), null, 'Request failed').kind,
    ).toBe('simulated');
  });

  it('reports UNKNOWN with neither payload nor failure (initial load / layer switch)', () => {
    expect(resolveProvenance(null, null, null)).toEqual({ kind: 'unknown', label: 'UNKNOWN' });
    expect(resolveProvenance(undefined, undefined, undefined)).toEqual({
      kind: 'unknown',
      label: 'UNKNOWN',
    });
  });

  it('never relabels simulated or stale as live on HTTP success', () => {
    for (const s of ['stale', 'simulated', 'unavailable'] as const) {
      const resolved = resolveProvenance(status({ status: s }), false, null);
      expect(resolved.kind).toBe(s);
      expect(resolved.kind).not.toBe('live');
    }
  });
});

describe('provenanceChipLabel', () => {
  it('mirrors the banner mapping for header/dock/diagnostics chips', () => {
    expect(provenanceChipLabel(status({ status: 'live' }), true)).toBe('CACHED');
    expect(provenanceChipLabel(status({ status: 'live' }), false)).toBe('LIVE');
    expect(provenanceChipLabel(status({ status: 'stale' }), true)).toBe('STALE');
    expect(provenanceChipLabel(status({ status: 'simulated' }), false)).toBe('SIMULATED');
    expect(provenanceChipLabel(null, null)).toBe('UNKNOWN');
  });
});
