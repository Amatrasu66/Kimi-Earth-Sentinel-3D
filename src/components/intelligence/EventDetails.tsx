import { TrendingUp, Clock, MapPin } from 'lucide-react';
import DataStatusBanner from '@/components/overlays/DataStatusBanner';
import SeverityBadge from '@/components/intelligence/SeverityBadge';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { eventTitleForPoint, formatPointValue, formatRelativeTime, metricLabelForLayer } from '@/lib/format';
import type { DataPoint, DataStatus, EventDetail, LayerId } from '@/types';

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
        <div className="intel-section">
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
                <Badge key={cat} variant="secondary" className="rounded-[5px] border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-normal text-white/60">
                  {cat}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {detail.sources && detail.sources.length > 0 && (
        <div className="intel-section">
          <div className="sentinel-label mb-1">Sources</div>
          {detail.sources.map((s) => (
            <div key={s.id} className="py-0.5 text-xs">
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sentinel-accent/90 hover:text-sentinel-accent hover:underline"
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

/** Progressive-disclosure event detail: identity → facts → provider → impact. */
export default function EventDetails({
  point,
  detail,
  loading,
  activeLayer,
  dataStatus,
}: {
  point: DataPoint;
  detail: EventDetail | null;
  loading: boolean;
  activeLayer: LayerId | null;
  dataStatus: DataStatus | null;
}) {
  const facts: Array<{ label: string; value: string; icon: React.ReactNode }> = [];
  if (point.magnitude !== undefined) facts.push({ label: 'Magnitude', value: String(point.magnitude), icon: <TrendingUp className="h-3.5 w-3.5 text-sentinel-accent" aria-hidden /> });
  if (point.value !== undefined) facts.push({ label: metricLabelForLayer(activeLayer), value: String(formatPointValue(point, activeLayer) ?? point.value), icon: <TrendingUp className="h-3.5 w-3.5 text-sentinel-accent" aria-hidden /> });
  if (point.depth !== undefined) facts.push({ label: 'Depth', value: `${point.depth} km`, icon: <MapPin className="h-3.5 w-3.5 text-sentinel-accent" aria-hidden /> });
  facts.push({ label: 'Time', value: point.timestamp ? formatRelativeTime(point.timestamp) : 'N/A', icon: <Clock className="h-3.5 w-3.5 text-sentinel-accent" aria-hidden /> });

  return (
    <>
      <div className="intel-section">
        <h3 className="text-balance text-[15px] font-semibold leading-snug text-white">{eventTitleForPoint(point, activeLayer)}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={point.severity} />
          <span className="sentinel-micro">{point.type || activeLayer}</span>
          {point.timestamp && (
            <span className="sentinel-micro sentinel-mono" title={point.timestamp}>
              · {formatRelativeTime(point.timestamp)}
            </span>
          )}
        </div>
      </div>

      {/* Provenance travels with the detail view: live provider
          records must never be visually identical to fallbacks. */}
      <div className="intel-section">
        <DataStatusBanner status={detail?.data_status ?? dataStatus} compact />
      </div>

      {loading ? (
        <div className="intel-section space-y-2.5" role="status" aria-label="Loading event details">
          <Skeleton className="h-[76px] rounded-[7px] bg-white/[0.06]" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-[64px] rounded-[7px] bg-white/[0.05]" />
            <Skeleton className="h-[64px] rounded-[7px] bg-white/[0.05]" />
          </div>
          <Skeleton className="h-[88px] rounded-[7px] bg-white/[0.05]" />
        </div>
      ) : (
        <>
          <div className="intel-section">
            <div className="grid grid-cols-2 gap-x-4">
              {facts.map((fact) => (
                <div key={fact.label} className="min-w-0 py-1">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    {fact.icon}
                    <span className="sentinel-micro truncate">{fact.label}</span>
                  </div>
                  <div className="sentinel-mono truncate text-[17px] font-semibold tracking-tight text-white">{fact.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="intel-section">
            <div className="mb-1 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-white/40" aria-hidden />
              <span className="sentinel-label">Location</span>
            </div>
            <div className="text-[13px] text-white">
              {point.location || `${point.lat.toFixed(2)}, ${point.lon.toFixed(2)}`}
            </div>
            <div className="sentinel-micro sentinel-mono mt-1">
              {point.lat.toFixed(4)}, {point.lon.toFixed(4)}
            </div>
          </div>

          {detail?.description && (
            <div className="intel-section">
              <div className="sentinel-label mb-1">Description</div>
              <p className="text-[13px] leading-relaxed text-white/70">{detail.description}</p>
            </div>
          )}

          {/* Attribution is independent of description: live provider
              records (e.g. USGS) often carry no description text. */}
          {detail?.source && (
            <div className="intel-section">
              <span className="sentinel-micro">Source: </span>
              {detail.source.url ? (
                <a
                  href={detail.source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs text-sentinel-accent/90 hover:text-sentinel-accent hover:underline"
                >
                  {detail.source.name} ↗
                </a>
              ) : (
                <span className="text-xs text-white/70">{detail.source.name}</span>
              )}
            </div>
          )}

          {detail && !loading && (
            <EventLiveDetails
              detail={detail}
              showMagnitude={point.magnitude === undefined && point.value === undefined}
            />
          )}

          {detail?.impact && (
            <div className="intel-section">
              <div className="mb-1 text-xs font-semibold text-orange-300">Impact assessment</div>
              {Object.entries(detail.impact).map(([key, value]) => (
                <div key={key} className="flex justify-between border-t border-white/[0.06] py-1 text-sm first:border-0">
                  <span className="capitalize text-white/40">{key.replace(/_/g, ' ')}</span>
                  <span className="text-white">{String(value)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
