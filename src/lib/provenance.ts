import { statusLabel } from '@/lib/format';
import type { DataStatus } from '@/types';

/**
 * Display-level provenance states (T3.7). These extend the API
 * `data_status` vocabulary with two client-derived presentations:
 * - `cached`: a `live` result served from the server L1 cache
 *   (`meta.cache_hit === true`). Never inferred from SWR/client caching —
 *   only the envelope's server bit may produce it.
 * - `error`: a failed request with no usable payload. Kept distinct from
 *   successful `simulated`/`unavailable` responses.
 * - `unknown`: no payload and no failure (initial load / layer switch).
 */
export type ProvenanceKind =
  | 'live'
  | 'cached'
  | 'stale'
  | 'simulated'
  | 'unavailable'
  | 'error'
  | 'unknown';

export interface ResolvedProvenance {
  kind: ProvenanceKind;
  /** Text label — status is never communicated through colour alone. */
  label: string;
}

/**
 * Pure mapping from the API contract to a display state. `data_status`
 * keeps precedence for explicitly labelled payloads (a `stale` re-serve
 * with `cache_hit: true` still reads STALE, never CACHED); `error` only
 * wins when there is no usable payload to describe.
 */
export function resolveProvenance(
  dataStatus: DataStatus | null | undefined,
  cacheHit: boolean | null | undefined,
  error: string | null | undefined,
): ResolvedProvenance {
  if (!dataStatus) {
    if (error) return { kind: 'error', label: 'ERROR' };
    return { kind: 'unknown', label: 'UNKNOWN' };
  }
  if (dataStatus.status === 'live' && cacheHit === true) {
    return { kind: 'cached', label: 'CACHED' };
  }
  return { kind: dataStatus.status, label: statusLabel(dataStatus) };
}

/**
 * Compact label for the header/dock/diagnostics chips, which only know
 * the payload status plus the server cache bit (no error context there —
 * failures hide those chips and surface in the panel instead).
 */
export function provenanceChipLabel(
  dataStatus: DataStatus | null | undefined,
  cacheHit: boolean | null | undefined,
): string {
  return resolveProvenance(dataStatus, cacheHit, null).label;
}
