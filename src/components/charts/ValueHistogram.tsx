import { useMemo } from 'react';
import { metricLabelForLayer, unitForLayer } from '@/lib/format';
import type { DataPoint, LayerId } from '@/types';

const BINS = 8;
const MIN_NUMERIC_POINTS = 5;

function numericOf(p: DataPoint): number | null {
  if (typeof p.magnitude === 'number' && Number.isFinite(p.magnitude)) return p.magnitude;
  if (typeof p.value === 'number' && Number.isFinite(p.value)) return p.value;
  return null;
}

/**
 * Zero-dependency value histogram computed from the current layer points —
 * honest current-state analysis, no fabricated history. Renders nothing when
 * the layer has no meaningful numeric spread.
 */
export default function ValueHistogram({
  points,
  activeLayer,
}: {
  points: DataPoint[];
  activeLayer: LayerId | null;
}) {
  const model = useMemo(() => {
    const values = points.map(numericOf).filter((v): v is number => v !== null);
    if (values.length < MIN_NUMERIC_POINTS) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (!(max > min)) return null;
    const width = (max - min) / BINS;
    const bins = new Array<number>(BINS).fill(0);
    for (const v of values) {
      const idx = Math.min(BINS - 1, Math.floor((v - min) / width));
      bins[idx] += 1;
    }
    return { bins, min, max, count: values.length };
  }, [points]);

  if (!model) return null;

  const peak = Math.max(...model.bins);
  const unit = unitForLayer(activeLayer);
  const label = metricLabelForLayer(activeLayer);
  const barW = 100 / BINS;

  return (
    <div
      className="sentinel-inset rounded-lg p-3"
      role="img"
      aria-label={`${label} spread across ${model.count} current points, ranging ${model.min} to ${model.max}${unit ? ` ${unit}` : ''}`}
    >
      <div className="sentinel-micro mb-2 flex items-baseline justify-between">
        <span>{label} spread</span>
        <span className="sentinel-mono">n={model.count}</span>
      </div>
      <svg viewBox={`0 0 100 ${34}`} className="block h-[68px] w-full" aria-hidden preserveAspectRatio="none">
        {model.bins.map((n, i) => {
          const h = peak === 0 ? 0 : (n / peak) * 28;
          return (
            <rect
              key={i}
              x={i * barW + 0.75}
              y={30 - h}
              width={barW - 1.5}
              height={Math.max(h, n > 0 ? 1.5 : 0)}
              rx={1}
              fill={n === peak && peak > 0 ? 'var(--sentinel-accent)' : 'rgba(255,255,255,0.22)'}
            />
          );
        })}
        <line x1={0} y1={30.5} x2={100} y2={30.5} stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} />
      </svg>
      <div className="sentinel-micro sentinel-mono mt-1 flex justify-between">
        <span>{model.min}{unit ? ` ${unit}` : ''}</span>
        <span>{model.max}{unit ? ` ${unit}` : ''}</span>
      </div>
    </div>
  );
}
