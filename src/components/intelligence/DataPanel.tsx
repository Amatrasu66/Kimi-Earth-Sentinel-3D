import { X, AlertCircle, RefreshCw, ChevronLeft, Radio } from 'lucide-react';
import DataStatusBanner from '@/components/overlays/DataStatusBanner';
import LayerOverview from '@/components/intelligence/LayerOverview';
import EventDetails from '@/components/intelligence/EventDetails';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { DataPoint, DataStatus, EventDetail, LayerId, LayerMetadata } from '@/types';

interface DataPanelProps {
  activeLayer: LayerId | null;
  layerMeta: LayerMetadata | null;
  dataPoints: DataPoint[];
  selectedEvent: DataPoint | null;
  eventDetail: EventDetail | null;
  eventDetailLoading: boolean;
  loading: boolean;
  error: string | null;
  dataStatus: DataStatus | null;
  onClose: () => void;
  onBackToLayer: () => void;
  onEventSelect: (point: DataPoint) => void;
  onRefresh: () => void;
}

/**
 * Intelligence surface orchestrator: header, provenance, and view switching.
 * Layer content lives in LayerOverview, event content in EventDetails —
 * this shell owns loading/error states and panel chrome only.
 */
export default function DataPanel({
  activeLayer,
  layerMeta,
  dataPoints,
  selectedEvent,
  eventDetail,
  eventDetailLoading,
  loading,
  error,
  dataStatus,
  onClose,
  onBackToLayer,
  onEventSelect,
  onRefresh,
}: DataPanelProps) {
  if (!activeLayer && !selectedEvent) return null;

  return (
    <section
      id="sentinel-data-panel"
      aria-label={selectedEvent ? 'Event detail' : 'Layer data'}
      className="sentinel-panel panel-enter fixed z-50 flex flex-col overflow-hidden rounded-xl
        left-3 right-3 bottom-[120px] top-auto max-h-[44vh]
        md:left-auto md:right-4 md:top-[68px] md:bottom-[68px] md:max-h-none md:w-[360px] md:max-w-[calc(100vw-2rem)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {selectedEvent && (
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onBackToLayer} aria-label="Back to layer view" className="h-7 w-7 rounded-md text-white/60 hover:bg-white/10 hover:text-white">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="border-white/10 bg-sentinel-elev text-xs text-white">Back to layer (Esc)</TooltipContent>
            </Tooltip>
          )}
          <h2 className="sentinel-panel-title truncate text-white">
            {selectedEvent ? 'Event Detail' : layerMeta?.name || 'Data'}
          </h2>
          {!selectedEvent && dataPoints.length > 0 && (
            <Badge variant="secondary" className="sentinel-mono border-white/10 bg-white/5 text-[11px] text-white/60">
              {dataPoints.length}
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!selectedEvent && (
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onRefresh} aria-label="Refresh layer data" disabled={loading} className="h-7 w-7 rounded-md text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-50">
                  <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="border-white/10 bg-sentinel-elev text-xs text-white">Refresh data</TooltipContent>
            </Tooltip>
          )}
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel" className="h-7 w-7 rounded-md text-white/60 hover:bg-white/10 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="border-white/10 bg-sentinel-elev text-xs text-white">Close (Esc)</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {/* Provenance is always visible while data is shown */}
          {!selectedEvent && <DataStatusBanner status={dataStatus} />}

          {loading ? (
            <div className="space-y-2.5" role="status" aria-label="Loading layer data">
              <div className="flex items-center gap-2 text-xs text-white/40">
                <Radio className="h-3.5 w-3.5 animate-pulse text-sentinel-accent/70" aria-hidden /> Fetching {layerMeta?.name || 'layer'}…
              </div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
                  <Skeleton className="h-3.5 w-2/3 bg-white/[0.07]" />
                  <Skeleton className="h-3 w-1/3 bg-white/[0.05]" />
                </div>
              ))}
            </div>
          ) : error && !selectedEvent ? (
            <Alert variant="destructive" className="border-red-400/25 bg-red-500/[0.07] text-white">
              <AlertCircle className="h-4 w-4 text-red-300" />
              <AlertTitle className="text-[13px] text-white">Couldn&apos;t load {layerMeta?.name || 'layer'} data</AlertTitle>
              <AlertDescription className="text-xs text-white/50">{error}</AlertDescription>
              <Button onClick={onRefresh} size="sm" variant="outline" className="mt-2 border-white/15 bg-white/5 text-white hover:bg-white/10">
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </Alert>
          ) : selectedEvent ? (
            <EventDetails
              point={selectedEvent}
              detail={eventDetail}
              loading={eventDetailLoading}
              activeLayer={activeLayer}
              dataStatus={dataStatus}
            />
          ) : (
            <LayerOverview
              activeLayer={activeLayer}
              layerMeta={layerMeta}
              dataPoints={dataPoints}
              onEventSelect={onEventSelect}
            />
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
