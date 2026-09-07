import { useState, useEffect } from 'react';
import { Crosshair } from 'lucide-react';

interface BottomBarProps {
  coordinates: { lat: number; lon: number } | null;
  activeLayer: string | null;
  dataCount: number;
}

export default function BottomBar({ coordinates, activeLayer, dataCount }: BottomBarProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-4"
      style={{ 
        height: 60, 
        background: 'rgba(2, 2, 2, 0.7)', 
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Left: Coordinates */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-white/30" />
          <span className="text-white/50 text-xs font-mono">
            {coordinates ? `${coordinates.lat.toFixed(4)}°N, ${coordinates.lon.toFixed(4)}°E` : '--°, --°'}
          </span>
        </div>
        {activeLayer && (
          <div 
            className="px-2 py-0.5 rounded-md text-xs"
            style={{ background: 'rgba(255,195,31,0.1)', color: '#FFC31F' }}
          >
            {activeLayer}: {dataCount} events
          </div>
        )}
      </div>

      {/* Center: Timestamp */}
      <div className="text-white/30 text-xs font-mono">
        {time.toISOString().replace('T', ' ').slice(0, 19)} UTC
      </div>

      {/* Right: Minimap placeholder */}
      <div 
        className="rounded-lg overflow-hidden"
        style={{ 
          width: 160, 
          height: 40, 
          background: 'rgba(5, 24, 64, 0.8)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <svg viewBox="0 0 160 40" className="w-full h-full">
          {/* Simplified world map dots */}
          {Array.from({ length: 80 }, (_, i) => {
            const x = (i % 16) * 10 + Math.random() * 5;
            const y = Math.floor(i / 16) * 8 + Math.random() * 4;
            return (
              <rect 
                key={i} 
                x={x} 
                y={y} 
                width="2" 
                height="2" 
                fill="#0A2A5C" 
                rx="0.5"
              />
            );
          })}
          {/* Viewport indicator */}
          <rect 
            x={60} 
            y={10} 
            width={40} 
            height={20} 
            fill="none" 
            stroke="#FFC31F" 
            strokeWidth="0.5"
            rx="2"
            opacity="0.6"
          />
        </svg>
      </div>
    </div>
  );
}
