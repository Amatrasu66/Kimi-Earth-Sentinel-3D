import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import MetricRow from '@/components/intelligence/MetricRow';
import SeverityFilter from '@/components/intelligence/SeverityFilter';
import type { SeverityFilterValue } from '@/components/intelligence/SeverityFilter';
import SeverityDistribution from '@/components/intelligence/SeverityDistribution';
import EventList from '@/components/intelligence/EventList';
import { Skeleton } from '@/components/ui/skeleton';
import type { DataPoint, LayerId, LayerMetadata } from '@/types';

// Code-split: visx + motion (~80 kB) load only when a layer panel with
// numeric data opens — never in the initial globe route chunk. SVG output
// is client-safe; the skeleton preserves panel layout while loading.
const ValueHistogram = dynamic(() => import('@/components/charts/ValueHistogram'), {
  ssr: false,
  loading: () => <Skeleton className="h-[118px] rounded-[7px] bg-white/[0.05]" />,
});

function LayerLegend({ layerMeta }: { layerMeta: LayerMetadata }) {
  if (!layerMeta.color_scale || layerMeta.color_scale.length === 0) return null;
  return (
    <div>
      <div className="sentinel-label mb-2">
        Severity scale{layerMeta.unit ? ` · ${layerMeta.unit}` : ''}
      </div>
      <div className="flex h-1 overflow-hidden rounded-full" aria-hidden>
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
 * Flat section stack separated by hairlines. The severity filter is
 * app-owned (T3.3 URL state) and arrives via props — this component holds
 * no filter state of its own.
 */
export default function LayerOverview({
  activeLayer,
  layerMeta,
  dataPoints,
  onEventSelect,
  filter,
  onFilterChange,
}: {
  activeLayer: LayerId | null;
  layerMeta: LayerMetadata | null;
  dataPoints: DataPoint[];
  onEventSelect: (point: DataPoint) => void;
  filter: SeverityFilterValue;
  onFilterChange: (next: SeverityFilterValue) => void;
}) {
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
      {layerMeta && (
        <div className="intel-section">
          <p className="text-[12px] leading-relaxed text-white/50">{layerMeta.description}</p>
        </div>
      )}

      {layerMeta?.color_scale && layerMeta.color_scale.length > 0 && (
        <div className="intel-section">
          <LayerLegend layerMeta={layerMeta} />
        </div>
      )}

      {dataPoints.length > 0 && (
        <div className="intel-section">
          <MetricRow
            items={[
              { label: 'Events', value: dataPoints.length },
              { label: 'Critical', value: severityCounts['critical'] || 0, accent: (severityCounts['critical'] || 0) > 0 },
            ]}
          />
        </div>
      )}

      {dataPoints.length > 0 && (
        <div className="intel-section">
          <SeverityDistribution counts={severityCounts} total={dataPoints.length} />
        </div>
      )}

      {dataPoints.length > 0 && (
        <div className="intel-section">
          <ValueHistogram points={dataPoints} activeLayer={activeLayer} />
        </div>
      )}

      {dataPoints.length > 0 && (
        <div className="intel-section">
          <SeverityFilter counts={severityCounts} total={dataPoints.length} value={filter} onChange={onFilterChange} />
        </div>
      )}

      <div className="intel-section">
        <EventList
          points={filteredPoints}
          totalCount={filteredPoints.length}
          activeLayer={activeLayer}
          hasData={dataPoints.length > 0}
          onEventSelect={onEventSelect}
        />
      </div>
    </>
  );
}
