import { cn } from '@/lib/utils';

export const SEVERITY_FILTERS = ['all', 'critical', 'high', 'moderate', 'low'] as const;
export type SeverityFilterValue = (typeof SEVERITY_FILTERS)[number];

/** Quiet segmented severity filter with live counts — one hairline control. */
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
    <div
      className="flex items-center gap-0.5 rounded-[7px] border border-white/[0.07] bg-white/[0.02] p-0.5"
      role="group"
      aria-label="Filter by severity"
    >
      {SEVERITY_FILTERS.map((sev) => {
        const count = sev === 'all' ? total : counts[sev] || 0;
        const pressed = value === sev;
        return (
          <button
            key={sev}
            onClick={() => onChange(sev)}
            aria-pressed={pressed}
            className={cn(
              'sentinel-mono flex-1 whitespace-nowrap rounded-[5px] px-1.5 py-1 text-[11px] capitalize transition-colors duration-150',
              pressed
                ? 'bg-sentinel-accent/[0.13] text-sentinel-accent'
                : 'text-white/40 hover:bg-white/[0.05] hover:text-white/75',
            )}
          >
            {sev} {count}
          </button>
        );
      })}
    </div>
  );
}
