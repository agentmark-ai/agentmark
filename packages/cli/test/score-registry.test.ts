import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleWebhookRequest } from '../cli-src/runner-server/core';
import type { WebhookHandler } from '../cli-src/runner-server/types';

describe('score-registry eval resolution', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let postedScores: Array<{ url: string; body: any }>;

  beforeEach(() => {
    postedScores = [];
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      if (typeof url === 'string' && url.includes('/v1/score') && options?.method === 'POST') {
        const body = JSON.parse(options.body as string);
        postedScores.push({ url, body });
        return new Response(JSON.stringify({ id: 'score-123', message: 'Score created' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('posts scores from dataset run eval results', async () => {
    const handler: WebhookHandler = {
      runPrompt: vi.fn(),
      runExperiment: vi.fn().mockResolvedValue({
        stream: new ReadableStream({
          start(controller) {
            const chunk = JSON.stringify({
              type: 'dataset',
              traceId: 'trace-1',
              result: {
                evals: [{ name: 'accuracy', passed: true, reason: 'matched' }],
              },
            });
            controller.enqueue(new TextEncoder().encode(chunk + '\n'));
            controller.close();
          },
        }),
        streamHeaders: { 'AgentMark-Streaming': 'true' },
      }),
    };

    const response = await handleWebhookRequest(
      {
        type: 'dataset-run',
        data: { ast: { type: 'root', children: [] }, promptPath: 'test', datasetPath: 'test.jsonl' },
      },
      handler
    );

    expect(response.type).toBe('stream');

    // Consume the stream to trigger score posting
    if (response.type === 'stream' && response.stream) {
      const reader = response.stream.getReader();
      while (!(await reader.read()).done) {}
    }

    // Wait for fire-and-forget score post
    await new Promise((r) => setTimeout(r, 100));

    expect(postedScores.length).toBe(1);
    expect(postedScores[0].body).toEqual({
      resourceId: 'trace-1',
      score: 1,
      label: 'PASS',
      reason: 'matched',
      name: 'accuracy',
      type: 'experiment',
    });
  });

  it('posts scores for multiple evals across multiple dataset events', async () => {
    const events = [
      {
        type: 'dataset',
        traceId: 'trace-1',
        result: {
          evals: [
            { name: 'accuracy', passed: true, score: 0.95, reason: 'exact match' },
            { name: 'relevance', passed: true, score: 0.8 },
          ],
        },
      },
      {
        type: 'dataset',
        traceId: 'trace-2',
        result: {
          evals: [{ name: 'accuracy', passed: false, reason: 'mismatch' }],
        },
      },
    ];

    const streamContent = events.map((e) => JSON.stringify(e) + '\n').join('');

    const handler: WebhookHandler = {
      runPrompt: vi.fn(),
      runExperiment: vi.fn().mockResolvedValue({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(streamContent));
            controller.close();
          },
        }),
        streamHeaders: { 'AgentMark-Streaming': 'true' },
      }),
    };

    const response = await handleWebhookRequest(
      {
        type: 'dataset-run',
        data: { ast: { type: 'root', children: [] } },
      },
      handler
    );

    if (response.type === 'stream' && response.stream) {
      const reader = response.stream.getReader();
      while (!(await reader.read()).done) {}
    }

    await new Promise((r) => setTimeout(r, 100));

    expect(postedScores.length).toBe(3);

    // First eval from first event
    expect(postedScores[0].body).toEqual({
      resourceId: 'trace-1',
      score: 0.95,
      label: 'PASS',
      reason: 'exact match',
      name: 'accuracy',
      type: 'experiment',
    });

    // Second eval from first event
    expect(postedScores[1].body).toEqual({
      resourceId: 'trace-1',
      score: 0.8,
      label: 'PASS',
      reason: '',
      name: 'relevance',
      type: 'experiment',
    });

    // Eval from second event (failed)
    expect(postedScores[2].body).toEqual({
      resourceId: 'trace-2',
      score: 0,
      label: 'FAIL',
      reason: 'mismatch',
      name: 'accuracy',
      type: 'experiment',
    });
  });

  it('ignores non-dataset events in the stream', async () => {
    const events = [
      { type: 'progress', message: 'Running...' },
      {
        type: 'dataset',
        traceId: 'trace-1',
        result: {
          evals: [{ name: 'accuracy', passed: true }],
        },
      },
      { type: 'complete', summary: { total: 1 } },
    ];

    const streamContent = events.map((e) => JSON.stringify(e) + '\n').join('');

    const handler: WebhookHandler = {
      runPrompt: vi.fn(),
      runExperiment: vi.fn().mockResolvedValue({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(streamContent));
            controller.close();
          },
        }),
        streamHeaders: {},
      }),
    };

    const response = await handleWebhookRequest(
      {
        type: 'dataset-run',
        data: { ast: { type: 'root', children: [] } },
      },
      handler
    );

    if (response.type === 'stream' && response.stream) {
      const reader = response.stream.getReader();
      while (!(await reader.read()).done) {}
    }

    await new Promise((r) => setTimeout(r, 100));

    // Only the dataset event with evals should produce a score post
    expect(postedScores.length).toBe(1);
    expect(postedScores[0].body.name).toBe('accuracy');
  });
});
