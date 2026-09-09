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
  const left = Math.min(Math.max(mousePos.x + 16, 8), window.innerWidth - 200);
  const top = Math.max(mousePos.y - 10, 120);

  return (
    <div
      className="fixed z-[60] pointer-events-none"
      style={{
        left,
        top,
        transform: 'translateY(-100%)',
      }}
    >
      <div
        className="rounded-lg px-3 py-2"
        style={{
          background: 'rgba(15, 15, 20, 0.95)',
          backdropFilter: 'blur(10px)',
          border: `1px solid ${severityColor}40`,
          boxShadow: `0 4px 16px rgba(0,0,0,0.4)`,
          minWidth: 160,
          maxWidth: 240,
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: severityColor }} />
          <span className="text-white text-xs font-medium truncate">{point.title || 'Event'}</span>
        </div>
        <div className="text-white/40 text-xs pl-4">
          {point.location || `${point.lat.toFixed(1)}, ${point.lon.toFixed(1)}`}
        </div>
        {metric && <div className="text-white/40 text-xs pl-4">{metric}</div>}
      </div>
    </div>
  );
}
