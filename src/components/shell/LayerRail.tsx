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
 * Compact instrumentation rail for environmental layers. Accent marks
 * selection only — idle icons stay neutral so the globe keeps priority.
 */
export default function LayerRail({ activeLayer, onLayerToggle, shortcutLayers = [] }: LayerRailProps) {
  const activeLabel = activeLayer ? LAYER_CONFIG.find((l) => l.id === activeLayer)?.label : null;

  return (
    <>
      {/* Desktop: vertical command rail, vertically centered */}
      <nav
        role="toolbar"
        aria-label="Environmental layers"
        aria-orientation="vertical"
        className="rail-enter sentinel-floating fixed left-3 top-1/2 z-50 hidden -translate-y-1/2 flex-col gap-0.5 rounded-xl p-1.5 md:flex"
      >
        <p className="sentinel-label px-2 pb-1 pt-1">Layers</p>
        {LAYER_CONFIG.map((layer) => {
          const isActive = activeLayer === layer.id;
          const shortcutIdx = shortcutLayers.indexOf(layer.id);
          return (
            <Tooltip key={layer.id} delayDuration={100}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onLayerToggle(layer.id)}
                  aria-label={`Toggle ${layer.label} layer${shortcutIdx >= 0 ? `, shortcut ${shortcutIdx + 1}` : ''}`}
                  aria-pressed={isActive}
                  data-active={isActive}
                  className={cn(
                    'sentinel-spot group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150',
                    isActive
                      ? 'sentinel-active-ring bg-sentinel-accent/[0.13] text-sentinel-accent'
                      : 'border border-transparent text-white/45 hover:bg-white/[0.07] hover:text-white/90',
                  )}
                >
                  {layer.icon}
                  {isActive && (
                    <span className="absolute -left-[7px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-sentinel-accent" aria-hidden />
                  )}
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
          );
        })}
        <Separator className="my-1 bg-white/[0.07]" />
        <p className="sentinel-micro sentinel-mono px-2 py-1 text-center" aria-live="off">
          {activeLabel ? activeLabel.slice(0, 4).toUpperCase() : '— —'}
        </p>
      </nav>

      {/* Mobile / narrow: horizontal layer strip above the status bar */}
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
