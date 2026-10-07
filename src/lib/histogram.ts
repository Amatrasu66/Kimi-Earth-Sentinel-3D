import type { DataPoint } from '@/types';

export const HISTOGRAM_BINS = 8;
export const MIN_HISTOGRAM_POINTS = 5;

function numericOf(p: DataPoint): number | null {
  if (typeof p.magnitude === 'number' && Number.isFinite(p.magnitude)) return p.magnitude;
  if (typeof p.value === 'number' && Number.isFinite(p.value)) return p.value;
  return null;
}

export interface HistogramModel {
  /** Chart data rows (bin label + count). */
  rows: Record<string, unknown>[];
  min: number;
  max: number;
  count: number;
}

/** Pure binning: equal-width bins over the observed range. Null when the
 *  layer has no meaningful numeric spread (rendered as nothing). */
export function buildHistogram(points: DataPoint[], bins: number = HISTOGRAM_BINS): HistogramModel | null {
  const values = points.map(numericOf).filter((v): v is number => v !== null);
  if (values.length < MIN_HISTOGRAM_POINTS) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!(max > min)) return null;
  const width = (max - min) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / width));
    counts[idx] += 1;
  }
  return { rows: counts.map((count, i) => ({ bin: String(i + 1), count })), min, max, count: values.length };
}
