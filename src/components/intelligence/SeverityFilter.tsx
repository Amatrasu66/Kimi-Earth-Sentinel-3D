import { cn } from '@/lib/utils';

export const SEVERITY_FILTERS = ['all', 'critical', 'high', 'moderate', 'low'] as const;
export type SeverityFilterValue = (typeof SEVERITY_FILTERS)[number];

/** Severity segment filter with live counts. */
export default function SeverityFilter({
  counts,
  total,
  value,
  onChange,
}: {
  counts: Record<string, number>;
  total: number;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by severity">
      {SEVERITY_FILTERS.map((sev) => {
        const count = sev === 'all' ? total : counts[sev] || 0;
        const pressed = value === sev;
        return (
          <button
            key={sev}
            onClick={() => onChange(sev)}
            aria-pressed={pressed}
            className={cn(
              'sentinel-mono rounded-md px-2.5 py-1 text-[11px] capitalize transition-colors duration-150',
              pressed
                ? 'border border-sentinel-accent/35 bg-sentinel-accent/[0.14] text-sentinel-accent'
                : 'border border-transparent bg-white/[0.04] text-white/40 hover:bg-white/[0.08] hover:text-white/75',
            )}
          >
            {sev} {count}
          </button>
        );
      })}
    </div>
  );
}
