/**
 * Small bounded-concurrency worker pool for batched upstream fetches.
 *
 * Shared by the Open-Meteo weather and air-quality providers (the two
 * genuine multi-batch consumers): runs at most `limit` batch fetches
 * concurrently, preserves chunk order in the output, captures per-batch
 * failures as values (one bad batch never discards the others), and stops
 * scheduling new batches once `signal` aborts. Holes left by a pre-abort
 * are reported as cancellations, never silent gaps.
 */

export type BatchOutcome = { results: Record<string, unknown>[] } | { error: unknown };

export async function runBatches<T>(
  batchChunks: T[][],
  limit: number,
  fn: (chunk: T[], index: number, signal?: AbortSignal) => Promise<BatchOutcome>,
  signal?: AbortSignal,
): Promise<BatchOutcome[]> {
  const out: BatchOutcome[] = new Array(batchChunks.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, batchChunks.length));
  const run = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) return;
      const index = cursor;
      cursor += 1;
      if (index >= batchChunks.length) return;
      try {
        out[index] = await fn(batchChunks[index], index, signal);
      } catch (error) {
        out[index] = { error };
      }
    }
  };
  await Promise.all(Array.from({ length: workerCount }, () => run()));
  // Array.map would skip holes, so fill via Array.from — every chunk is
  // accounted for downstream.
  return Array.from({ length: batchChunks.length }, (_, index) => {
    const outcome = out[index];
    return outcome === undefined
      ? { error: new Error(`Batch ${index} cancelled before scheduling`) }
      : outcome;
  });
}
