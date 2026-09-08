import { formatRelativeTime, statusLabel } from '@/lib/format';
import type { DataStatus } from '@/types';

const STATUS_STYLES: Record<string, { dot: string; text: string; border: string; bg: string }> = {
  live: { dot: '#34D399', text: '#34D399', border: 'rgba(52,211,153,0.35)', bg: 'rgba(52,211,153,0.08)' },
  simulated: { dot: '#FFC31F', text: '#FFC31F', border: 'rgba(255,195,31,0.35)', bg: 'rgba(255,195,31,0.08)' },
  stale: { dot: '#FB923C', text: '#FB923C', border: 'rgba(251,146,60,0.35)', bg: 'rgba(251,146,60,0.08)' },
  unavailable: { dot: '#F87171', text: '#F87171', border: 'rgba(248,113,113,0.35)', bg: 'rgba(248,113,113,0.08)' },
  unknown: { dot: '#9CA3AF', text: '#9CA3AF', border: 'rgba(156,163,175,0.35)', bg: 'rgba(156,163,175,0.08)' },
};

/**
 * Visible data-provenance indicator (Phase 6). Simulated data must never
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
      className={compact ? 'rounded-lg px-2.5 py-1.5' : 'rounded-xl p-3'}
      style={{ background: style.bg, border: `1px solid ${style.border}` }}
    >
      <div className="flex items-center gap-2">
        <span
          className="rounded-full flex-shrink-0"
          style={{ width: 8, height: 8, background: style.dot }}
          aria-hidden
        />
        <span className="text-xs font-semibold tracking-wide" style={{ color: style.text }}>
          {statusLabel(status ?? undefined)}
        </span>
        <span className="text-white/50 text-xs truncate">{headline}</span>
      </div>
      {!compact && status?.message && (
        <p className="text-white/40 text-xs mt-1.5 leading-relaxed">{status.message}</p>
      )}
    </div>
  );
}
