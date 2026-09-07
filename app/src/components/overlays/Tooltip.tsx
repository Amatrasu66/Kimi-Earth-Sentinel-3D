import type { DataPoint } from '@/types';
import { SEVERITY_COLORS } from '@/types';

interface TooltipProps {
  point: DataPoint | null;
  mousePos: { x: number; y: number };
}

export default function Tooltip({ point, mousePos }: TooltipProps) {
  if (!point) return null;

  const severityColor = SEVERITY_COLORS[point.severity as keyof typeof SEVERITY_COLORS] || '#FFC31F';

  return (
    <div
      className="fixed z-[60] pointer-events-none"
      style={{
        left: mousePos.x + 16,
        top: mousePos.y - 10,
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
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div 
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: severityColor }}
          />
          <span className="text-white text-xs font-medium truncate">{point.title || 'Event'}</span>
        </div>
        <div className="text-white/40 text-xs pl-4">
          {point.location || `${point.lat.toFixed(1)}, ${point.lon.toFixed(1)}`}
        </div>
        {point.magnitude !== undefined && (
          <div className="text-white/40 text-xs pl-4">Magnitude: {point.magnitude}</div>
        )}
        {point.value !== undefined && (
          <div className="text-white/40 text-xs pl-4">{point.value} {point.unit}</div>
        )}
      </div>
    </div>
  );
}
