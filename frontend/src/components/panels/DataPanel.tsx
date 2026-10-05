import { useState } from 'react';
import { X, TrendingUp, AlertCircle, Clock, MapPin, RefreshCw, ChevronLeft, Satellite, SearchX, Radio } from 'lucide-react';
import DataStatusBanner from '@/components/overlays/DataStatusBanner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatPointValue, formatRelativeTime, metricLabelForLayer } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DataPoint, DataStatus, EventDetail, LayerId, LayerMetadata } from '@/types';
import { SEVERITY_COLORS } from '@/types';

// Helper to generate display title for events
function getEventTitle(point: DataPoint, layerId: string | null): string {
  if (point.title) return point.title;

  if (layerId === 'earthquakes' && point.magnitude !== undefined) {
    return `M${point.magnitude} - ${point.location || 'Unknown location'}`;
  }

  if (layerId === 'wildfires' && point.value !== undefined) {
    return `Fire (brightness: ${point.value}) - ${point.location || 'Unknown'}`;
  }

  if (layerId === 'air_quality' && point.value !== undefined) {
    return `AQI ${point.value} - ${point.location || 'Unknown'}`;
  }

  return point.location || `${layerId || 'Event'} at ${point.lat.toFixed(1)}, ${point.lon.toFixed(1)}`;
}

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

