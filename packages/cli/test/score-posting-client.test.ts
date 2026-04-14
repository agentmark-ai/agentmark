import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postExperimentScores } from '../cli-src/commands/run-experiment';

describe('postExperimentScores', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let postedScores: Array<{ url: string; body: any }>;

  beforeEach(() => {
    postedScores = [];
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      if (typeof url === 'string' && url.includes('/v1/scores') && options?.method === 'POST') {
        const body = JSON.parse(options.body as string);
        postedScores.push({ url, body });
      }
      return new Response('OK', { status: 200 });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('posts scores for dataset events with traceId and evals', async () => {
    const evt = {
      traceId: 'abc123',
      result: {
        evals: [
          { name: 'quality', score: 0.9, label: 'PASS', reason: 'Good match', passed: true },
          { name: 'relevance', score: 0.8, passed: true },
        ],
      },
    };

    postExperimentScores(evt, 'http://localhost:9418');

    // Wait for fire-and-forget fetches to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(postedScores.length).toBe(2);

    expect(postedScores[0].url).toBe('http://localhost:9418/v1/scores');
    expect(postedScores[0].body).toEqual({
      resourceId: 'abc123',
      score: 0.9,
      label: 'PASS',
      reason: 'Good match',
      name: 'quality',
      type: 'experiment',
      dataType: '',
    });

    expect(postedScores[1].body).toEqual({
      resourceId: 'abc123',
      score: 0.8,
      label: 'PASS',
      reason: '',
      name: 'relevance',
      type: 'experiment',
      dataType: '',
    });
  });

  it('derives label and score from passed when not explicitly provided', async () => {
    postExperimentScores(
      {
        traceId: 'trace-1',
        result: {
          evals: [
            { name: 'accuracy', passed: false, reason: 'Mismatch' },
          ],
        },
      },
      'http://localhost:9418',
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(postedScores.length).toBe(1);
    expect(postedScores[0].body).toEqual({
      resourceId: 'trace-1',
      score: 0,
      label: 'FAIL',
      reason: 'Mismatch',
      name: 'accuracy',
      type: 'experiment',
      dataType: '',
    });
  });

  it('does not post scores when traceId is missing', async () => {
    postExperimentScores(
      {
        result: {
          evals: [{ name: 'test', score: 1.0, passed: true }],
        },
      },
      'http://localhost:9418',
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(postedScores.length).toBe(0);
  });

  it('does not post scores when evals is empty', async () => {
    postExperimentScores(
      {
        traceId: 'trace-1',
        result: { evals: [] },
      },
      'http://localhost:9418',
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(postedScores.length).toBe(0);
  });

  it('does not post scores when evals is missing', async () => {
    postExperimentScores(
      {
        traceId: 'trace-1',
        result: {},
      },
      'http://localhost:9418',
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(postedScores.length).toBe(0);
  });

  it('continues when fetch rejects (fire-and-forget)', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));

    // Should not throw
    postExperimentScores(
      {
        traceId: 'trace-1',
        result: {
          evals: [{ name: 'test', score: 0.5 }],
        },
      },
      'http://localhost:9418',
    );

    // Wait for the rejection to be caught
    await new Promise(resolve => setTimeout(resolve, 50));

    // No assertion needed — the test passes if no unhandled rejection
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('uses the provided API server URL', async () => {
    postExperimentScores(
      {
        traceId: 'trace-1',
        result: {
          evals: [{ name: 'test', score: 1.0 }],
        },
      },
      'http://localhost:9999',
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(postedScores.length).toBe(1);
    expect(postedScores[0].url).toBe('http://localhost:9999/v1/scores');
  });

  it('skips evals that have neither score nor passed', async () => {
    postExperimentScores(
      {
        traceId: 'trace-1',
        result: {
          evals: [
            { name: 'no-score-or-passed', label: 'INFO', reason: 'informational only' } as any,
            { name: 'has-score', score: 0.75 },
          ],
        },
      },
      'http://localhost:9418',
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(postedScores.length).toBe(1);
    expect(postedScores[0].body.name).toBe('has-score');
  });

  it('passes through canonical format with dataType from schema-aware runner', async () => {
    postExperimentScores(
      {
        traceId: 'trace-1',
        result: {
          evals: [
            { name: 'accuracy', score: 1, label: 'PASS', reason: 'Exact match', dataType: 'boolean' },
            { name: 'tone', score: 1, label: 'professional', reason: '', dataType: 'categorical' },
            { name: 'helpfulness', score: 4.2, label: '4.2', reason: 'Good', dataType: 'numeric' },
          ],
        },
      },
      'http://localhost:9418',
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(postedScores.length).toBe(3);

    expect(postedScores[0].body).toEqual({
      resourceId: 'trace-1',
      score: 1,
      label: 'PASS',
      reason: 'Exact match',
      name: 'accuracy',
      type: 'experiment',
      dataType: 'boolean',
    });

    expect(postedScores[1].body).toEqual({
      resourceId: 'trace-1',
      score: 1,
      label: 'professional',
      reason: '',
      name: 'tone',
      type: 'experiment',
      dataType: 'categorical',
    });

    expect(postedScores[2].body).toEqual({
      resourceId: 'trace-1',
      score: 4.2,
      label: '4.2',
      reason: 'Good',
      name: 'helpfulness',
      type: 'experiment',
      dataType: 'numeric',
    });
  });

  it('falls back to legacy derivation when dataType is absent', async () => {
    postExperimentScores(
      {
        traceId: 'trace-1',
        result: {
          evals: [
            { name: 'legacy-eval', passed: true, reason: 'Old style' },
          ],
        },
      },
      'http://localhost:9418',
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(postedScores.length).toBe(1);
    expect(postedScores[0].body).toEqual({
      resourceId: 'trace-1',
      score: 1,
      label: 'PASS',
      reason: 'Old style',
      name: 'legacy-eval',
      type: 'experiment',
      dataType: '',
    });
  });
});
