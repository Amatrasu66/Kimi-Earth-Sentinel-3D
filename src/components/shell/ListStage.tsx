import { AlertCircle, ChevronLeft, RefreshCw, Radio, X } from 'lucide-react';
import DataStatusBanner from '@/components/overlays/DataStatusBanner';
import LayerOverview from '@/components/intelligence/LayerOverview';
import EventDetails from '@/components/intelligence/EventDetails';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { DataPoint, DataStatus, EventDetail, LayerId, LayerMetadata } from '@/types';
import type { SeverityFilterValue } from '@/components/intelligence/SeverityFilter';

interface ListStageProps {
  activeLayer: LayerId | null;
  layerMeta: LayerMetadata | null;
  /** Same payload array the globe renders — no second fetch path. */
  dataPoints: DataPoint[];
  selectedEvent: DataPoint | null;
  eventDetail: EventDetail | null;
  eventDetailLoading: boolean;
  loading: boolean;
  error: string | null;
  dataStatus: DataStatus | null;
  /** Server L1 bit from the SWR envelope — renders CACHED, never implied. */
  cacheHit?: boolean | null;
  /** Severity display filter (T3.3: app-owned for URL state, shared with globe mode). */
  severityFilter: SeverityFilterValue;
  onSeverityChange: (next: SeverityFilterValue) => void;
  onEventSelect: (point: DataPoint) => void;
  onRefresh: () => void;
  onClose: () => void;
  onBackToLayer: () => void;
}

/**
 * List presentation (T3.15): the `view=list` stage. The selected layer's
 * real observations as the primary list — `LayerOverview` (severity
 * filter, distribution, `EventList`) plus the provenance strip, driven by
 * the same hook payload as the globe. Selecting an event swaps the list
 * for the detail (the same swap `DataPanel` performs in globe mode), so
 * no row is ever rendered twice. Loading, empty, unavailable and error
 * states mirror `DataPanel` truthfully; rows are never fabricated.
 *
 * Geometry: `absolute inset-0` fills the stage cell exactly like the
 * dotted globe it replaces (the cell is `position: relative`), so both
 * presentations occupy the same usable workspace on every viewport.
 */
export default function ListStage({
  activeLayer,
  layerMeta,
  dataPoints,
  selectedEvent,
  eventDetail,
  eventDetailLoading,
  loading,
  error,
  dataStatus,
  cacheHit = null,
  severityFilter,
  onSeverityChange,
  onEventSelect,
  onRefresh,
  onClose,
  onBackToLayer,
}: ListStageProps) {
  const title = layerMeta?.name ?? 'Events';

  return (
    <section
      id="sentinel-list-stage"
      data-testid="list-stage"
      // Skip-link target in list mode (T3.10): focusable so in-page
      // navigation moves focus here instead of the document body.
      tabIndex={-1}
      aria-label={selectedEvent ? 'Event detail' : activeLayer ? `${title} events` : 'Event list'}
      className="intel-shell panel-enter pointer-events-auto absolute inset-0"
    >
      {/* Title row — same compact baseline as the data panel */}
      <div className="flex items-center justify-between gap-2 py-2 pl-4 pr-2">
        <div className="flex min-w-0 items-center gap-1">
          {selectedEvent && (
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onBackToLayer} aria-label="Back to layer view" className="h-7 w-7 rounded-[6px] text-white/60 hover:bg-white/10 hover:text-white">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="border-white/10 bg-sentinel-elev text-xs text-white">Back to layer (Esc)</TooltipContent>
            </Tooltip>
          )}
          <h2 className="sentinel-section-title truncate text-white">
            {selectedEvent ? 'Event detail' : title}
          </h2>
          {!selectedEvent && dataPoints.length > 0 && (
            <span className="sentinel-micro sentinel-mono text-white/45">
              {dataPoints.length}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {!selectedEvent && activeLayer && (
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onRefresh} aria-label="Refresh layer data" disabled={loading} className="h-7 w-7 rounded-[6px] text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-50">
                  <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="border-white/10 bg-sentinel-elev text-xs text-white">Refresh data</TooltipContent>
            </Tooltip>
          )}
          {(activeLayer || selectedEvent) && (
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel" className="h-7 w-7 rounded-[6px] text-white/60 hover:bg-white/10 hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="border-white/10 bg-sentinel-elev text-xs text-white">Close (Esc)</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="min-h-0 flex-1 border-t border-white/[0.07]">
        <div className="flex flex-col">
          {/* Provenance strip — always visible while data is shown */}
          {!selectedEvent && activeLayer && (
            <div className="intel-section">
              <DataStatusBanner status={dataStatus} cacheHit={cacheHit} error={error} />
            </div>
          )}

          {loading ? (
            <div className="intel-section space-y-2.5" role="status" aria-label="Loading layer data">
              <div className="flex items-center gap-2 text-xs text-white/40">
                <Radio className="h-3.5 w-3.5 animate-pulse text-sentinel-accent/70" aria-hidden /> Fetching {layerMeta?.name || 'layer'}…
              </div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2 border-t border-white/[0.06] pt-2.5 first:border-0 first:pt-0">
                  <Skeleton className="h-3.5 w-2/3 bg-white/[0.07]" />
                  <Skeleton className="h-3 w-1/3 bg-white/[0.05]" />
                </div>
              ))}
            </div>
          ) : error && !selectedEvent ? (
            <div className="intel-section">
              <Alert variant="destructive" className="border-red-400/25 bg-red-500/[0.07] text-white">
                <AlertCircle className="h-4 w-4 text-red-300" />
                <AlertTitle className="text-[13px] text-white">Couldn&apos;t load {layerMeta?.name || 'layer'} data</AlertTitle>
                <AlertDescription className="text-xs text-white/50">{error}</AlertDescription>
                <Button onClick={onRefresh} size="sm" variant="outline" className="mt-2 border-white/15 bg-white/5 text-white hover:bg-white/10">
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </Button>
              </Alert>
            </div>
          ) : selectedEvent ? (
            <EventDetails
              point={selectedEvent}
              detail={eventDetail}
              loading={eventDetailLoading}
              activeLayer={activeLayer}
              dataStatus={dataStatus}
            />
          ) : !activeLayer ? (
            <div className="intel-section">
              <p className="text-[12px] leading-relaxed text-white/50">
                Select a layer from the rail to see its observations here.
              </p>
            </div>
          ) : (
            <LayerOverview
              activeLayer={activeLayer}
              layerMeta={layerMeta}
              dataPoints={dataPoints}
              onEventSelect={onEventSelect}
              filter={severityFilter}
              onFilterChange={onSeverityChange}
            />
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
