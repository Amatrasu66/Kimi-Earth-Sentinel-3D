"use client";

import { useState, useEffect } from 'react';
import { Crosshair, Cpu } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { formatCoordinates, statusLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DataStatus } from '@/types';
import type { RendererInfo } from '@/components/globe/EarthRenderer';

interface StatusDockProps {
  coordinates: { lat: number; lon: number } | null;
  activeLayer: string | null;
  dataCount: number;
  dataStatus?: DataStatus | null;
  rendererInfo?: RendererInfo | null;
}

/**
 * Bottom status dock: cursor coordinates, layer context, UTC clock,
 * renderer state. Provenance lives here only on wide screens (≥lg) —
 * the header owns it below that, the data banner owns it in context.
 */
export default function StatusDock({ coordinates, activeLayer, dataCount, dataStatus = null, rendererInfo = null }: StatusDockProps) {
  // Null until client mount: SSR and the first client render must produce
  // identical markup, so the live clock starts only inside useEffect (after
  // hydration) — never from `new Date()` during render.
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    // Mount-only client clock start (wall-clock time is external state, and
    // starting it here — never during render — is what keeps SSR markup
    // deterministic). Same exemption as hooks/use-mobile.ts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTime(new Date());
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const statusKind = dataStatus?.status ?? 'unknown';
  const statusColor = `var(--status-${statusKind === 'unknown' ? 'neutral' : statusKind})`;
  // Session 6: badge reads e.g. "WebGL · forced" vs "WebGPU · automatic"
  // so a `?renderer=` override is impossible to misunderstand.
  const sourceSuffix = rendererInfo?.source === 'forced' ? ' · forced' : ' · automatic';
  const rendererShort =
    rendererInfo?.active === 'loading' || !rendererInfo
      ? 'Starting…'
      : `${rendererInfo.active === 'webgpu' ? 'WebGPU' : 'WebGL'}${sourceSuffix}`;
  const rendererLabel =
    rendererInfo?.active === 'webgpu'
      ? `WebGPU${sourceSuffix} · ${rendererInfo.detail}`
      : rendererInfo?.active === 'webgl'
        ? `WebGL${sourceSuffix} · ${rendererInfo.detail}`
        : 'Renderer…';

  return (
    <footer
      className="sentinel-chrome fixed bottom-0 left-0 right-0 z-50 flex h-[52px] items-center justify-between gap-2 border-t border-white/[0.07] px-3 sm:px-4"
      aria-label="Status bar"
    >
      {/* Left: position + layer + provenance (wide screens) */}
      <div className="flex min-w-0 items-center gap-2">
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <span className="flex shrink-0 cursor-default items-center gap-1.5" aria-label={coordinates ? `Cursor coordinates ${formatCoordinates(coordinates.lat, coordinates.lon)}` : 'No hovered coordinate'}>
              <Crosshair className="h-3.5 w-3.5 text-white/30" aria-hidden />
              <span className="sentinel-micro sentinel-mono whitespace-nowrap text-white/50">
                {coordinates ? formatCoordinates(coordinates.lat, coordinates.lon) : '— —'}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="border-white/10 bg-sentinel-elev text-xs text-white">
            Hover the globe to inspect coordinates
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="hidden h-4 bg-white/10 sm:block" />

        {activeLayer ? (
          <span className="sentinel-mono hidden max-w-[220px] truncate text-[11px] sm:block" title={`Active layer: ${activeLayer}`}>
            <span className="text-sentinel-accent">{activeLayer}</span>
            <span className="text-white/35"> · {dataCount}</span>
          </span>
        ) : (
          <span className="sentinel-micro hidden sm:inline">No layer selected</span>
        )}

        {dataStatus && (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <span
                className="hidden cursor-default items-center gap-1.5 lg:inline-flex"
                role="status"
                aria-label={`Data status: ${statusLabel(dataStatus)} · ${dataStatus.source}`}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', statusKind === 'live' && 'sentinel-live-dot')} style={{ background: statusColor }} aria-hidden />
                <span className="text-[11px] font-semibold tracking-wide" style={{ color: statusColor }}>
                  {statusLabel(dataStatus)}
                </span>
                <span className="sentinel-micro max-w-[180px] truncate">{dataStatus.source}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="border-white/10 bg-sentinel-elev text-xs text-white">
              {dataStatus.message ?? `Source: ${dataStatus.source}`}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Center: UTC clock (placeholder until client mount — see above) */}
      <div className="sentinel-micro sentinel-mono hidden whitespace-nowrap lg:block" aria-label="Current UTC time" aria-live="off">
        {time ? `${time.toISOString().replace('T', ' ').slice(0, 19)} UTC` : '— —'}
      </div>

      {/* Right: renderer state */}
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span className="flex shrink-0 cursor-default items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1" role="status" aria-label={`Renderer: ${rendererLabel}`}>
            <Cpu className="h-3.5 w-3.5 text-white/40" aria-hidden />
            <span className="sentinel-micro hidden sm:inline">{rendererShort}</span>
            <span className={cn('h-1.5 w-1.5 rounded-full', rendererInfo?.active === 'webgpu' && 'sentinel-live-dot')} style={{ background: rendererInfo?.active === 'webgpu' ? 'var(--status-live)' : rendererInfo?.active === 'webgl' ? 'var(--status-simulated)' : 'var(--status-neutral)' }} aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="border-white/10 bg-sentinel-elev text-xs text-white">
          {rendererLabel}
          {rendererInfo && rendererInfo.textures.total > 0 && ` · textures ${rendererInfo.textures.loaded}/${rendererInfo.textures.total}`}
        </TooltipContent>
      </Tooltip>
    </footer>
  );
}
