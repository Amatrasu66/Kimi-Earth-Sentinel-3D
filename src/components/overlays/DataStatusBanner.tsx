import { formatRelativeTime, statusLabel } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
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
 * look identical to live data — this banner travels with every data view.
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
      className={compact ? 'rounded-lg px-2.5 py-1.5' : 'rounded-lg p-2.5'}
      style={{ background: style.bg, border: `1px solid ${style.border}` }}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn('flex-shrink-0 rounded-full', kind === 'live' && 'sentinel-live-dot')}
          style={{ width: 7, height: 7, background: style.dot }}
          aria-hidden
        />
        <Badge
          variant="outline"
          className="border-0 bg-transparent px-0 text-[11px] font-bold tracking-wider"
          style={{ color: style.text }}
        >
          {statusLabel(status ?? undefined)}
        </Badge>
        <span className="truncate text-xs text-white/55">{headline}</span>
      </div>
      {!compact && status?.message && (
        <p className="mt-1.5 text-xs leading-relaxed text-white/40">{status.message}</p>
      )}
    </div>
  );
}
