import { cn } from '@/lib/utils';

export interface MetricRowItem {
  label: string;
  value: string | number;
  accent?: boolean;
}

/**
 * Two-column metric line with a hairline divider — the deliberate
 * alternative to stacked statistic cards. Values carry hierarchy
 * through size and weight; labels recede in micro caps.
 */
export default function MetricRow({ items }: { items: MetricRowItem[] }) {
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      role="group"
      aria-label={items.map((i) => `${i.label}: ${i.value}`).join(', ')}
    >
      {items.map((item, i) => (
        <div
          key={item.label}
          className={cn('px-1 py-0.5 first:pl-0 last:pr-0', i > 0 && 'border-l border-white/[0.07] pl-4')}
        >
          <div className="sentinel-label">{item.label}</div>
          <div className={cn('sentinel-mono sentinel-metric-value mt-1', item.accent ? 'text-sentinel-accent' : 'text-white')}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
