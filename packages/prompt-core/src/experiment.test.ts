import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EXPERIMENT_CONCURRENCY,
  experimentErrorChunk,
  runDatasetPool,
} from './experiment';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a ReadableStream that lazily yields each item from `items`. */
function streamFromArray<T>(items: T[]): ReadableStream<T> {
  let i = 0;
  return new ReadableStream<T>({
    pull(controller) {
      if (i < items.length) controller.enqueue(items[i++]);
      else controller.close();
    },
  });
}

// ---------------------------------------------------------------------------
// runDatasetPool
// ---------------------------------------------------------------------------

describe('runDatasetPool', () => {
  it('should process every item exactly once with contiguous 0..N-1 indices', async () => {
    const items = Array.from({ length: 7 }, (_, i) => `item-${i}`);
    const reader = streamFromArray(items).getReader();

    const seenIndices: number[] = [];
    const seenItems: string[] = [];
    const processItem = async (item: string, index: number): Promise<void> => {
      seenIndices.push(index);
      seenItems.push(item);
    };

    const count = await runDatasetPool(reader, processItem, 3);

    expect(count).toBe(7);
    expect([...seenIndices].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([...seenItems].sort()).toEqual([...items].sort());
  });

  it('should resolve to 0 and never call processItem on an empty stream', async () => {
    const reader = streamFromArray<string>([]).getReader();

    let calls = 0;
    const processItem = async (): Promise<void> => {
      calls++;
    };

    const count = await runDatasetPool(reader, processItem, 3);

    expect(count).toBe(0);
    expect(calls).toBe(0);
  });

  it('should respect the concurrency value and actually overlap workers', async () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    const reader = streamFromArray(items).getReader();

    let inFlight = 0;
    let maxInFlight = 0;
    const processItem = async (): Promise<void> => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
    };

    const count = await runDatasetPool(reader, processItem, 4);

    expect(count).toBe(12);
    expect(maxInFlight).toBe(4);
  });

  it('should honor a concurrency with no upper bound', async () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const reader = streamFromArray(items).getReader();

    let inFlight = 0;
    let maxInFlight = 0;
    const processItem = async (): Promise<void> => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
    };

    const count = await runDatasetPool(reader, processItem, 25);

    expect(count).toBe(25);
    // No clamp — concurrency well above the former ceiling of 20 is honored.
    expect(maxInFlight).toBe(25);
  });

  it('should process all items without deadlock when concurrency is 0', async () => {
    const items = Array.from({ length: 3 }, (_, i) => i);
    const reader = streamFromArray(items).getReader();

    let inFlight = 0;
    let maxInFlight = 0;
    const processItem = async (): Promise<void> => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    };

    const count = await runDatasetPool(reader, processItem, 0);

    expect(count).toBe(3);
    expect(maxInFlight).toBe(1);
  });

  it('should process all items when completion order differs from read order', async () => {
    const items = Array.from({ length: 5 }, (_, i) => i);
    const reader = streamFromArray(items).getReader();

    const completed: number[] = [];
    const processItem = async (item: number, index: number): Promise<void> => {
      // Index 0 finishes last; the rest finish quickly.
      await new Promise((r) => setTimeout(r, index === 0 ? 30 : 5));
      completed.push(item);
    };

    const count = await runDatasetPool(reader, processItem, 5);

    expect(count).toBe(5);
    expect([...completed].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('should fall back to the default concurrency when no third argument is given', async () => {
    const items = Array.from({ length: 6 }, (_, i) => i);
    const reader = streamFromArray(items).getReader();

    const seen: number[] = [];
    const processItem = async (item: number): Promise<void> => {
      seen.push(item);
    };

    const count = await runDatasetPool(reader, processItem);

    expect(count).toBe(6);
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

// ---------------------------------------------------------------------------
// experimentErrorChunk
// ---------------------------------------------------------------------------

describe('experimentErrorChunk', () => {
  it('should serialize an Error into a newline-terminated error chunk', () => {
    const chunk = experimentErrorChunk(new Error('boom'));
    expect(chunk.endsWith('\n')).toBe(true);
    expect(JSON.parse(chunk)).toEqual({ type: 'error', error: 'boom' });
  });

  it('should stringify a non-Error value', () => {
    expect(JSON.parse(experimentErrorChunk('plain failure'))).toEqual({
      type: 'error',
      error: 'plain failure',
    });
  });
});

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

describe('experiment constants', () => {
  it('should expose DEFAULT_EXPERIMENT_CONCURRENCY as 20', () => {
    expect(DEFAULT_EXPERIMENT_CONCURRENCY).toBe(20);
  });
});
