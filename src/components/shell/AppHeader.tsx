"use client";

import { Settings, Globe, ChevronRight } from 'lucide-react';
import CommandSearch from '@/components/shell/CommandSearch';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { statusLabel } from '@/lib/format';
import type { DataStatus } from '@/types';

interface AppHeaderProps {
  onSearchResultClick: (lat: number, lon: number) => void;
  onSettingsClick: () => void;
  /** Compact provenance badge — the header owns provenance at ≥sm widths. */
  dataStatus?: DataStatus | null;
  activeLayerName?: string | null;
}

/**
 * Command strip: three deliberate zones on one baseline —
 * brand+layer | command search | system state. In-flow header row owned
 * by AppShell; translucent so the globe reads through at the top edge.
 */
export default function AppHeader({ onSearchResultClick, onSettingsClick, dataStatus = null, activeLayerName = null }: AppHeaderProps) {
  const statusKind = dataStatus?.status ?? 'unknown';
  const statusColor = `var(--status-${statusKind === 'unknown' ? 'neutral' : statusKind})`;
  const showStatus = dataStatus !== null && dataStatus !== undefined;

  return (
    <header className="sentinel-chrome grid h-[var(--header-height)] grid-cols-[minmax(32px,1fr)_minmax(0,420px)_minmax(32px,1fr)] items-center gap-3 border-b border-white/[0.07] px-3 sm:px-4">
      {/* LEFT — brand / active layer, separated by typography not pills */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border border-sentinel-accent/25 bg-sentinel-accent/[0.1]"
          aria-hidden
        >
          <Globe className="h-[17px] w-[17px] text-sentinel-accent" />
        </span>
        <span className="hidden min-w-0 flex-col leading-none lg:flex">
          <span className="sentinel-app-title truncate text-white">Earth Sentinel 3D</span>
          <span className="sentinel-micro mt-1 truncate">Environmental intelligence</span>
        </span>
        <span className="sentinel-app-title hidden truncate text-white min-[480px]:block lg:hidden">Sentinel</span>
        {activeLayerName && (
          <span className="hidden min-w-0 items-center gap-1 lg:flex" aria-label={`Active layer: ${activeLayerName}`}>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/25" aria-hidden />
            <span className="sentinel-layer-name truncate text-sentinel-accent" title={`Active layer: ${activeLayerName}`}>
              {activeLayerName}
            </span>
          </span>
        )}
      </div>

      {/* CENTER — command search, integrated not floating */}
      <div className="flex min-w-0 justify-center">
        <CommandSearch onResultClick={onSearchResultClick} className="mx-0 w-full min-w-0 max-w-[420px]" />
      </div>

      {/* RIGHT — system state / controls, right-aligned to the same baseline */}
      <div className="flex items-center justify-end gap-2">
        {showStatus && (
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <span
                className="mr-0.5 hidden items-center gap-1.5 sm:inline-flex"
                role="status"
                aria-label={`Data status: ${statusLabel(dataStatus ?? undefined)}`}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', statusKind === 'live' && 'sentinel-live-dot')} style={{ background: statusColor }} aria-hidden />
                <span className="text-[11px] font-semibold tracking-[0.08em]" style={{ color: statusColor }}>
                  {statusLabel(dataStatus ?? undefined)}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="border-white/10 bg-sentinel-elev text-white">
              <span className="text-xs">{dataStatus?.source ?? 'Unknown source'}{dataStatus?.message ? ` — ${dataStatus.message}` : ''}</span>
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onSettingsClick} aria-label="Open settings" className="h-8 w-8 rounded-[7px] text-white/60 hover:bg-white/10 hover:text-white">
              <Settings className="h-[17px] w-[17px]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="border-white/10 bg-sentinel-elev text-white">
            <span className="flex items-center gap-2 text-xs">Settings <Kbd className="border-white/10 bg-white/10 text-white/60">?</Kbd></span>
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
