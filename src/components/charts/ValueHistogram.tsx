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
 * Value spread rendered with the official Bklit bar chart, integrated
 * into the panel hierarchy: no card border, minimal grid, title and
 * value aligned to the panel content edge. Neutral bars — no
 * library-default blue, no decorative gradients.
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
      role="img"
      aria-label={`${label} spread across ${model.count} current points, ranging ${model.min} to ${model.max}${unit ? ` ${unit}` : ''}`}
    >
      <div className="sentinel-label mb-1 flex items-baseline justify-between">
        <span>{label} spread</span>
        <span className="sentinel-mono font-normal normal-case tracking-normal">n={model.count}</span>
      </div>
      <BarChart
        data={model.rows}
        xDataKey="bin"
        aspectRatio="3 / 1"
        margin={{ top: 8, right: 2, bottom: 4, left: 2 }}
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
