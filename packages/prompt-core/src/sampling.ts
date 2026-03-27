import type { SamplingOptions } from './types';

/**
 * Create a deterministic hash-based random value for a given seed and index.
 * Returns a number in [0, 1). Same seed + index always produces same value.
 */
export function seededRandom(seed: number, index: number): number {
  // mulberry32-based hash
  let h = (seed + index) | 0;
  h = h + 0x6D2B79F5 | 0;
  let t = Math.imul(h ^ h >>> 15, 1 | h);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

/**
 * Parse a row selection string into a sorted, deduplicated array of indices.
 * Input: "0,3-5,9" → Output: [0, 3, 4, 5, 9]
 */
export function parseRowSelection(input: string): number[] {
  const trimmed = input.trim();
  if (trimmed === '') {
    throw new Error('Row selection cannot be empty');
  }

  const indices = new Set<number>();
  const tokens = trimmed.split(',');

  for (const token of tokens) {
    const t = token.trim();
    if (t === '') {
      throw new Error('Row selection contains empty token');
    }

    if (t.includes('-')) {
      const parts = t.split('-');
      if (parts.length !== 2) {
        throw new Error(`Invalid range format: "${t}"`);
      }
      const start = parseRowIndex(parts[0].trim(), t);
      const end = parseRowIndex(parts[1].trim(), t);
      if (start > end) {
        throw new Error(`Invalid range: start (${start}) is greater than end (${end}) in "${t}"`);
      }
      for (let i = start; i <= end; i++) {
        indices.add(i);
      }
    } else {
      indices.add(parseRowIndex(t, t));
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

function parseRowIndex(value: string, context: string): number {
  if (value === '' || !/^\d+$/.test(value)) {
    throw new Error(`Invalid row index: "${value}" in "${context}"`);
  }
  const num = parseInt(value, 10);
  if (num < 0) {
    throw new Error(`Row index must be non-negative: ${num}`);
  }
  return num;
}

/**
 * Parse a split specification string.
 * Input: "train:80" → Output: { portion: 'train', percentage: 80 }
 */
export function parseSplitSpec(input: string): { portion: 'train' | 'test'; percentage: number } {
  const trimmed = input.trim();
  const parts = trimmed.split(':');

  if (parts.length !== 2) {
    throw new Error(`Invalid split format: expected "train:<percentage>" or "test:<percentage>", got "${trimmed}"`);
  }

  const portion = parts[0].trim();
  if (portion !== 'train' && portion !== 'test') {
    throw new Error(`Invalid split portion: expected "train" or "test", got "${portion}"`);
  }

  const percentageStr = parts[1].trim();
  if (!/^\d+$/.test(percentageStr)) {
    throw new Error(`Invalid split percentage: expected integer 1-99, got "${percentageStr}"`);
  }

  const percentage = parseInt(percentageStr, 10);
  if (percentage < 1 || percentage > 99) {
    throw new Error(`Split percentage must be between 1 and 99, got ${percentage}`);
  }

  return { portion, percentage };
}

/**
 * Validate sampling options for mutual exclusivity and value ranges.
 * Throws with descriptive error message on invalid input.
 */
export function validateSamplingOptions(options: SamplingOptions): void {
  const modes: string[] = [];
  if (options.sample !== undefined) modes.push('--sample');
  if (options.rows !== undefined) modes.push('--rows');
  if (options.split !== undefined) modes.push('--split');

  if (modes.length > 1) {
    throw new Error(
      'Sampling options are mutually exclusive: only one of --sample, --rows, or --split may be used'
    );
  }

  if (options.sample !== undefined) {
    if (!Number.isInteger(options.sample) || options.sample < 1 || options.sample > 100) {
      throw new Error('Sample percentage must be an integer between 1 and 100');
    }
  }

  if (options.rows !== undefined) {
    for (const row of options.rows) {
      if (row < 0) {
        throw new Error(`Row index must be non-negative, got ${row}`);
      }
    }
  }

  if (options.split !== undefined) {
    if (options.split.portion !== 'train' && options.split.portion !== 'test') {
      throw new Error(`Split portion must be "train" or "test", got "${options.split.portion}"`);
    }
    if (
      !Number.isInteger(options.split.percentage) ||
      options.split.percentage < 1 ||
      options.split.percentage > 99
    ) {
      throw new Error('Split percentage must be an integer between 1 and 99');
    }
  }

  if (options.seed !== undefined) {
    if (!Number.isFinite(options.seed)) {
      throw new Error('Seed must be a finite number');
    }
  }
}

/**
 * Determine whether a row at the given index should be included based on sampling options.
 */
export function shouldIncludeRow(
  index: number,
  options: SamplingOptions,
  totalRows?: number
): boolean {
  if (options.rows !== undefined) {
    return options.rows.includes(index);
  }

  if (options.sample !== undefined) {
    if (options.seed !== undefined) {
      return seededRandom(options.seed, index) < options.sample / 100;
    }
    return Math.random() < options.sample / 100;
  }

  if (options.split !== undefined) {
    if (options.seed !== undefined) {
      const inTrain = seededRandom(options.seed, index) < options.split.percentage / 100;
      return options.split.portion === 'train' ? inTrain : !inTrain;
    }
    // Positional split — needs totalRows
    if (totalRows === undefined) {
      throw new Error('totalRows required for unseeded split');
    }
    const cutoff = Math.round(totalRows * options.split.percentage / 100);
    return options.split.portion === 'train' ? index < cutoff : index >= cutoff;
  }

  // No sampling mode set — include all rows
  return true;
}

function createFilteredStream<T>(
  stream: ReadableStream<T>,
  predicate: (index: number) => boolean
): ReadableStream<T> {
  const reader = stream.getReader();
  let index = 0;

  return new ReadableStream<T>({
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          const currentIndex = index++;
          if (predicate(currentIndex)) {
            controller.enqueue(value);
            return;
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      reader.cancel(reason);
    },
  });
}

/**
 * Apply sampling to a ReadableStream of dataset rows.
 * Returns a new ReadableStream with only the selected rows.
 */
export function applySampling<T>(
  stream: ReadableStream<T>,
  options: SamplingOptions
): ReadableStream<T> {
  validateSamplingOptions(options);

  // No sampling mode set — return stream unchanged
  if (options.sample === undefined && options.rows === undefined && options.split === undefined) {
    return stream;
  }

  // Convert rows to Set for O(1) lookups
  if (options.rows !== undefined) {
    const rowSet = new Set(options.rows);
    return createFilteredStream(stream, (idx) => rowSet.has(idx));
  }

  // Positional split (unseeded) requires buffering all rows
  if (options.split !== undefined && options.seed === undefined) {
    return new ReadableStream<T>({
      async start(controller) {
        try {
          const reader = stream.getReader();
          const buffer: T[] = [];

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer.push(value);
          }

          const totalRows = buffer.length;
          for (let i = 0; i < buffer.length; i++) {
            if (shouldIncludeRow(i, options, totalRows)) {
              controller.enqueue(buffer[i]);
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  }

  // Streaming mode — filter row by row
  return createFilteredStream(stream, (idx) => shouldIncludeRow(idx, options));
}
