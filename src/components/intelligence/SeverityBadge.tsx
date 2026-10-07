import { Badge } from '@/components/ui/badge';
import { SEVERITY_COLORS } from '@/types';

/** Severity pill — color carries meaning alongside the text label. */
export default function SeverityBadge({ severity }: { severity: string }) {
  const color = SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] || 'var(--status-simulated)';
  return (
    <Badge
      variant="outline"
      className="gap-1 px-2 py-0.5 text-[11px] font-semibold capitalize"
      style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 27%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {severity}
    </Badge>
  );
}
