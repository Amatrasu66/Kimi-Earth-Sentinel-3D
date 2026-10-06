import { SearchX } from 'lucide-react';
import SeverityBadge from '@/components/intelligence/SeverityBadge';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { eventTitleForPoint, formatPointValue } from '@/lib/format';
import type { DataPoint, LayerId } from '@/types';

const LIST_LIMIT = 50;

/**
 * Scannable event list — the complete keyboard-accessible alternative to
 * globe-marker interaction. Never paginated beyond a stated cap.
 */
export default function EventList({
  points,
  totalCount,
  activeLayer,
  hasData,
  onEventSelect,
}: {
  points: DataPoint[];
  totalCount: number;
  activeLayer: LayerId | null;
  hasData: boolean;
  onEventSelect: (point: DataPoint) => void;
}) {
  return (
    <div className="space-y-1.5">
      {points.slice(0, LIST_LIMIT).map((point) => (
        <button
          key={point.id}
          onClick={() => onEventSelect(point)}
          className="sentinel-spot w-full rounded-lg border border-white/[0.05] bg-white/[0.015] p-2.5 text-left transition-colors duration-150 hover:border-white/[0.12] hover:bg-white/[0.05]"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="flex-1 truncate text-[13px] font-medium text-white">{eventTitleForPoint(point, activeLayer)}</span>
            <SeverityBadge severity={point.severity} />
          </div>
          <div className="sentinel-micro flex items-center gap-2.5">
            <span className="truncate">{point.location || `${point.lat.toFixed(1)}, ${point.lon.toFixed(1)}`}</span>
            {point.magnitude !== undefined && <span className="sentinel-mono shrink-0">M{point.magnitude}</span>}
            {point.value !== undefined && <span className="sentinel-mono shrink-0">{formatPointValue(point, activeLayer)}</span>}
          </div>
        </button>
      ))}

      {points.length === 0 && (
        <Empty className="border-white/[0.07] bg-transparent py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="border-white/10 bg-white/5 text-white/40">
              <SearchX className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle className="text-sm text-white/80">
              {!hasData ? 'No events right now' : 'No matching events'}
            </EmptyTitle>
            <EmptyDescription className="text-xs text-white/40">
              {!hasData
                ? 'No events available for this layer right now.'
                : 'No events match the selected severity filter.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {points.length > LIST_LIMIT && (
        <div className="sentinel-micro sentinel-mono py-1 text-center">Showing {LIST_LIMIT} of {totalCount} events</div>
      )}
    </div>
  );
}
