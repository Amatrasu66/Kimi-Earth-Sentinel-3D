import { useState } from 'react';
import { X, TrendingUp, AlertCircle, Clock, MapPin, RefreshCw, ChevronLeft } from 'lucide-react';
import DataStatusBanner from '@/components/overlays/DataStatusBanner';
import { formatPointValue, formatRelativeTime, metricLabelForLayer } from '@/lib/format';
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
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-white/40 text-xs">{label}</span>
      </div>
      <div className="text-white font-mono text-lg font-medium">{value}</div>
    </div>
  );
}

function LayerLegend({ layerMeta }: { layerMeta: LayerMetadata }) {
  if (!layerMeta.color_scale || layerMeta.color_scale.length === 0) return null;
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="text-white/40 text-xs mb-2">
        Severity scale{layerMeta.unit ? ` · unit: ${layerMeta.unit}` : ''}
      </div>
      <div className="flex h-2 rounded-full overflow-hidden" aria-hidden>
        {layerMeta.color_scale.map((color) => (
          <div key={color} className="flex-1" style={{ background: color }} />
        ))}
      </div>
      <div className="flex justify-between text-white/30 text-[10px] mt-1">
        <span>Low</span>
        <span>Critical</span>
      </div>
    </div>
  );
}

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
      aria-label={selectedEvent ? 'Event detail' : 'Layer data'}
      className="fixed right-4 top-20 bottom-20 z-50 rounded-2xl overflow-hidden flex flex-col max-w-[calc(100vw-2rem)]"
      style={{
        width: 360,
        background: 'rgba(15, 15, 20, 0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          {selectedEvent && (
            <button
              onClick={onBackToLayer}
              aria-label="Back to layer view"
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-[#FFC31F]"
            >
              <ChevronLeft className="w-4 h-4 text-white/60" />
            </button>
          )}
          <h2 className="text-white font-medium text-sm" style={{ fontFamily: 'Instrument Sans, sans-serif' }}>
            {selectedEvent ? 'Event Detail' : layerMeta?.name || 'Data'}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {!selectedEvent && (
            <button
              onClick={onRefresh}
              aria-label="Refresh layer data"
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-[#FFC31F]"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 text-white/60 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-[#FFC31F]"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.3) rgba(255,255,255,0.1)' }}
      >
        {/* Provenance is always visible while data is shown */}
        {!selectedEvent && <DataStatusBanner status={dataStatus} />}

        {loading ? (
          <div className="space-y-3" role="status" aria-label="Loading layer data">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
            ))}
          </div>
        ) : error && !selectedEvent ? (
          <div
            className="rounded-xl p-4 text-center space-y-3"
            role="alert"
            style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)' }}
          >
            <AlertCircle className="w-6 h-6 text-red-400 mx-auto" />
            <p className="text-white/70 text-sm">Couldn&apos;t load {layerMeta?.name || 'layer'} data.</p>
            <p className="text-white/40 text-xs">{error}</p>
            <button
              onClick={onRefresh}
              className="px-4 py-1.5 rounded-lg text-sm text-white bg-white/10 hover:bg-white/15 transition-colors focus-visible:outline-2 focus-visible:outline-[#FFC31F]"
            >
              Retry
            </button>
          </div>
        ) : selectedEvent ? (
          /* Event Detail View */
          <div className="space-y-4">
            <div>
              <h3 className="text-white text-lg font-medium">{getEventTitle(selectedEvent, activeLayer)}</h3>
              <div className="flex items-center gap-2 mt-1">
                <SeverityBadge severity={selectedEvent.severity} />
                <span className="text-white/40 text-xs">{selectedEvent.type || activeLayer}</span>
              </div>
            </div>

            {eventDetailLoading ? (
              <div className="space-y-3" role="status" aria-label="Loading event details">
                <div className="h-20 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
                <div className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {selectedEvent.magnitude !== undefined && (
                    <StatCard label="Magnitude" value={selectedEvent.magnitude} icon={<TrendingUp className="w-3.5 h-3.5 text-[#FFC31F]" />} />
                  )}
                  {selectedEvent.value !== undefined && (
                    <StatCard
                      label={metricLabelForLayer(activeLayer)}
                      value={formatPointValue(selectedEvent, activeLayer) ?? selectedEvent.value}
                      icon={<TrendingUp className="w-3.5 h-3.5 text-[#FFC31F]" />}
                    />
                  )}
                  {selectedEvent.depth !== undefined && (
                    <StatCard label="Depth" value={`${selectedEvent.depth} km`} icon={<MapPin className="w-3.5 h-3.5 text-[#FFC31F]" />} />
                  )}
                  <StatCard
                    label="Time"
                    value={selectedEvent.timestamp ? formatRelativeTime(selectedEvent.timestamp) : 'N/A'}
                    icon={<Clock className="w-3.5 h-3.5 text-[#FFC31F]" />}
                  />
                </div>

                <div
                  className="rounded-xl p-3"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4 text-white/40" />
                    <span className="text-white/40 text-xs">Location</span>
                  </div>
                  <div className="text-white text-sm">
                    {selectedEvent.location || `${selectedEvent.lat.toFixed(2)}, ${selectedEvent.lon.toFixed(2)}`}
                  </div>
                  <div className="text-white/30 text-xs font-mono mt-1">
                    {selectedEvent.lat.toFixed(4)}, {selectedEvent.lon.toFixed(4)}
                  </div>
                </div>

                {eventDetail?.description && (
                  <div
                    className="rounded-xl p-3"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-white/40" />
                      <span className="text-white/40 text-xs">Description</span>
                    </div>
                    <p className="text-white/70 text-sm leading-relaxed">{eventDetail.description}</p>
                    {eventDetail.source && (
                      <p className="text-white/30 text-xs mt-2">Source: {eventDetail.source.name}</p>
                    )}
                  </div>
                )}

                {eventDetail?.impact && (
                  <div
                    className="rounded-xl p-3"
                    style={{ background: 'rgba(255,69,0,0.05)', border: '1px solid rgba(255,69,0,0.15)' }}
                  >
                    <div className="text-orange-400 text-xs font-medium mb-2">Impact Assessment</div>
                    {Object.entries(eventDetail.impact).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm py-1">
                        <span className="text-white/40 capitalize">{key.replace(/_/g, ' ')}</span>
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
            {layerMeta && <p className="text-white/50 text-xs leading-relaxed">{layerMeta.description}</p>}

            {layerMeta && <LayerLegend layerMeta={layerMeta} />}

            {/* Stats */}
            {dataPoints.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <StatCard label="Total Events" value={dataPoints.length} icon={<TrendingUp className="w-3.5 h-3.5 text-[#FFC31F]" />} />
                <StatCard
                  label="Critical"
                  value={severityCounts['critical'] || 0}
                  icon={<AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                />
              </div>
            )}

            {/* Severity Filter */}
            {dataPoints.length > 0 && (
              <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by severity">
                {(['all', 'critical', 'high', 'moderate', 'low'] as const).map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setFilter(sev)}
                    aria-pressed={filter === sev}
                    className="px-3 py-1 rounded-lg text-xs transition-all capitalize focus-visible:outline-2 focus-visible:outline-[#FFC31F]"
                    style={{
                      background: filter === sev ? 'rgba(255,195,31,0.15)' : 'rgba(255,255,255,0.03)',
                      color: filter === sev ? '#FFC31F' : 'rgba(255,255,255,0.4)',
                      border: filter === sev ? '1px solid rgba(255,195,31,0.3)' : '1px solid transparent',
                    }}
                  >
                    {sev} {sev !== 'all' ? `(${severityCounts[sev] || 0})` : `(${dataPoints.length})`}
                  </button>
                ))}
              </div>
            )}

            {/* Events List */}
            <div className="space-y-2">
              {filteredPoints.slice(0, 50).map((point) => (
                <button
                  key={point.id}
                  onClick={() => onEventSelect(point)}
                  className="w-full text-left rounded-xl p-3 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#FFC31F]"
                  style={{ border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white text-sm truncate flex-1">{getEventTitle(point, activeLayer)}</span>
                    <SeverityBadge severity={point.severity} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/30">
                    <span>{point.location || `${point.lat.toFixed(1)}, ${point.lon.toFixed(1)}`}</span>
                    {point.magnitude !== undefined && <span>M{point.magnitude}</span>}
                    {point.value !== undefined && <span>{formatPointValue(point, activeLayer)}</span>}
                  </div>
                </button>
              ))}

              {filteredPoints.length === 0 && (
                <div className="text-center py-8 text-white/30 text-sm">
                  {dataPoints.length === 0 ? 'No events available for this layer right now.' : 'No events match the selected filter'}
                </div>
              )}

              {filteredPoints.length > 50 && (
                <div className="text-center py-2 text-white/30 text-xs">Showing 50 of {filteredPoints.length} events</div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
