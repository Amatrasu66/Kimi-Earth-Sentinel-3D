"use client";

import { Settings, Globe, ChevronRight } from 'lucide-react';
import CommandSearch from '@/components/shell/CommandSearch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
 * Application command bar: identity + layer context, command search,
 * provenance, utilities. Chrome is translucent so the globe reads through.
 */
export default function AppHeader({ onSearchResultClick, onSettingsClick, dataStatus = null, activeLayerName = null }: AppHeaderProps) {
  const statusKind = dataStatus?.status ?? 'unknown';
  const statusColor = `var(--status-${statusKind === 'unknown' ? 'neutral' : statusKind})`;
  const showStatus = dataStatus !== null && dataStatus !== undefined;

  return (
    <header
      className="sentinel-chrome fixed left-0 right-0 top-0 z-[100] flex h-14 items-center gap-2 border-b border-white/[0.07] px-3 sm:gap-3 sm:px-4"
    >
      {/* Brand + layer context */}
      <div className="flex min-w-0 flex-shrink-0 items-center gap-2.5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-sentinel-accent/30 bg-sentinel-accent/[0.12]"
          aria-hidden
        >
          <Globe className="h-[18px] w-[18px] text-sentinel-accent" />
        </span>
        <span className="hidden min-w-0 flex-col leading-none md:flex">
          <span className="sentinel-app-title truncate text-white">Earth Sentinel 3D</span>
          <span className="sentinel-micro mt-0.5 truncate">Environmental intelligence</span>
        </span>
        <span className="sentinel-app-title truncate text-white md:hidden">Sentinel</span>
        {activeLayerName && (
          <span className="hidden min-w-0 items-center gap-1 lg:flex" aria-label={`Active layer: ${activeLayerName}`}>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/25" aria-hidden />
            <Badge
              variant="secondary"
              className="max-w-[160px] truncate border-sentinel-accent/30 bg-sentinel-accent/10 text-sentinel-accent"
              title={`Active layer: ${activeLayerName}`}
            >
              {activeLayerName}
            </Badge>
          </span>
        )}
      </div>

      {/* Command search — the primary interaction */}
      <CommandSearch onResultClick={onSearchResultClick} />

      {/* Right cluster: provenance + utilities */}
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {showStatus && (
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <span
                className="mr-0.5 hidden items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 sm:inline-flex"
                role="status"
                aria-label={`Data status: ${statusLabel(dataStatus ?? undefined)}`}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', statusKind === 'live' && 'sentinel-live-dot')} style={{ background: statusColor }} aria-hidden />
                <span className="text-[11px] font-semibold tracking-wide" style={{ color: statusColor }}>
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
            <Button variant="ghost" size="icon" onClick={onSettingsClick} aria-label="Open settings" className="h-9 w-9 rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
              <Settings className="h-[18px] w-[18px]" />
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
