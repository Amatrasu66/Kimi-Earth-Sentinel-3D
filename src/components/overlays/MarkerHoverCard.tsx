"use client";

import { useEffect, useState } from 'react';
import type { DataPoint, LayerId } from '@/types';
import { SEVERITY_COLORS } from '@/types';
import { formatPointValue } from '@/lib/format';

interface MarkerHoverCardProps {
  point: DataPoint | null;
  activeLayer?: LayerId | null;
}

/**
 * Globe hover card. Owns its cursor-follow position through a local
 * rAF-throttled listener so pointer movement re-renders only this leaf —
 * never the app shell or the renderer subtree (Phase 2 perf fix).
 */
export default function MarkerHoverCard({ point, activeLayer = null }: MarkerHoverCardProps) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, w: 1024 });

  useEffect(() => {
    let raf = 0;
    let latest = { x: 0, y: 0, w: 1024 };
    const flush = () => {
      raf = 0;
      setMousePos(latest);
    };
    const handleMouseMove = (e: MouseEvent) => {
      latest = { x: e.clientX, y: e.clientY, w: window.innerWidth };
      if (raf === 0) raf = requestAnimationFrame(flush);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  if (!point) return null;

  // Hex fallback (not a token): the border below appends an alpha suffix,
  // which requires a literal hex color, not var().
  const severityColor = SEVERITY_COLORS[point.severity as keyof typeof SEVERITY_COLORS] || '#ffc31f';
  const metric = activeLayer === 'earthquakes' && point.magnitude !== undefined
    ? `Magnitude ${point.magnitude}`
    : point.value !== undefined
      ? (formatPointValue(point, activeLayer) ?? undefined)
      : undefined;

  // Clamp near viewport edges so the card never clips off-screen.
  const left = Math.min(Math.max(mousePos.x + 16, 8), mousePos.w - 248);
  const top = Math.max(mousePos.y - 12, 64);

  return (
    <div
      className="pointer-events-none fixed z-[60]"
      role="status"
      aria-label={point.title ? `Event: ${point.title}` : 'Hovered event'}
      style={{ left, top, transform: 'translateY(-100%)' }}
    >
      <div
        className="rounded-lg bg-sentinel-panel px-3 py-2"
        style={{
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
