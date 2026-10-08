import { SEVERITY_COLORS, type SeverityLevel } from '@/types';

/**
 * Zero-dependency severity distribution: proportional stacked bar with
 * per-segment counts. Flat section — no card. Color is redundant with
 * the counts (never sole carrier).
 */
const ORDER: SeverityLevel[] = ['low', 'moderate', 'high', 'critical'];

export default function SeverityDistribution({ counts, total }: { counts: Record<string, number>; total: number }) {
  if (total === 0) return null;
  return (
    <div
      role="img"
      aria-label={`Severity distribution: ${ORDER.map((s) => `${s} ${counts[s] || 0}`).join(', ')}`}
    >
      <div className="sentinel-label mb-2">Severity distribution</div>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-white/[0.05]" aria-hidden>
        {ORDER.map((sev) => {
          const n = counts[sev] || 0;
          if (n === 0) return null;
          return (
            <div
              key={sev}
              title={`${sev}: ${n}`}
              style={{ flexGrow: n, flexBasis: 0, background: SEVERITY_COLORS[sev], minWidth: n > 0 ? 3 : 0 }}
            />
          );
        })}
      </div>
      <div className="sentinel-micro sentinel-mono mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {ORDER.map((sev) => (
          <span key={sev} className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEVERITY_COLORS[sev] }} aria-hidden />
            {sev} {counts[sev] || 0}
          </span>
        ))}
      </div>
    </div>
  );
}
