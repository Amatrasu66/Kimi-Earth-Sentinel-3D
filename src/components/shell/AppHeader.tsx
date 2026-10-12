"use client";

import { Settings, Globe, ChevronRight } from 'lucide-react';
import CommandSearch from '@/components/shell/CommandSearch';
import ViewToggle from '@/components/shell/ViewToggle';
import type { AppView } from '@/lib/url-state';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { provenanceChipLabel, resolveProvenance } from '@/lib/provenance';
import type { DataStatus } from '@/types';

interface AppHeaderProps {
  onSearchResultClick: (lat: number, lon: number) => void;
  onSettingsClick: () => void;
  /** Compact provenance badge — the header owns provenance at ≥sm widths. */
  dataStatus?: DataStatus | null;
  /** Server L1 bit (T3.7): a live result served from cache reads CACHED. */
  cacheHit?: boolean | null;
  activeLayerName?: string | null;
  /** Controlled search text (T3.3 URL state) + change reports. */
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  /**
   * Single-key shortcut map enabled (T3.10 Settings toggle). Gates the `/`
   * focus-search key and every shortcut hint this header advertises.
   */
  singleKeyShortcuts?: boolean;
  /**
   * Globe/list presentation (T3.3 URL state, T3.15 toggle). Optional so
   * existing header harnesses keep compiling; the app always passes it.
   */
  view?: AppView;
  /** Presentation-only switch — handled by the app's URL-state sync. */
  onViewChange?: (next: AppView) => void;
}

/**
 * Command strip: three deliberate zones on one baseline —
 * brand+layer | command search | system state. In-flow header row owned
 * by AppShell; translucent so the globe reads through at the top edge.
 */
export default function AppHeader({ onSearchResultClick, onSettingsClick, dataStatus = null, cacheHit = null, activeLayerName = null, searchQuery, onSearchQueryChange, singleKeyShortcuts = true, view = 'globe', onViewChange }: AppHeaderProps) {
  const statusKind = resolveProvenance(dataStatus, cacheHit, null).kind;
  const chipLabel = provenanceChipLabel(dataStatus, cacheHit);
  const statusColor = `var(--status-${statusKind === 'unknown' ? 'neutral' : statusKind})`;
  const showStatus = dataStatus !== null && dataStatus !== undefined;

  return (
    <header className="sentinel-chrome grid h-[var(--header-height)] grid-cols-[minmax(0,1fr)_minmax(0,420px)_minmax(0,1fr)] items-center gap-2 border-b border-white/[0.07] px-2.5 sm:px-3 md:px-4 lg:gap-3">
      {/* LEFT — brand / active layer, separated by typography not pills */}
      <div className="flex min-w-0 items-center gap-2">
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
        <span className="sentinel-app-title hidden truncate text-white min-[400px]:block lg:hidden">Sentinel</span>
        {activeLayerName && (
          <span className="hidden min-w-0 items-center gap-1 sm:flex">
            {/* sr-only text (T3.10): aria-label on a generic span is
                ignored by assistive tech — this keeps the active layer
                announced while the visual copy stays hidden from AT. */}
            <span className="sr-only">Active layer: {activeLayerName}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/25" aria-hidden />
            <span className="sentinel-layer-name truncate text-sentinel-accent max-w-[160px] sm:max-w-none" title={`Active layer: ${activeLayerName}`} aria-hidden>
              {activeLayerName}
            </span>
          </span>
        )}
      </div>

      {/* CENTER — command search, integrated not floating */}
      <div role="search" className="flex min-w-0 justify-center">
        <CommandSearch
          onResultClick={onSearchResultClick}
          className="mx-auto w-full min-w-0 max-w-[420px]"
          query={searchQuery}
          onQueryChange={onSearchQueryChange}
          singleKeyShortcuts={singleKeyShortcuts}
        />
      </div>

      {/* RIGHT — system state / controls, right-aligned to the same baseline */}
      <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
        <ViewToggle view={view} onViewChange={onViewChange} />
        {showStatus && (
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              {/* Not a live region (T3.10): the panel's DataStatusBanner is
                  the single announcer for provenance changes — this chip is
                  a visual copy for pointer users, and was one of three live
                  regions reacting to the same transition. */}
              <span className="mr-0.5 hidden items-center gap-1.5 md:inline-flex">
                <span className="sr-only">Data status: {chipLabel}</span>
                <span className={cn('h-1.5 w-1.5 rounded-full', statusKind === 'live' && 'sentinel-live-dot')} style={{ background: statusColor }} aria-hidden />
                <span className="text-[11px] font-semibold tracking-[0.08em]" style={{ color: statusColor }} aria-hidden>
                  {chipLabel}
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
            {/* id is the T3.10 focus-restore target: Settings is a controlled
                dialog with no Trigger, so closing it returns focus here. */}
            <Button variant="ghost" size="icon" id="sentinel-settings-button" onClick={onSettingsClick} aria-label="Open settings" aria-haspopup="dialog" className="h-8 w-8 rounded-[7px] text-white/60 hover:bg-white/10 hover:text-white">
              <Settings className="h-[17px] w-[17px]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="border-white/10 bg-sentinel-elev text-white">
            <span className="flex items-center gap-2 text-xs">
              Settings
              {singleKeyShortcuts && <Kbd className="border-white/10 bg-white/10 text-white/60">?</Kbd>}
            </span>
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
