"use client";

import { Thermometer, CloudRain, Cloud, Wind, Activity, AlertTriangle, Sparkles, Flame } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import type { LayerId } from '@/types';

interface LayerRailProps {
  activeLayer: LayerId | null;
  onLayerToggle: (layerId: LayerId) => void;
  /** Keyboard shortcut order — index i maps to number key i+1. */
  shortcutLayers?: LayerId[];
}

const LAYER_CONFIG: Array<{
  id: LayerId;
  icon: React.ReactNode;
  label: string;
  hint: string;
}> = [
  { id: 'temperature', icon: <Thermometer className="h-[17px] w-[17px]" />, label: 'Temperature', hint: 'Surface temperature anomalies' },
  { id: 'precipitation', icon: <CloudRain className="h-[17px] w-[17px]" />, label: 'Precipitation', hint: 'Rainfall & drought extent' },
  { id: 'clouds', icon: <Cloud className="h-[17px] w-[17px]" />, label: 'Cloud Cover', hint: 'Live cloud coverage' },
  { id: 'wind', icon: <Wind className="h-[17px] w-[17px]" />, label: 'Wind', hint: 'Wind speed & storm tracks' },
  { id: 'earthquakes', icon: <Activity className="h-[17px] w-[17px]" />, label: 'Earthquakes', hint: 'USGS seismic events' },
  { id: 'disasters', icon: <AlertTriangle className="h-[17px] w-[17px]" />, label: 'Disasters', hint: 'EONET natural events' },
  { id: 'air_quality', icon: <Sparkles className="h-[17px] w-[17px]" />, label: 'Air Quality', hint: 'AQI & particulates' },
  { id: 'wildfires', icon: <Flame className="h-[17px] w-[17px]" />, label: 'Wildfires', hint: 'Active fire detections' },
];

/**
 * Layer rail geometry (desktop): one coherent vertical instrument.
 * Every row shares a single grid — the active marker lives in its own
 * gutter cell, never absolutely positioned. Active state is a thin
 * accent line plus a quiet tonal shift, never a glowing capsule.
 */
function RailButton({
  layer,
  isActive,
  shortcutIdx,
  onToggle,
}: {
  layer: (typeof LAYER_CONFIG)[number];
  isActive: boolean;
  shortcutIdx: number;
  onToggle: (layerId: LayerId) => void;
}) {
  return (
    <div className="grid grid-cols-[3px_1fr] items-center gap-1.5 px-2">
      <span
        className={cn(
          'h-5 w-[2px] rounded-full transition-colors duration-150',
          isActive ? 'bg-sentinel-accent' : 'bg-transparent',
        )}
        aria-hidden
      />
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <button
            onClick={() => onToggle(layer.id)}
            aria-label={`Toggle ${layer.label} layer${shortcutIdx >= 0 ? `, shortcut ${shortcutIdx + 1}` : ''}`}
            aria-pressed={isActive}
            data-active={isActive}
            className={cn(
              'flex h-10 w-full items-center justify-center rounded-[7px] border transition-colors duration-150',
              isActive
                ? 'border-sentinel-accent/30 bg-sentinel-accent/[0.1] text-sentinel-accent'
                : 'border-transparent text-white/45 hover:bg-white/[0.06] hover:text-white/90',
            )}
          >
            {layer.icon}
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={10}
          className="border-white/10 bg-sentinel-elev px-2.5 py-1.5 text-white"
        >
          <span className="block text-xs font-semibold">{layer.label}</span>
          <span className="block max-w-[200px] text-[11px] text-white/50">{layer.hint}</span>
          {shortcutIdx >= 0 && (
            <span className="mt-1 flex items-center gap-1 text-[11px] text-white/40">
              press <Kbd className="border-white/10 bg-white/10 text-white/70">{shortcutIdx + 1}</Kbd>
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export default function LayerRail({ activeLayer, onLayerToggle, shortcutLayers = [] }: LayerRailProps) {
  const activeLabel = activeLayer ? LAYER_CONFIG.find((l) => l.id === activeLayer)?.label : null;

  return (
    <>
      {/* Desktop: vertical instrument, centered in its grid cell */}
      <nav
        role="toolbar"
        aria-label="Environmental layers"
        aria-orientation="vertical"
        className="layer-rail panel-enter hidden max-h-full overflow-y-auto md:flex"
      >
        <p className="sentinel-label flex h-7 items-center justify-center">Layer</p>
        <div className="flex flex-col gap-0.5 py-1">
          {LAYER_CONFIG.map((layer) => (
            <RailButton
              key={layer.id}
              layer={layer}
              isActive={activeLayer === layer.id}
              shortcutIdx={shortcutLayers.indexOf(layer.id)}
              onToggle={onLayerToggle}
            />
          ))}
        </div>
        <div className="mx-3 my-1 border-t border-white/[0.07]" aria-hidden />
        <p className="sentinel-micro sentinel-mono flex h-6 items-center justify-center" aria-live="off">
          {activeLabel ? activeLabel.slice(0, 4).toUpperCase() : '— —'}
        </p>
      </nav>

      {/* Mobile: compact horizontal strip, in-flow above the status dock */}
      <nav
        role="toolbar"
        aria-label="Environmental layers"
        aria-orientation="horizontal"
        className="layer-rail flex-row items-center gap-1 overflow-x-auto p-1.5 md:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {LAYER_CONFIG.map((layer) => {
          const isActive = activeLayer === layer.id;
          return (
            <button
              key={layer.id}
              onClick={() => onLayerToggle(layer.id)}
              aria-label={`Toggle ${layer.label} layer`}
              aria-pressed={isActive}
              title={layer.label}
              className={cn(
                'flex h-10 min-w-10 flex-1 items-center justify-center rounded-[7px] border transition-colors duration-150',
                isActive
                  ? 'border-sentinel-accent/30 bg-sentinel-accent/[0.1] text-sentinel-accent'
                  : 'border-transparent text-white/45 active:bg-white/[0.07] active:text-white/90',
              )}
            >
              {layer.icon}
            </button>
          );
        })}
      </nav>
    </>
  );
}
