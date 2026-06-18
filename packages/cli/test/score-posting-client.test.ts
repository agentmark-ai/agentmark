import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CreateScoreBodySchema } from '@agentmark-ai/api-schemas';
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
      resource_id: 'abc123',
      score: 0.9,
      label: 'PASS',
      reason: 'Good match',
      name: 'quality',
      type: 'experiment',
      source: 'experiment',
      data_type: '',
    });

    expect(postedScores[1].body).toEqual({
      resource_id: 'abc123',
      score: 0.8,
      label: 'PASS',
      reason: '',
      name: 'relevance',
      type: 'experiment',
      source: 'experiment',
      data_type: '',
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
      resource_id: 'trace-1',
      score: 0,
      label: 'FAIL',
      reason: 'Mismatch',
      name: 'accuracy',
      type: 'experiment',
      source: 'experiment',
      data_type: '',
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
            // Eval-result shape (camelCase) is the application's internal
            // type — see EvalResult in postExperimentScores. The wire body
            // emits `data_type` (snake_case) per CreateScoreBodySchema.
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
      resource_id: 'trace-1',
      score: 1,
      label: 'PASS',
      reason: 'Exact match',
      name: 'accuracy',
      type: 'experiment',
      source: 'experiment',
      data_type: 'boolean',
    });

    expect(postedScores[1].body).toEqual({
      resource_id: 'trace-1',
      score: 1,
      label: 'professional',
      reason: '',
      name: 'tone',
      type: 'experiment',
      source: 'experiment',
      data_type: 'categorical',
    });

    expect(postedScores[2].body).toEqual({
      resource_id: 'trace-1',
      score: 4.2,
      label: '4.2',
      reason: 'Good',
      name: 'helpfulness',
      type: 'experiment',
      source: 'experiment',
      data_type: 'numeric',
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
      resource_id: 'trace-1',
      score: 1,
      label: 'PASS',
      reason: 'Old style',
      name: 'legacy-eval',
      type: 'experiment',
      source: 'experiment',
      data_type: '',
    });
  });
});

// ---------------------------------------------------------------------------
// Hardening — contract test against the canonical schema.
//
// Pre-2026-05 the wire body used camelCase keys (`resourceId`, `dataType`).
// CreateScoreBodySchema declares snake_case (`resource_id`, `data_type`); Zod
// silently strips unknown keys, so the bug was invisible at the unit level
// and the POST landed at the endpoint with a missing required field. The
// scores never persisted but client-side eval execution still printed
// "PASS", masking the failure.
//
// This test imports the schema directly and asserts every POST body
// emitted by postExperimentScores parses cleanly against it. Any future
// camelCase regression fails this gate, not at "users find empty
// Evaluations tabs in production."
// ---------------------------------------------------------------------------

describe('postExperimentScores — schema contract', () => {
  let postedBodies: any[];
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    postedBodies = [];
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (_, options) => {
      if (options?.method === 'POST' && options.body) {
        postedBodies.push(JSON.parse(options.body as string));
      }
      return new Response('OK', { status: 200 });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('every emitted body parses against CreateScoreBodySchema', async () => {
    postExperimentScores(
      {
        traceId: 'trace-contract-1',
        result: {
          evals: [
            // Canonical-format eval (post 1bba0911d unify): score+label+dataType.
            { name: 'accuracy', score: 1, label: 'PASS', reason: 'Exact', dataType: 'boolean' },
            // Legacy-format eval: passed-only, derives score+label.
            { name: 'legacy', passed: false },
            // Numeric data_type with non-binary value.
            { name: 'helpfulness', score: 4.2, label: '4.2', reason: '', dataType: 'numeric' },
          ],
        },
      },
      'http://localhost:9418',
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(postedBodies.length).toBe(3);
    for (const body of postedBodies) {
      // The schema is the source of truth for the POST contract. Each body
      // must parse cleanly — no extra/missing/wrong-case keys, all required
      // fields present, types match. Failure here is the early signal for
      // any future shape drift.
      const parsed = CreateScoreBodySchema.safeParse(body);
      expect(parsed.success, `body did not match CreateScoreBodySchema: ${JSON.stringify(body)} — issue: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it('does not include legacy camelCase keys in the body', async () => {
    // Belt-and-suspenders: assert the historical wrong keys never appear.
    postExperimentScores(
      {
        traceId: 'trace-contract-2',
        result: {
          evals: [{ name: 'q', score: 1, label: 'PASS', reason: '', dataType: 'boolean' }],
        },
      },
      'http://localhost:9418',
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(postedBodies.length).toBe(1);
    const keys = Object.keys(postedBodies[0]);
    expect(keys).not.toContain('resourceId');
    expect(keys).not.toContain('dataType');
    expect(keys).toContain('resource_id');
    expect(keys).toContain('data_type');
  });
});
