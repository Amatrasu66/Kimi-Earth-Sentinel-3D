import { useMemo, useState } from 'react';
import { Satellite, AlertCircle } from 'lucide-react';
import MetricCard from '@/components/intelligence/MetricCard';
import SeverityFilter from '@/components/intelligence/SeverityFilter';
import SeverityDistribution from '@/components/intelligence/SeverityDistribution';
import EventList from '@/components/intelligence/EventList';
import ValueHistogram from '@/components/charts/ValueHistogram';
import type { DataPoint, LayerId, LayerMetadata } from '@/types';

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

/**
 * Layer identity → key metrics → severity distribution → filter → event list.
 * Owns the severity filter; the orchestrator owns loading/error/provenance.
 */
export default function LayerOverview({
  activeLayer,
  layerMeta,
  dataPoints,
  onEventSelect,
}: {
  activeLayer: LayerId | null;
  layerMeta: LayerMetadata | null;
  dataPoints: DataPoint[];
  onEventSelect: (point: DataPoint) => void;
}) {
  const [filter, setFilter] = useState<string>('all');

  const filteredPoints = filter === 'all' ? dataPoints : dataPoints.filter((p) => p.severity === filter);

  const severityCounts = useMemo(
    () =>
      dataPoints.reduce(
        (acc, p) => {
          acc[p.severity] = (acc[p.severity] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    [dataPoints],
  );

  return (
    <>
      {layerMeta && <p className="sentinel-body text-[12px] leading-relaxed text-white/50">{layerMeta.description}</p>}

      {layerMeta && <LayerLegend layerMeta={layerMeta} />}

      {dataPoints.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Total Events" value={dataPoints.length} icon={<Satellite className="h-3.5 w-3.5 text-sentinel-accent" />} />
          <MetricCard
            label="Critical"
            value={severityCounts['critical'] || 0}
            icon={<AlertCircle className="h-3.5 w-3.5 text-red-400" />}
          />
        </div>
      )}

      {dataPoints.length > 0 && <SeverityDistribution counts={severityCounts} total={dataPoints.length} />}

      {dataPoints.length > 0 && <ValueHistogram points={dataPoints} activeLayer={activeLayer} />}

      {dataPoints.length > 0 && (
        <SeverityFilter counts={severityCounts} total={dataPoints.length} value={filter} onChange={setFilter} />
      )}

      <EventList
        points={filteredPoints}
        totalCount={filteredPoints.length}
        activeLayer={activeLayer}
        hasData={dataPoints.length > 0}
        onEventSelect={onEventSelect}
      />
    </>
  );
}
