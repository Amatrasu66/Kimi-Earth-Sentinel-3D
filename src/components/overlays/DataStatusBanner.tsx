import { formatRelativeTime, statusLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DataStatus } from '@/types';

const STATUS_STYLES: Record<string, { dot: string; text: string; border: string; bg: string }> = {
  live: { dot: 'var(--status-live)', text: 'var(--status-live)', border: 'var(--status-live-border)', bg: 'var(--status-live-bg)' },
  simulated: { dot: 'var(--status-simulated)', text: 'var(--status-simulated)', border: 'var(--status-simulated-border)', bg: 'var(--status-simulated-bg)' },
  stale: { dot: 'var(--status-stale)', text: 'var(--status-stale)', border: 'var(--status-stale-border)', bg: 'var(--status-stale-bg)' },
  unavailable: { dot: 'var(--status-unavailable)', text: 'var(--status-unavailable)', border: 'var(--status-unavailable-border)', bg: 'var(--status-unavailable-bg)' },
  unknown: { dot: 'var(--status-neutral)', text: 'var(--status-neutral)', border: 'var(--status-unknown-border)', bg: 'var(--status-unknown-bg)' },
};

/**
 * Visible data-provenance indicator. Simulated data must never
 * look identical to live data — this strip travels with every data view.
 * Flat hairline surface with a status spine; washed backgrounds carry
 * abnormal states so simulated can never read as live.
 */
export default function DataStatusBanner({ status, compact = false }: { status: DataStatus | null; compact?: boolean }) {
  const kind = status?.status ?? 'unknown';
  const style = STATUS_STYLES[kind] ?? STATUS_STYLES.unknown;

  const headline =
    kind === 'live'
      ? `${status?.source ?? 'Provider'} · Updated ${formatRelativeTime(status?.fetched_at)}`
      : kind === 'simulated'
        ? `${status?.source ?? 'Source'} unavailable · Showing fallback data`
        : kind === 'stale'
          ? `Stale cache · Fetched ${formatRelativeTime(status?.fetched_at)}`
          : kind === 'unavailable'
            ? 'Data unavailable'
            : 'Provenance unknown';

  return (
    <div
      role="status"
      aria-label={`Data status: ${statusLabel(status ?? undefined)}. ${headline}`}
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
          {statusLabel(status ?? undefined)}
        </span>
        <span className="truncate text-xs text-white/55">{headline}</span>
      </div>
      {!compact && status?.message && (
        <p className="py-0 pl-3 pr-2.5 pb-2 text-xs leading-relaxed text-white/40">{status.message}</p>
      )}
    </div>
  );
}
