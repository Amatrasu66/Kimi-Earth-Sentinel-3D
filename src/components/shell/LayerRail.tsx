"use client";

import { Thermometer, CloudRain, Cloud, Wind, Activity, AlertTriangle, Sparkles, Flame } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
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
  { id: 'temperature', icon: <Thermometer className="h-[18px] w-[18px]" />, label: 'Temperature', hint: 'Surface temperature anomalies' },
  { id: 'precipitation', icon: <CloudRain className="h-[18px] w-[18px]" />, label: 'Precipitation', hint: 'Rainfall & drought extent' },
  { id: 'clouds', icon: <Cloud className="h-[18px] w-[18px]" />, label: 'Cloud Cover', hint: 'Live cloud coverage' },
  { id: 'wind', icon: <Wind className="h-[18px] w-[18px]" />, label: 'Wind', hint: 'Wind speed & storm tracks' },
  { id: 'earthquakes', icon: <Activity className="h-[18px] w-[18px]" />, label: 'Earthquakes', hint: 'USGS seismic events' },
  { id: 'disasters', icon: <AlertTriangle className="h-[18px] w-[18px]" />, label: 'Disasters', hint: 'EONET natural events' },
  { id: 'air_quality', icon: <Sparkles className="h-[18px] w-[18px]" />, label: 'Air Quality', hint: 'AQI & particulates' },
  { id: 'wildfires', icon: <Flame className="h-[18px] w-[18px]" />, label: 'Wildfires', hint: 'Active fire detections' },
];

/**
 * Layer rail geometry (desktop):
 *
 *   8px padding │ 3px indicator gutter │ 8px gap │ 40px button column │ 8px padding
 *
 * Every row is the same grid — the active marker lives in its own gutter
 * cell, never absolutely positioned over borders. Header and footer labels
 * align to the button column.
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
    <div className="grid grid-cols-[3px_40px] items-center gap-2">
      <span
        className={cn(
          'h-5 w-[3px] rounded-full transition-colors duration-150',
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
              'sentinel-spot flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150',
              isActive
                ? 'sentinel-active-ring bg-sentinel-accent/[0.13] text-sentinel-accent'
                : 'border border-transparent text-white/45 hover:bg-white/[0.07] hover:text-white/90',
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
      {/* Desktop: vertical command rail, vertically centered */}
      <nav
        role="toolbar"
        aria-label="Environmental layers"
        aria-orientation="vertical"
        className="rail-enter sentinel-floating fixed left-3 top-1/2 z-50 hidden -translate-y-1/2 flex-col rounded-xl p-2 md:flex"
      >
        <p className="sentinel-label flex h-7 items-center justify-center">Layers</p>
        <div className="flex flex-col gap-1 py-1">
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
        <Separator className="my-1 bg-white/[0.07]" />
        <p className="sentinel-micro sentinel-mono flex h-6 items-center justify-center" aria-live="off">
          {activeLabel ? activeLabel.slice(0, 4).toUpperCase() : '— —'}
        </p>
      </nav>

      {/* Mobile / narrow: horizontal strip above the status bar.
          Same fixed hitboxes and gaps as desktop, laid horizontally. */}
      <nav
        role="toolbar"
        aria-label="Environmental layers"
        aria-orientation="horizontal"
        className="sentinel-floating fixed bottom-[68px] left-3 right-3 z-50 flex items-center gap-1 overflow-x-auto rounded-xl p-1.5 md:hidden"
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
                'flex h-10 w-10 shrink-0 snap-start items-center justify-center rounded-lg transition-colors duration-150',
                isActive
                  ? 'sentinel-active-ring bg-sentinel-accent/[0.13] text-sentinel-accent'
                  : 'border border-transparent text-white/45 active:bg-white/[0.07] active:text-white/90',
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
