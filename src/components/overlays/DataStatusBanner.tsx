import { useEffect, useState } from 'react';
import { formatAge } from '@/lib/format';
import { resolveProvenance } from '@/lib/provenance';
import type { ProvenanceKind } from '@/lib/provenance';
import { cn } from '@/lib/utils';
import type { DataStatus } from '@/types';

const STATUS_STYLES: Record<ProvenanceKind, { dot: string; text: string; border: string; bg: string }> = {
  live: { dot: 'var(--status-live)', text: 'var(--status-live)', border: 'var(--status-live-border)', bg: 'var(--status-live-bg)' },
  cached: { dot: 'var(--status-cached)', text: 'var(--status-cached)', border: 'var(--status-cached-border)', bg: 'var(--status-cached-bg)' },
  simulated: { dot: 'var(--status-simulated)', text: 'var(--status-simulated)', border: 'var(--status-simulated-border)', bg: 'var(--status-simulated-bg)' },
  stale: { dot: 'var(--status-stale)', text: 'var(--status-stale)', border: 'var(--status-stale-border)', bg: 'var(--status-stale-bg)' },
  unavailable: { dot: 'var(--status-unavailable)', text: 'var(--status-unavailable)', border: 'var(--status-unavailable-border)', bg: 'var(--status-unavailable-bg)' },
  error: { dot: 'var(--status-unavailable)', text: 'var(--status-unavailable)', border: 'var(--status-unavailable-border)', bg: 'var(--status-unavailable-bg)' },
  unknown: { dot: 'var(--status-neutral)', text: 'var(--status-neutral)', border: 'var(--status-unknown-border)', bg: 'var(--status-unknown-bg)' },
};

/** Modest client-side age cadence (T3.7): no permanent high-frequency timer. */
const AGE_TICK_MS = 30_000;

/**
 * Ticking client clock for the age readout. Null until after mount so SSR
 * and the first client render never embed `Date.now()`-derived text
 * (same hydration discipline as StatusDock's clock). Ticks modestly while
 * mounted with a valid timestamp; cleared on unmount.
 */
function useProvenanceNow(hasTimestamp: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!hasTimestamp) return;
    // Mount-only clock start — wall-clock time is external state, so it
    // starts here, never during render (keeps SSR markup deterministic).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), AGE_TICK_MS);
    return () => clearInterval(id);
  }, [hasTimestamp]);
  return now;
}

/** Deterministic absolute fetch time (pure in `fetched_at` — SSR-safe). */
function absoluteFetchLabel(fetchedAt: string): string | null {
  if (Number.isNaN(new Date(fetchedAt).getTime())) return null;
  const iso = new Date(fetchedAt).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export interface DataStatusBannerProps {
  status: DataStatus | null;
  /** Server L1 bit from the SWR envelope (`meta.cache_hit`) — the ONLY
   *  thing that may render CACHED. Client/SWR caching never implies it. */
  cacheHit?: boolean | null;
  /** Request failure with no usable payload — renders ERROR, never a
   *  success state. Data errors surface separately via the panel Alert. */
  error?: string | null;
  compact?: boolean;
}

/**
 * Visible data-provenance indicator. Simulated data must never
 * look identical to live data — this strip travels with every data view.
 * Flat hairline surface with a status spine; washed backgrounds carry
 * abnormal states so simulated can never read as live.
 *
 * Announcements: `role="status"` (implicit `aria-live="polite"`) with a
 * tick-stable `aria-label`, so status changes announce once while the
 * 30 s age readout (`aria-hidden`) never re-announces. The absolute
 * fetch time rides in the label and changes only per fetch.
 */
export default function DataStatusBanner({ status, cacheHit = null, error = null, compact = false }: DataStatusBannerProps) {
  const { kind, label } = resolveProvenance(status, cacheHit, error);
  const style = STATUS_STYLES[kind];
  const source = status?.source?.trim() ? status.source : null;
  // The age readout only ticks where an age slot is shown — no pointless
  // re-renders for states that display no freshness text. The clock runs
  // even when fetched_at is missing/invalid so those resolve to an explicit
  // "age unknown" instead of a perpetual pending marker.
  const showAgeTick =
    kind === 'live' || kind === 'cached' || kind === 'stale' || kind === 'unavailable';

  const now = useProvenanceNow(showAgeTick);
  const age = status?.fetched_at ? formatAge(status.fetched_at, now ?? 0) : null;
  // Pre-mount the timestamp is honestly pending (never a fabricated age);
  // a missing/invalid timestamp is an explicit unknown, never "just now".
  const ageText = now === null ? '…' : (age ?? 'age unknown');
  const absolute = status?.fetched_at ? absoluteFetchLabel(status.fetched_at) : null;

  const headline =
    kind === 'live'
      ? `${source ?? 'Unknown source'} · Updated ${ageText}`
      : kind === 'cached'
        ? `${source ?? 'Unknown source'} · Cached ${ageText}`
        : kind === 'stale'
          ? `Stale data · Fetched ${ageText}`
          : kind === 'simulated'
            ? `${source ?? 'Source'} unavailable · Showing fallback data`
            : kind === 'unavailable'
              ? `${source ?? 'Source'} · Data unavailable${age && now !== null ? ` · Checked ${age}` : ''}`
              : kind === 'error'
                ? (error ?? 'Request failed')
                : 'Provenance unknown';

  return (
    <div
      role="status"
      aria-label={`Data status: ${label}${source ? `. ${source}` : ''}${absolute ? `. Data fetched ${absolute}` : ''}`}
      className="relative overflow-hidden rounded-[7px] border border-white/[0.07]"
      style={{ background: style.bg }}
    >
      <span
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ background: style.dot }}
        aria-hidden
      />
      <div className={cn('flex items-center gap-2 pl-3 pr-2.5', compact ? 'py-1.5' : 'py-2')}>
        <span
          className={cn('flex-shrink-0 rounded-full', kind === 'live' && 'sentinel-live-dot')}
          style={{ width: 6, height: 6, background: style.dot }}
          aria-hidden
        />
        <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: style.text }}>
          {label}
        </span>
        <span className="truncate text-xs text-white/55" aria-hidden="true">{headline}</span>
      </div>
      {!compact && status?.message && (
        <p className="py-0 pl-3 pr-2.5 pb-2 text-xs leading-relaxed text-white/40">{status.message}</p>
      )}
    </div>
  );
}
