/**
 * Concurrency utilities for the experiment runner.
 *
 * An experiment dispatches N independent dataset rows against a prompt
 * template. Processing them sequentially makes a run take the *sum* of every
 * row's latency. A bounded worker pool makes it take roughly
 * `max-row-latency * ceil(N / concurrency)` instead.
 *
 * See: https://github.com/agentmark-ai/app/issues/2326
 */

import { wireJson } from "./wire";

/**
 * Dataset rows processed concurrently when the caller doesn't specify.
 *
 * `agentmark run-experiment --concurrency <n>` overrides this per run; the
 * dashboard has no override and always uses the default.
 */
export const DEFAULT_EXPERIMENT_CONCURRENCY = 20;

/**
 * Build the NDJSON error chunk an adapter emits when a dataset row fails.
 *
 * The experiment policy is "emit an error row and continue", so an adapter
 * catches a per-row failure and enqueues this chunk instead of aborting the
 * whole run.
 */
export function experimentErrorChunk(err: unknown): string {
  return wireJson({
    type: "error",
    error: err instanceof Error ? err.message : String(err),
  });
}

/**
 * Drain a dataset reader through a bounded pool of concurrent workers.
 *
 * Spawns `concurrency` workers; each worker pulls the next item from `reader`
 * and runs `processItem`, looping until the stream is exhausted. Items are
 * handed out in read order — `index` is the zero-based position the item was
 * read at (stable and unaffected by which worker happens to pick it up).
 *
 * Calling `reader.read()` from multiple workers is safe: the Streams spec
 * queues concurrent read requests FIFO, so each worker receives a distinct
 * item. `index` is assigned with a synchronous `nextIndex++` between awaits,
 * so no two items share an index.
 *
 * `processItem` MUST handle its own per-item errors. The experiment policy is
 * "emit an error row and continue", so a row failure should be caught inside
 * `processItem` and surfaced as an error chunk — a throw escaping it will
 * reject the whole pool.
 *
 * If `signal` is provided and fires, workers stop pulling NEW items (rows
 * already in flight run to completion — they abort their own SDK calls via the
 * signal threaded into their ExecCtx). This is how a cancelled experiment stops
 * burning rows rather than running the whole dataset.
 *
 * @returns the total number of items processed (excludes the terminal `done`)
 */
export async function runDatasetPool<T>(
  reader: ReadableStreamDefaultReader<T>,
  processItem: (item: T, index: number) => Promise<void>,
  concurrency: number = DEFAULT_EXPERIMENT_CONCURRENCY,
  signal?: AbortSignal
): Promise<number> {
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) return; // stop dispatching new rows once cancelled
      const { value, done } = await reader.read();
      if (done) return;
      const index = nextIndex++;
      await processItem(value as T, index);
    }
  };

  // No upper bound — the caller owns the trade-off; only guard against a
  // non-positive or fractional value that would stall or misbehave.
  const size = Math.max(1, Math.floor(concurrency) || 1);
  await Promise.all(Array.from({ length: size }, () => worker()));

  return nextIndex;
}
