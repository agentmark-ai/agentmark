import { describe, it, expect, vi } from 'vitest';
import { createEvalRegistry, runEvaluations } from '../src/utils/evals';

describe('evals utils', () => {
  it('exact_match returns 1 for identical strings', async () => {
    const registry = createEvalRegistry();
    const [result] = await runEvaluations(['exact_match'], registry, 'in', 'hello', 'hello');
    expect(result.name).toBe('exact_match');
    expect(result.score).toBe(1);
    expect(result.label).toBe('correct');
  });

  it('exact_match_json deep-compares JSON strings', async () => {
    const registry = createEvalRegistry();
    const expected = JSON.stringify({ a: 1, b: [1,2] });
    const output = { a: 1, b: [1,2] };
    const [result] = await runEvaluations(['exact_match_json'], registry, {}, output as any, expected);
    expect(result.score).toBe(1);
    expect(result.label).toBe('correct');
  });

  it('contains returns 0 when substring not present', async () => {
    const registry = createEvalRegistry();
    const [result] = await runEvaluations(['contains'], registry, {}, 'hello world', 'goodbye');
    expect(result.score).toBe(0);
    expect(result.label).toBe('incorrect');
  });

  it('emits error and not_found when eval is missing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const registry = createEvalRegistry();
    const [result] = await runEvaluations(['does_not_exist'], registry, {}, 'x', 'y');
    expect(spy).toHaveBeenCalled();
    expect(result.label).toBe('not_found');
    spy.mockRestore();
  });
});