function SeverityBadge({ severity }: { severity: string }) {
  const color = SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] || '#FFC31F';
  return (
    <Badge
      variant="outline"
      className="gap-1 px-2 py-0.5 text-[11px] font-semibold capitalize"
      style={{ background: `${color}14`, color, borderColor: `${color}45` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {severity}
    </Badge>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="sentinel-inset rounded-lg p-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <span className="sentinel-micro">{label}</span>
      </div>
      <div className="sentinel-mono text-[15px] font-semibold text-white">{value}</div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="sentinel-micro flex-shrink-0">{label}</span>
      <span className="text-right text-xs text-white/85">{children}</span>
    </div>
  );
}

/**
 * Live provider fields for one event. Only renders fields the provider
 * actually supplied — no "N/A" placeholders. Marker-level facts
 * (magnitude/depth/time/location) already appear above from the point.
 */
function EventLiveDetails({ detail, showMagnitude }: { detail: EventDetail; showMagnitude: boolean }) {
  const hasRows =
    (showMagnitude && detail.magnitude != null) ||
    detail.updated_at ||
    detail.felt != null ||
    detail.alert ||
    detail.tsunami != null ||
    detail.significance != null ||
    detail.status ||
    (detail.categories && detail.categories.length > 0);

  return (
    <>
      {hasRows && (
        <div className="sentinel-inset rounded-lg p-3">
          <div className="sentinel-label mb-1">Provider details</div>
          {showMagnitude && detail.magnitude != null && (
            <DetailRow label="Magnitude">
              M{detail.magnitude}
              {detail.magnitude_unit ? ` (${detail.magnitude_unit})` : ''}
            </DetailRow>
          )}
          {detail.updated_at && (
            <DetailRow label="Updated">
              <span title={detail.updated_at}>{formatRelativeTime(detail.updated_at)}</span>
            </DetailRow>
          )}
          {detail.felt != null && <DetailRow label="Felt reports">{detail.felt}</DetailRow>}
          {detail.alert && <DetailRow label="Alert">{detail.alert.toUpperCase()}</DetailRow>}
          {detail.tsunami != null && <DetailRow label="Tsunami">{detail.tsunami ? 'Yes' : 'No'}</DetailRow>}
          {detail.significance != null && <DetailRow label="Significance">{detail.significance}</DetailRow>}
          {detail.status && (
            <DetailRow label="Status">
              {detail.status}
              {detail.closed_at ? ` · closed ${formatRelativeTime(detail.closed_at)}` : ''}
            </DetailRow>
          )}
          {detail.categories && detail.categories.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {detail.categories.map((cat) => (
                <Badge key={cat} variant="secondary" className="border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-normal text-white/60">
                  {cat}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {detail.sources && detail.sources.length > 0 && (
        <div className="sentinel-inset rounded-lg p-3">
          <div className="sentinel-label mb-1">Sources</div>
          {detail.sources.map((s) => (
            <div key={s.id} className="py-0.5 text-xs">
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[#FFC31F]/90 hover:text-[#FFC31F] hover:underline"
                >
                  {s.id} ↗
                </a>
              ) : (
                <span className="text-white/60">{s.id}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function LayerLegend({ layerMeta }: { layerMeta: LayerMetadata }) {
  if (!layerMeta.color_scale || layerMeta.color_scale.length === 0) return null;
  return (
    <div className="sentinel-inset rounded-lg p-3">
      <div className="sentinel-micro mb-2">
        Severity scale{layerMeta.unit ? ` · unit: ${layerMeta.unit}` : ''}
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full" aria-hidden>
        {layerMeta.color_scale.map((color) => (
          <div key={color} className="flex-1" style={{ background: color }} />
        ))}
      </div>
      <div className="sentinel-micro mt-1 flex justify-between">
        <span>Low</span>
        <span>Critical</span>
      </div>
    </div>
  );
}

const SEVERITY_FILTERS = ['all', 'critical', 'high', 'moderate', 'low'] as const;

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
  const [filter, setFilter] = useState<string>('all');

  if (!activeLayer && !selectedEvent) return null;

  const filteredPoints = filter === 'all' ? dataPoints : dataPoints.filter((p) => p.severity === filter);

  const severityCounts = dataPoints.reduce(
    (acc, p) => {
      acc[p.severity] = (acc[p.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

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
              <TooltipContent side="bottom" className="border-white/10 bg-[#14171d] text-xs text-white">Back to layer (Esc)</TooltipContent>
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
              <TooltipContent side="bottom" className="border-white/10 bg-[#14171d] text-xs text-white">Refresh data</TooltipContent>
            </Tooltip>
          )}
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel" className="h-7 w-7 rounded-md text-white/60 hover:bg-white/10 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="border-white/10 bg-[#14171d] text-xs text-white">Close (Esc)</TooltipContent>
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
                <Radio className="h-3.5 w-3.5 animate-pulse text-[#FFC31F]/70" aria-hidden /> Fetching {layerMeta?.name || 'layer'}…
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
            /* Event Detail View */
            <div className="space-y-3">
              <div>
                <h3 className="text-balance text-[15px] font-semibold leading-snug text-white">{getEventTitle(selectedEvent, activeLayer)}</h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={selectedEvent.severity} />
                  <span className="sentinel-micro">{selectedEvent.type || activeLayer}</span>
                  {selectedEvent.timestamp && (
                    <span className="sentinel-micro sentinel-mono" title={selectedEvent.timestamp}>
                      · {formatRelativeTime(selectedEvent.timestamp)}
                    </span>
                  )}
                </div>
              </div>

              {/* Provenance travels with the detail view: live provider
                  records must never be visually identical to fallbacks. */}
              <DataStatusBanner status={eventDetail?.data_status ?? dataStatus} compact />

              {eventDetailLoading ? (
                <div className="space-y-2.5" role="status" aria-label="Loading event details">
                  <Skeleton className="h-[76px] rounded-lg bg-white/[0.06]" />
                  <div className="grid grid-cols-2 gap-2">
                    <Skeleton className="h-[64px] rounded-lg bg-white/[0.05]" />
                    <Skeleton className="h-[64px] rounded-lg bg-white/[0.05]" />
                  </div>
                  <Skeleton className="h-[88px] rounded-lg bg-white/[0.05]" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedEvent.magnitude !== undefined && (
                      <StatCard label="Magnitude" value={selectedEvent.magnitude} icon={<TrendingUp className="h-3.5 w-3.5 text-[#FFC31F]" />} />
                    )}
                    {selectedEvent.value !== undefined && (
                      <StatCard
                        label={metricLabelForLayer(activeLayer)}
                        value={formatPointValue(selectedEvent, activeLayer) ?? selectedEvent.value}
                        icon={<TrendingUp className="h-3.5 w-3.5 text-[#FFC31F]" />}
                      />
                    )}
                    {selectedEvent.depth !== undefined && (
                      <StatCard label="Depth" value={`${selectedEvent.depth} km`} icon={<MapPin className="h-3.5 w-3.5 text-[#FFC31F]" />} />
                    )}
                    <StatCard
                      label="Time"
                      value={selectedEvent.timestamp ? formatRelativeTime(selectedEvent.timestamp) : 'N/A'}
                      icon={<Clock className="h-3.5 w-3.5 text-[#FFC31F]" />}
                    />
                  </div>

                  <div className="sentinel-inset rounded-lg p-3">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-white/40" aria-hidden />
                      <span className="sentinel-label">Location</span>
                    </div>
                    <div className="text-[13px] text-white">
                      {selectedEvent.location || `${selectedEvent.lat.toFixed(2)}, ${selectedEvent.lon.toFixed(2)}`}
                    </div>
                    <div className="sentinel-micro sentinel-mono mt-1">
                      {selectedEvent.lat.toFixed(4)}, {selectedEvent.lon.toFixed(4)}
                    </div>
                  </div>

                  {eventDetail?.description && (
                    <div className="sentinel-inset rounded-lg p-3">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 text-white/40" aria-hidden />
                        <span className="sentinel-label">Description</span>
                      </div>
                      <p className="sentinel-body text-white/70">{eventDetail.description}</p>
                    </div>
                  )}

                  {/* Attribution is independent of description: live provider
                      records (e.g. USGS) often carry no description text. */}
                  {eventDetail?.source && (
                    <div className="sentinel-inset rounded-lg px-3 py-2.5">
                      <span className="sentinel-micro">Source: </span>
                      {eventDetail.source.url ? (
                        <a
                          href={eventDetail.source.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-xs text-[#FFC31F]/90 hover:text-[#FFC31F] hover:underline"
                        >
                          {eventDetail.source.name} ↗
                        </a>
                      ) : (
                        <span className="text-xs text-white/70">{eventDetail.source.name}</span>
                      )}
                    </div>
                  )}

                  {eventDetail && !eventDetailLoading && (
                    <EventLiveDetails
                      detail={eventDetail}
                      showMagnitude={selectedEvent.magnitude === undefined && selectedEvent.value === undefined}
                    />
                  )}

                  {eventDetail?.impact && (
                    <div
                      className="rounded-lg p-3"
                      style={{ background: 'rgba(255,69,0,0.05)', border: '1px solid rgba(255,69,0,0.16)' }}
                    >
                      <div className="mb-1.5 text-xs font-semibold text-orange-300">Impact Assessment</div>
                      <Separator className="mb-1 bg-orange-400/10" />
                      {Object.entries(eventDetail.impact).map(([key, value]) => (
                        <div key={key} className="flex justify-between py-1 text-sm">
                          <span className="capitalize text-white/40">{key.replace(/_/g, ' ')}</span>
                          <span className="text-white">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            /* Layer Overview View */
            <>
              {layerMeta && <p className="sentinel-body text-[12px] leading-relaxed text-white/50">{layerMeta.description}</p>}

              {layerMeta && <LayerLegend layerMeta={layerMeta} />}

              {/* Stats */}
              {dataPoints.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Total Events" value={dataPoints.length} icon={<Satellite className="h-3.5 w-3.5 text-[#FFC31F]" />} />
                  <StatCard
                    label="Critical"
                    value={severityCounts['critical'] || 0}
                    icon={<AlertCircle className="h-3.5 w-3.5 text-red-400" />}
                  />
                </div>
              )}

              {/* Severity Filter */}
              {dataPoints.length > 0 && (
                <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by severity">
                  {SEVERITY_FILTERS.map((sev) => {
                    const count = sev === 'all' ? dataPoints.length : severityCounts[sev] || 0;
                    const pressed = filter === sev;
                    return (
                      <button
                        key={sev}
                        onClick={() => setFilter(sev)}
                        aria-pressed={pressed}
                        className={cn(
                          'sentinel-mono rounded-md px-2.5 py-1 text-[11px] capitalize transition-colors duration-150',
                          pressed
                            ? 'border border-[rgba(255,195,31,0.35)] bg-[rgba(255,195,31,0.14)] text-[#FFC31F]'
                            : 'border border-transparent bg-white/[0.04] text-white/40 hover:bg-white/[0.08] hover:text-white/75',
                        )}
                      >
                        {sev} {count}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Events List */}
              <div className="space-y-1.5">
                {filteredPoints.slice(0, 50).map((point) => (
                  <button
                    key={point.id}
                    onClick={() => onEventSelect(point)}
                    className="sentinel-spot w-full rounded-lg border border-white/[0.05] bg-white/[0.015] p-2.5 text-left transition-colors duration-150 hover:border-white/[0.12] hover:bg-white/[0.05]"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="flex-1 truncate text-[13px] font-medium text-white">{getEventTitle(point, activeLayer)}</span>
                      <SeverityBadge severity={point.severity} />
                    </div>
                    <div className="sentinel-micro flex items-center gap-2.5">
                      <span className="truncate">{point.location || `${point.lat.toFixed(1)}, ${point.lon.toFixed(1)}`}</span>
                      {point.magnitude !== undefined && <span className="sentinel-mono shrink-0">M{point.magnitude}</span>}
                      {point.value !== undefined && <span className="sentinel-mono shrink-0">{formatPointValue(point, activeLayer)}</span>}
                    </div>
                  </button>
                ))}

                {filteredPoints.length === 0 && (
                  <Empty className="border-white/[0.07] bg-transparent py-8">
                    <EmptyHeader>
                      <EmptyMedia variant="icon" className="border-white/10 bg-white/5 text-white/40">
                        <SearchX className="h-5 w-5" />
                      </EmptyMedia>
                      <EmptyTitle className="text-sm text-white/80">
                        {dataPoints.length === 0 ? 'No events right now' : 'No matching events'}
                      </EmptyTitle>
                      <EmptyDescription className="text-xs text-white/40">
                        {dataPoints.length === 0
                          ? 'No events available for this layer right now.'
                          : 'No events match the selected severity filter.'}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}

                {filteredPoints.length > 50 && (
                  <div className="sentinel-micro sentinel-mono py-1 text-center">Showing 50 of {filteredPoints.length} events</div>
                )}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
