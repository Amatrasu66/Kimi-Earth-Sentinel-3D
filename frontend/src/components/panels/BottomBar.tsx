import { useMemo, useState, useEffect } from 'react';
import { Crosshair } from 'lucide-react';
import DataStatusBanner from '@/components/overlays/DataStatusBanner';
import { formatCoordinates } from '@/lib/format';
import type { DataStatus } from '@/types';

interface BottomBarProps {
  coordinates: { lat: number; lon: number } | null;
  activeLayer: string | null;
  dataCount: number;
  dataStatus?: DataStatus | null;
}

export default function BottomBar({ coordinates, activeLayer, dataCount, dataStatus = null }: BottomBarProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Stable minimap dots — Math.random() in render flickered every second.
  const dots = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        x: ((i * 53) % 16) * 10 + ((i * 37) % 5),
        y: Math.floor(i / 16) * 8 + ((i * 29) % 4),
      })),
    [],
  );

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-4 gap-3"
      style={{
        height: 60,
        background: 'rgba(2, 2, 2, 0.7)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Left: Coordinates */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-white/30 flex-shrink-0" />
          <span className="text-white/50 text-xs font-mono whitespace-nowrap">
            {coordinates ? formatCoordinates(coordinates.lat, coordinates.lon) : '--°, --°'}
          </span>
        </div>
        {activeLayer && (
          <div
            className="px-2 py-0.5 rounded-md text-xs whitespace-nowrap hidden sm:block"
            style={{ background: 'rgba(255,195,31,0.1)', color: '#FFC31F' }}
          >
            {activeLayer}: {dataCount} events
          </div>
        )}
        {dataStatus && (
          <div className="hidden md:block">
            <DataStatusBanner status={dataStatus} compact />
          </div>
        )}
      </div>

      {/* Center: Timestamp */}
      <div className="text-white/30 text-xs font-mono whitespace-nowrap hidden sm:block">
        {time.toISOString().replace('T', ' ').slice(0, 19)} UTC
      </div>

      {/* Right: Minimap */}
      <div
        className="rounded-lg overflow-hidden flex-shrink-0 hidden sm:block"
        style={{
          width: 160,
          height: 40,
          background: 'rgba(5, 24, 64, 0.8)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
        aria-hidden
      >
        <svg viewBox="0 0 160 40" className="w-full h-full">
          {dots.map((d, i) => (
            <rect key={i} x={d.x} y={d.y} width="2" height="2" fill="#0A2A5C" rx="0.5" />
          ))}
          <rect x={60} y={10} width={40} height={20} fill="none" stroke="#FFC31F" strokeWidth="0.5" rx="2" opacity="0.6" />
        </svg>
      </div>
    </div>
  );
}
