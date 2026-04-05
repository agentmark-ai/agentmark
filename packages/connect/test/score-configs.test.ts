import { describe, it, expect } from 'vitest';
import { serializeScoreRegistry } from '../../prompt-core/src/scores';
import type { ScoreRegistry, SerializedScoreConfig } from '../../prompt-core/src/scores';

describe('get-score-configs job handling', () => {
  it('serializes score registry for transport', () => {
    const registry: ScoreRegistry = {
      accuracy: {
        schema: { type: 'boolean' },
        description: 'Correctness check',
        eval: async () => ({ passed: true }),
      },
      quality: {
        schema: { type: 'numeric', min: 1, max: 5 },
      },
      category: {
        schema: { type: 'categorical', categories: ['a', 'b', 'c'] },
        eval: async () => ({ label: 'a' }),
      },
    };

    const result: SerializedScoreConfig[] = serializeScoreRegistry(registry);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      name: 'accuracy',
      schema: { type: 'boolean' },
      description: 'Correctness check',
      hasEval: true,
    });
    expect(result[1]).toEqual({
      name: 'quality',
      schema: { type: 'numeric', min: 1, max: 5 },
      hasEval: false,
    });
    expect(result[2]).toEqual({
      name: 'category',
      schema: { type: 'categorical', categories: ['a', 'b', 'c'] },
      hasEval: true,
    });

    // Verify JSON round-trip safety (no functions leak through)
    const json = JSON.parse(JSON.stringify(result));
    expect(json).toEqual(result);
  });

  it('returns empty array when no score registry defined', () => {
    const result = serializeScoreRegistry({});
    expect(result).toEqual([]);
  });

  it('omits description when not provided', () => {
    const registry: ScoreRegistry = {
      score: {
        schema: { type: 'boolean' },
      },
    };

    const result = serializeScoreRegistry(registry);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'score',
      schema: { type: 'boolean' },
      hasEval: false,
    });
    expect('description' in result[0]).toBe(false);
  });
});
