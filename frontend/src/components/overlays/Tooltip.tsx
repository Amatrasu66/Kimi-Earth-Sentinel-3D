import type { DataPoint, LayerId } from '@/types';
import { SEVERITY_COLORS } from '@/types';
import { formatPointValue } from '@/lib/format';

interface TooltipProps {
  point: DataPoint | null;
  mousePos: { x: number; y: number };
  activeLayer?: LayerId | null;
}

export default function Tooltip({ point, mousePos, activeLayer = null }: TooltipProps) {
  if (!point) return null;

  const severityColor = SEVERITY_COLORS[point.severity as keyof typeof SEVERITY_COLORS] || '#FFC31F';
  const metric = activeLayer === 'earthquakes' && point.magnitude !== undefined
    ? `Magnitude ${point.magnitude}`
    : point.value !== undefined
      ? (formatPointValue(point, activeLayer) ?? undefined)
      : undefined;

  // Clamp near viewport edges so the tooltip never clips off-screen.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const left = Math.min(Math.max(mousePos.x + 16, 8), vw - 248);
  const top = Math.max(mousePos.y - 12, 64);

  return (
    <div
      className="pointer-events-none fixed z-[60]"
      role="status"
      aria-label={point.title ? `Event: ${point.title}` : 'Hovered event'}
      style={{ left, top, transform: 'translateY(-100%)' }}
    >
      <div
        className="rounded-lg px-3 py-2"
        style={{
          background: 'rgba(13, 15, 19, 0.94)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${severityColor}45`,
          boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
          minWidth: 168,
          maxWidth: 248,
        }}
      >
        <div className="mb-0.5 flex items-center gap-2">
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: severityColor }} aria-hidden />
          <span className="truncate text-xs font-semibold text-white">{point.title || 'Event'}</span>
        </div>
        <div className="truncate pl-3.5 text-[11px] text-white/50">
          {point.location || `${point.lat.toFixed(1)}, ${point.lon.toFixed(1)}`}
        </div>
        {metric && <div className="sentinel-mono pl-3.5 text-[11px] text-white/60">{metric}</div>}
      </div>
    </div>
  );
}
