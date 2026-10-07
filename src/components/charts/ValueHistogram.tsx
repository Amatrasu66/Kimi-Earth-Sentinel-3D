"use client";

import { useMemo } from 'react';
import { useReducedMotion } from 'motion/react';
import { BarChart } from '@/components/charts/bar-chart';
import { Bar } from '@/components/charts/bar';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip';
import { metricLabelForLayer, unitForLayer } from '@/lib/format';
import { buildHistogram } from '@/lib/histogram';
import type { DataPoint, LayerId } from '@/types';

/**
 * Value spread rendered with the official Bklit bar chart, themed to Sentinel
 * tokens: neutral bars, subtle grid, compact tooltip — no library-default
 * blue, no decorative gradients. Honest current-state analysis only.
 */
export default function ValueHistogram({
  points,
  activeLayer,
}: {
  points: DataPoint[];
  activeLayer: LayerId | null;
}) {
  const reduceMotion = useReducedMotion();
  const model = useMemo(() => buildHistogram(points), [points]);

  if (!model) return null;

  const unit = unitForLayer(activeLayer);
  const label = metricLabelForLayer(activeLayer);

  return (
    <div
      className="sentinel-inset rounded-lg p-3"
      role="img"
      aria-label={`${label} spread across ${model.count} current points, ranging ${model.min} to ${model.max}${unit ? ` ${unit}` : ''}`}
    >
      <div className="sentinel-micro mb-1 flex items-baseline justify-between">
        <span>{label} spread</span>
        <span className="sentinel-mono">n={model.count}</span>
      </div>
      <BarChart
        data={model.rows}
        xDataKey="bin"
        aspectRatio="3 / 1"
        margin={{ top: 8, right: 4, bottom: 4, left: 4 }}
        animationDuration={reduceMotion ? 0 : 450}
      >
        <Grid horizontal numTicksRows={3} />
        <Bar dataKey="count" fill="rgba(255,255,255,0.28)" lineCap={2} animate={!reduceMotion} />
        <ChartTooltip />
      </BarChart>
      <div className="sentinel-micro sentinel-mono mt-1 flex justify-between">
        <span>{model.min}{unit ? ` ${unit}` : ''}</span>
        <span>{model.max}{unit ? ` ${unit}` : ''}</span>
      </div>
    </div>
  );
}
