import { describe, it, expect } from 'vitest';
import {
  seededRandom,
  parseRowSelection,
  parseSplitSpec,
  validateSamplingOptions,
  shouldIncludeRow,
  applySampling,
} from './sampling';
import type { SamplingOptions } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function streamFromArray<T>(items: T[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      for (const item of items) {
        controller.enqueue(item);
      }
      controller.close();
    },
  });
}

async function streamToArray<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const result: T[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result.push(value);
  }
  return result;
}

// ---------------------------------------------------------------------------
// seededRandom
// ---------------------------------------------------------------------------

describe('seededRandom', () => {
  it('should return a value in [0, 1) for seed 0 index 0', () => {
    const val = seededRandom(0, 0);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });

  it('should return a value in [0, 1) for large seed and index', () => {
    const val = seededRandom(999999, 100000);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });

  it('should return a value in [0, 1) for negative seed', () => {
    const val = seededRandom(-42, 5);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });

  it('should return the same value for the same seed and index (deterministic)', () => {
    const a = seededRandom(42, 7);
    const b = seededRandom(42, 7);
    expect(a).toBe(b);
  });

  it('should return different values for different seeds with the same index', () => {
    const a = seededRandom(1, 0);
    const b = seededRandom(2, 0);
    expect(a).not.toBe(b);
  });

  it('should return different values for different indices with the same seed', () => {
    const a = seededRandom(42, 0);
    const b = seededRandom(42, 1);
    expect(a).not.toBe(b);
  });

  it('should produce a uniform-looking distribution across many indices', () => {
    const N = 1000;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      sum += seededRandom(123, i);
    }
    const mean = sum / N;
    // Expect mean to be roughly 0.5 (within a generous margin)
    expect(mean).toBeGreaterThan(0.3);
    expect(mean).toBeLessThan(0.7);
  });
});

// ---------------------------------------------------------------------------
// parseRowSelection
// ---------------------------------------------------------------------------

