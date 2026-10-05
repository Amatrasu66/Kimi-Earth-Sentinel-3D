import { formatRelativeTime, statusLabel } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DataStatus } from '@/types';

const STATUS_STYLES: Record<string, { dot: string; text: string; border: string; bg: string }> = {
  live: { dot: '#34D399', text: '#34D399', border: 'rgba(52,211,153,0.3)', bg: 'rgba(52,211,153,0.07)' },
  simulated: { dot: '#FFC31F', text: '#FFC31F', border: 'rgba(255,195,31,0.3)', bg: 'rgba(255,195,31,0.07)' },
  stale: { dot: '#FB923C', text: '#FB923C', border: 'rgba(251,146,60,0.3)', bg: 'rgba(251,146,60,0.07)' },
  unavailable: { dot: '#F87171', text: '#F87171', border: 'rgba(248,113,113,0.3)', bg: 'rgba(248,113,113,0.07)' },
  unknown: { dot: '#9CA3AF', text: '#9CA3AF', border: 'rgba(156,163,175,0.3)', bg: 'rgba(156,163,175,0.07)' },
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