describe('parseRowSelection', () => {
  it('should parse a single index "5" to [5]', () => {
    expect(parseRowSelection('5')).toEqual([5]);
  });

  it('should parse multiple indices "0,3,7" to [0, 3, 7]', () => {
    expect(parseRowSelection('0,3,7')).toEqual([0, 3, 7]);
  });

  it('should parse a range "2-5" to [2, 3, 4, 5]', () => {
    expect(parseRowSelection('2-5')).toEqual([2, 3, 4, 5]);
  });

  it('should parse mixed format "0,3-5,9" to [0, 3, 4, 5, 9]', () => {
    expect(parseRowSelection('0,3-5,9')).toEqual([0, 3, 4, 5, 9]);
  });

  it('should deduplicate indices "1,1,2" to [1, 2]', () => {
    expect(parseRowSelection('1,1,2')).toEqual([1, 2]);
  });

  it('should sort indices "9,1,5" to [1, 5, 9]', () => {
    expect(parseRowSelection('9,1,5')).toEqual([1, 5, 9]);
  });

  it('should handle a single-element range "3-3" to [3]', () => {
    expect(parseRowSelection('3-3')).toEqual([3]);
  });

  it('should handle whitespace around tokens " 1 , 2 - 4 "', () => {
    expect(parseRowSelection(' 1 , 2 - 4 ')).toEqual([1, 2, 3, 4]);
  });

  it('should deduplicate overlapping ranges "1-3,2-4" to [1, 2, 3, 4]', () => {
    expect(parseRowSelection('1-3,2-4')).toEqual([1, 2, 3, 4]);
  });

  it('should throw on empty string', () => {
    expect(() => parseRowSelection('')).toThrow('Row selection cannot be empty');
  });

  it('should throw on whitespace-only string', () => {
    expect(() => parseRowSelection('   ')).toThrow('Row selection cannot be empty');
  });

  it('should throw on negative index "-1" (fails regex)', () => {
    // "-1" is parsed as a range with empty start and "1" end parts
    expect(() => parseRowSelection('-1')).toThrow();
  });

  it('should throw on reversed range "5-2"', () => {
    expect(() => parseRowSelection('5-2')).toThrow(
      'Invalid range: start (5) is greater than end (2)'
    );
  });

  it('should throw on non-numeric "abc"', () => {
    expect(() => parseRowSelection('abc')).toThrow('Invalid row index');
  });

  it('should throw on trailing comma "1,"', () => {
    expect(() => parseRowSelection('1,')).toThrow();
  });

  it('should throw on decimal "1.5"', () => {
    expect(() => parseRowSelection('1.5')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseSplitSpec
// ---------------------------------------------------------------------------

describe('parseSplitSpec', () => {
  it('should parse "train:80" to { portion: "train", percentage: 80 }', () => {
    expect(parseSplitSpec('train:80')).toEqual({ portion: 'train', percentage: 80 });
  });

  it('should parse "test:20" to { portion: "test", percentage: 20 }', () => {
    expect(parseSplitSpec('test:20')).toEqual({ portion: 'test', percentage: 20 });
  });

  it('should parse boundary "train:1"', () => {
    expect(parseSplitSpec('train:1')).toEqual({ portion: 'train', percentage: 1 });
  });

  it('should parse boundary "test:99"', () => {
    expect(parseSplitSpec('test:99')).toEqual({ portion: 'test', percentage: 99 });
  });

  it('should handle whitespace " train : 50 "', () => {
    expect(parseSplitSpec(' train : 50 ')).toEqual({ portion: 'train', percentage: 50 });
  });

  it('should throw on missing colon "train80"', () => {
    expect(() => parseSplitSpec('train80')).toThrow('Invalid split format');
  });

  it('should throw on invalid portion "validate:80"', () => {
    expect(() => parseSplitSpec('validate:80')).toThrow('Invalid split portion');
  });

  it('should throw on percentage 0', () => {
    expect(() => parseSplitSpec('train:0')).toThrow('Split percentage must be between 1 and 99');
  });

  it('should throw on percentage 100', () => {
    expect(() => parseSplitSpec('train:100')).toThrow('Split percentage must be between 1 and 99');
  });

  it('should throw on non-integer percentage "train:50.5"', () => {
    expect(() => parseSplitSpec('train:50.5')).toThrow('Invalid split percentage');
  });

  it('should throw on negative percentage "train:-10"', () => {
    expect(() => parseSplitSpec('train:-10')).toThrow('Invalid split percentage');
  });

  it('should throw on empty percentage "train:"', () => {
    expect(() => parseSplitSpec('train:')).toThrow('Invalid split percentage');
  });

  it('should throw on multiple colons "train:80:extra"', () => {
    expect(() => parseSplitSpec('train:80:extra')).toThrow('Invalid split format');
  });
});

// ---------------------------------------------------------------------------
// validateSamplingOptions
// ---------------------------------------------------------------------------

describe('validateSamplingOptions', () => {
  it('should pass with valid sample option', () => {
    expect(() => validateSamplingOptions({ sample: 50 })).not.toThrow();
  });

  it('should pass with valid rows option', () => {
    expect(() => validateSamplingOptions({ rows: [0, 1] })).not.toThrow();
  });

  it('should pass with valid split option', () => {
    expect(() =>
      validateSamplingOptions({ split: { portion: 'train', percentage: 80 } })
    ).not.toThrow();
  });

  it('should pass with empty options (no sampling)', () => {
    expect(() => validateSamplingOptions({})).not.toThrow();
  });

  it('should pass with sample at minimum boundary 1', () => {
    expect(() => validateSamplingOptions({ sample: 1 })).not.toThrow();
  });

  it('should pass with sample at maximum boundary 100', () => {
    expect(() => validateSamplingOptions({ sample: 100 })).not.toThrow();
  });

  it('should pass with a valid seed', () => {
    expect(() => validateSamplingOptions({ sample: 50, seed: 42 })).not.toThrow();
  });

  it('should pass with split percentage at boundary 1', () => {
    expect(() =>
      validateSamplingOptions({ split: { portion: 'test', percentage: 1 } })
    ).not.toThrow();
  });

  it('should pass with split percentage at boundary 99', () => {
    expect(() =>
      validateSamplingOptions({ split: { portion: 'train', percentage: 99 } })
    ).not.toThrow();
  });

  it('should throw when sample and rows are both specified', () => {
    expect(() => validateSamplingOptions({ sample: 50, rows: [0] })).toThrow(
      'mutually exclusive'
    );
  });

  it('should throw when sample and split are both specified', () => {
    expect(() =>
      validateSamplingOptions({ sample: 50, split: { portion: 'train', percentage: 80 } })
    ).toThrow('mutually exclusive');
  });

  it('should throw when rows and split are both specified', () => {
    expect(() =>
      validateSamplingOptions({ rows: [0], split: { portion: 'train', percentage: 80 } })
    ).toThrow('mutually exclusive');
  });

  it('should throw when all three modes are specified', () => {
    expect(() =>
      validateSamplingOptions({
        sample: 50,
        rows: [0],
        split: { portion: 'train', percentage: 80 },
      })
    ).toThrow('mutually exclusive');
  });

  it('should throw when sample is 0', () => {
    expect(() => validateSamplingOptions({ sample: 0 })).toThrow(
      'Sample percentage must be an integer between 1 and 100'
    );
  });

  it('should throw when sample is 101', () => {
    expect(() => validateSamplingOptions({ sample: 101 })).toThrow(
      'Sample percentage must be an integer between 1 and 100'
    );
  });

  it('should throw when sample is not an integer', () => {
    expect(() => validateSamplingOptions({ sample: 50.5 })).toThrow(
      'Sample percentage must be an integer between 1 and 100'
    );
  });

  it('should throw when sample is negative', () => {
    expect(() => validateSamplingOptions({ sample: -1 })).toThrow(
      'Sample percentage must be an integer between 1 and 100'
    );
  });

  it('should throw when split percentage is 0', () => {
    expect(() =>
      validateSamplingOptions({ split: { portion: 'train', percentage: 0 } })
    ).toThrow('Split percentage must be an integer between 1 and 99');
  });

  it('should throw when split percentage is 100', () => {
    expect(() =>
      validateSamplingOptions({ split: { portion: 'train', percentage: 100 } })
    ).toThrow('Split percentage must be an integer between 1 and 99');
  });

  it('should throw when split percentage is not an integer', () => {
    expect(() =>
      validateSamplingOptions({ split: { portion: 'train', percentage: 50.5 } })
    ).toThrow('Split percentage must be an integer between 1 and 99');
  });

  it('should throw when seed is Infinity', () => {
    expect(() => validateSamplingOptions({ seed: Infinity })).toThrow(
      'Seed must be a finite number'
    );
  });

  it('should throw when seed is NaN', () => {
    expect(() => validateSamplingOptions({ seed: NaN })).toThrow(
      'Seed must be a finite number'
    );
  });

  it('should throw when seed is -Infinity', () => {
    expect(() => validateSamplingOptions({ seed: -Infinity })).toThrow(
      'Seed must be a finite number'
    );
  });

  it('should throw when rows contain a negative index', () => {
    expect(() => validateSamplingOptions({ rows: [0, -1, 5] })).toThrow(
      'Row index must be non-negative'
    );
  });
});

// ---------------------------------------------------------------------------
// shouldIncludeRow
// ---------------------------------------------------------------------------

describe('shouldIncludeRow', () => {
  it('should return true when row index is in the rows list', () => {
    expect(shouldIncludeRow(3, { rows: [1, 3, 5] })).toBe(true);
  });

  it('should return false when row index is not in the rows list', () => {
    expect(shouldIncludeRow(2, { rows: [1, 3, 5] })).toBe(false);
  });

  it('should return true for index 0 in rows [0]', () => {
    expect(shouldIncludeRow(0, { rows: [0] })).toBe(true);
  });

  it('should be deterministic with sample and seed', () => {
    const opts: SamplingOptions = { sample: 50, seed: 42 };
    const first = shouldIncludeRow(10, opts);
    const second = shouldIncludeRow(10, opts);
    expect(first).toBe(second);
  });

  it('should vary across indices with sample and seed', () => {
    const opts: SamplingOptions = { sample: 50, seed: 42 };
    const results = Array.from({ length: 100 }, (_, i) => shouldIncludeRow(i, opts));
    const trueCount = results.filter(Boolean).length;
    // With 50% sample, expect roughly 30-70 out of 100
    expect(trueCount).toBeGreaterThan(20);
    expect(trueCount).toBeLessThan(80);
  });

  it('should return a boolean with sample and no seed (random)', () => {
    const result = shouldIncludeRow(0, { sample: 50 });
    expect(typeof result).toBe('boolean');
  });

  it('should make train and test complementary with split and seed', () => {
    const seed = 99;
    const percentage = 70;
    for (let i = 0; i < 50; i++) {
      const inTrain = shouldIncludeRow(i, {
        split: { portion: 'train', percentage },
        seed,
      });
      const inTest = shouldIncludeRow(i, {
        split: { portion: 'test', percentage },
        seed,
      });
      expect(inTrain).not.toBe(inTest);
    }
  });

  it('should use positional cutoff for unseeded split with totalRows', () => {
    const totalRows = 10;
    const trainOpts: SamplingOptions = { split: { portion: 'train', percentage: 60 } };
    const testOpts: SamplingOptions = { split: { portion: 'test', percentage: 60 } };

    // cutoff = Math.round(10 * 60 / 100) = 6
    // train: indices 0-5, test: indices 6-9
    for (let i = 0; i < 6; i++) {
      expect(shouldIncludeRow(i, trainOpts, totalRows)).toBe(true);
      expect(shouldIncludeRow(i, testOpts, totalRows)).toBe(false);
    }
    for (let i = 6; i < 10; i++) {
      expect(shouldIncludeRow(i, trainOpts, totalRows)).toBe(false);
      expect(shouldIncludeRow(i, testOpts, totalRows)).toBe(true);
    }
  });

  it('should throw when unseeded split is used without totalRows', () => {
    expect(() =>
      shouldIncludeRow(0, { split: { portion: 'train', percentage: 50 } })
    ).toThrow('totalRows required for unseeded split');
  });

  it('should always return true when no sampling options are set', () => {
    expect(shouldIncludeRow(0, {})).toBe(true);
    expect(shouldIncludeRow(99, {})).toBe(true);
  });

  it('should include all rows with sample 100 and seed', () => {
    const opts: SamplingOptions = { sample: 100, seed: 1 };
    for (let i = 0; i < 20; i++) {
      expect(shouldIncludeRow(i, opts)).toBe(true);
    }
  });

  it('should include approximately 1% with sample 1 and seed', () => {
    const opts: SamplingOptions = { sample: 1, seed: 7 };
    const included = Array.from({ length: 1000 }, (_, i) => shouldIncludeRow(i, opts)).filter(
      Boolean
    ).length;
    // 1% of 1000 = 10, allow generous margin
    expect(included).toBeGreaterThanOrEqual(0);
    expect(included).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// applySampling
// ---------------------------------------------------------------------------

describe('applySampling', () => {
  const testData = Array.from({ length: 20 }, (_, i) => ({ id: i, value: `row-${i}` }));

  it('should return the same stream reference when no sampling options are set', () => {
    const stream = streamFromArray(testData);
    const result = applySampling(stream, {});
    expect(result).toBe(stream);
  });

  it('should filter to only specified rows', async () => {
    const stream = streamFromArray(testData);
    const result = await streamToArray(applySampling(stream, { rows: [0, 5, 19] }));
    expect(result).toEqual([
      { id: 0, value: 'row-0' },
      { id: 5, value: 'row-5' },
      { id: 19, value: 'row-19' },
    ]);
  });

  it('should return empty array when rows has no matching indices', async () => {
    const stream = streamFromArray(testData);
    const result = await streamToArray(applySampling(stream, { rows: [100, 200] }));
    expect(result).toEqual([]);
  });

  it('should filter approximately correct percentage with sample and seed', async () => {
    const largeData = Array.from({ length: 200 }, (_, i) => i);
    const stream = streamFromArray(largeData);
    const result = await streamToArray(applySampling(stream, { sample: 50, seed: 42 }));
    // Expect roughly 50% -- within generous bounds
    expect(result.length).toBeGreaterThan(60);
    expect(result.length).toBeLessThan(140);
  });

  it('should produce deterministic results with sample and seed', async () => {
    const data = Array.from({ length: 50 }, (_, i) => i);

    const result1 = await streamToArray(
      applySampling(streamFromArray(data), { sample: 50, seed: 123 })
    );
    const result2 = await streamToArray(
      applySampling(streamFromArray(data), { sample: 50, seed: 123 })
    );
    expect(result1).toEqual(result2);
  });

  it('should ensure train and test together cover all rows with seeded split', async () => {
    const data = Array.from({ length: 30 }, (_, i) => i);
    const seed = 77;
    const percentage = 60;

    const train = await streamToArray(
      applySampling(streamFromArray(data), {
        split: { portion: 'train', percentage },
        seed,
      })
    );
    const test = await streamToArray(
      applySampling(streamFromArray(data), {
        split: { portion: 'test', percentage },
        seed,
      })
    );

    // No overlap
    const trainSet = new Set(train);
    for (const item of test) {
      expect(trainSet.has(item)).toBe(false);
    }

    // Together they cover all rows
    const combined = [...train, ...test].sort((a, b) => a - b);
    expect(combined).toEqual(data);
  });

  it('should perform positional split correctly without seed', async () => {
    const data = Array.from({ length: 10 }, (_, i) => i);

    const train = await streamToArray(
      applySampling(streamFromArray(data), {
        split: { portion: 'train', percentage: 60 },
      })
    );
    const test = await streamToArray(
      applySampling(streamFromArray(data), {
        split: { portion: 'test', percentage: 60 },
      })
    );

    // cutoff = Math.round(10 * 60 / 100) = 6
    expect(train).toEqual([0, 1, 2, 3, 4, 5]);
    expect(test).toEqual([6, 7, 8, 9]);
  });

  it('should throw on invalid options passed to applySampling', () => {
    const stream = streamFromArray(testData);
    expect(() =>
      applySampling(stream, { sample: 0 })
    ).toThrow('Sample percentage must be an integer between 1 and 100');
  });

  it('should throw on mutually exclusive options', () => {
    const stream = streamFromArray(testData);
    expect(() =>
      applySampling(stream, { sample: 50, rows: [0] })
    ).toThrow('mutually exclusive');
  });

  it('should handle empty stream with rows option', async () => {
    const stream = streamFromArray<number>([]);
    const result = await streamToArray(applySampling(stream, { rows: [0, 1] }));
    expect(result).toEqual([]);
  });

  it('should handle empty stream with sample option', async () => {
    const stream = streamFromArray<number>([]);
    const result = await streamToArray(applySampling(stream, { sample: 50, seed: 1 }));
    expect(result).toEqual([]);
  });

  it('should handle empty stream with positional split', async () => {
    const stream = streamFromArray<number>([]);
    const result = await streamToArray(
      applySampling(stream, { split: { portion: 'train', percentage: 50 } })
    );
    expect(result).toEqual([]);
  });

  it('should include all rows with sample 100', async () => {
    const data = Array.from({ length: 10 }, (_, i) => i);
    const result = await streamToArray(
      applySampling(streamFromArray(data), { sample: 100, seed: 42 })
    );
    expect(result).toEqual(data);
  });
});
