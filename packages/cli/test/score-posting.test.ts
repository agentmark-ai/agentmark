import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleWebhookRequest } from '../cli-src/runner-server/core';
import type { WebhookHandler } from '../cli-src/runner-server/types';

describe('score-posting', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let postedScores: Array<{ url: string; body: any }>;

  beforeEach(() => {
    postedScores = [];
    // Mock fetch to capture score POST requests
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      if (typeof url === 'string' && url.includes('/v1/score') && options?.method === 'POST') {
        const body = JSON.parse(options.body as string);
        postedScores.push({ url, body });
        return new Response(JSON.stringify({ id: 'score-123', message: 'Score created' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('Not found', { status: 404 });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('wrapStreamWithScorePosting', () => {
    it('posts scores for dataset events with evals', async () => {
      // Create a mock stream with dataset events containing evals
      const events = [
        {
          type: 'dataset',
          traceId: 'trace-123',
          result: {
            input: { question: 'test' },
            actualOutput: 'answer',
            evals: [
              { name: 'accuracy', score: 0.9, label: 'PASS', reason: 'Good match', passed: true },
              { name: 'relevance', score: 0.8, passed: true }
            ]
          },
          runId: 'run-123'
        },
        {
          type: 'dataset',
          traceId: 'trace-456',
          result: {
            input: { question: 'test2' },
            actualOutput: 'answer2',
            evals: [
              { name: 'accuracy', passed: false, reason: 'Mismatch' }
            ]
          },
          runId: 'run-123'
        }
      ];

      const streamContent = events.map(e => JSON.stringify(e) + '\n').join('');
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(streamContent));
          controller.close();
        }
      });

      // Create a mock handler that returns our mock stream
      const mockHandler: WebhookHandler = {
        runPrompt: vi.fn(),
        runExperiment: vi.fn().mockResolvedValue({
          stream: mockStream,
          streamHeaders: { 'AgentMark-Streaming': 'true' }
        })
      };

      // Call handleWebhookRequest with a dataset-run
      const response = await handleWebhookRequest(
        {
          type: 'dataset-run',
          data: {
            ast: { type: 'root', children: [] },
            experimentId: 'test-experiment'
          }
        },
        mockHandler
      );

      expect(response.type).toBe('stream');

      // Consume the wrapped stream to trigger score posting
      if (response.type === 'stream' && response.stream) {
        const reader = response.stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        // Verify the stream content is passed through unchanged
        const decoder = new TextDecoder();
        const output = chunks.map(c => decoder.decode(c)).join('');
        expect(output).toBe(streamContent);
      }

      // Wait a bit for async score posting to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify scores were posted
      expect(postedScores.length).toBe(3);

      // First eval from first event
      expect(postedScores[0].body).toEqual({
        resourceId: 'trace-123',
        score: 0.9,
        label: 'PASS',
        reason: 'Good match',
        name: 'accuracy',
        type: 'experiment'
      });

      // Second eval from first event (derives label from passed)
      expect(postedScores[1].body).toEqual({
        resourceId: 'trace-123',
        score: 0.8,
        label: 'PASS',
        reason: '',
        name: 'relevance',
        type: 'experiment'
      });

      // Eval from second event (failed)
      expect(postedScores[2].body).toEqual({
        resourceId: 'trace-456',
        score: 0,
        label: 'FAIL',
        reason: 'Mismatch',
        name: 'accuracy',
        type: 'experiment'
      });
    });

    it('does not post scores for events without traceId', async () => {
      const events = [
        {
          type: 'dataset',
          // No traceId
          result: {
            evals: [{ name: 'test', passed: true }]
          }
        }
      ];

      const streamContent = events.map(e => JSON.stringify(e) + '\n').join('');
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(streamContent));
          controller.close();
        }
      });

      const mockHandler: WebhookHandler = {
        runPrompt: vi.fn(),
        runExperiment: vi.fn().mockResolvedValue({
          stream: mockStream,
          streamHeaders: {}
        })
      };

      const response = await handleWebhookRequest(
        {
          type: 'dataset-run',
          data: { ast: { type: 'root', children: [] } }
        },
        mockHandler
      );

      if (response.type === 'stream' && response.stream) {
        const reader = response.stream.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // No scores should be posted
      expect(postedScores.length).toBe(0);
    });

    it('does not post scores for events without evals', async () => {
      const events = [
        {
          type: 'dataset',
          traceId: 'trace-123',
          result: {
            input: {},
            actualOutput: 'test',
            evals: [] // Empty evals array
          }
        }
      ];

      const streamContent = events.map(e => JSON.stringify(e) + '\n').join('');
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(streamContent));
          controller.close();
        }
      });

      const mockHandler: WebhookHandler = {
        runPrompt: vi.fn(),
        runExperiment: vi.fn().mockResolvedValue({
          stream: mockStream,
          streamHeaders: {}
        })
      };

      const response = await handleWebhookRequest(
        {
          type: 'dataset-run',
          data: { ast: { type: 'root', children: [] } }
        },
        mockHandler
      );

      if (response.type === 'stream' && response.stream) {
        const reader = response.stream.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(postedScores.length).toBe(0);
    });

    it('continues processing when score posting fails', async () => {
      // Make fetch fail for score posting
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const events = [
        {
          type: 'dataset',
          traceId: 'trace-123',
          result: {
            evals: [{ name: 'test', passed: true }]
          }
        }
      ];

      const streamContent = events.map(e => JSON.stringify(e) + '\n').join('');
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(streamContent));
          controller.close();
        }
      });

      const mockHandler: WebhookHandler = {
        runPrompt: vi.fn(),
        runExperiment: vi.fn().mockResolvedValue({
          stream: mockStream,
          streamHeaders: {}
        })
      };

      const response = await handleWebhookRequest(
        {
          type: 'dataset-run',
          data: { ast: { type: 'root', children: [] } }
        },
        mockHandler
      );

      // Stream should still work even if score posting fails
      expect(response.type).toBe('stream');

      if (response.type === 'stream' && response.stream) {
        const reader = response.stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        const decoder = new TextDecoder();
        const output = chunks.map(c => decoder.decode(c)).join('');
        expect(output).toBe(streamContent);
      }
    });

    it('handles chunked stream data correctly', async () => {
      const event = {
        type: 'dataset',
        traceId: 'trace-chunked',
        result: {
          evals: [{ name: 'chunked-eval', passed: true, score: 1 }]
        }
      };

      const eventStr = JSON.stringify(event) + '\n';

      // Split the event into multiple chunks
      const chunk1 = eventStr.slice(0, 20);
      const chunk2 = eventStr.slice(20);

      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(chunk1));
          controller.enqueue(new TextEncoder().encode(chunk2));
          controller.close();
        }
      });

      const mockHandler: WebhookHandler = {
        runPrompt: vi.fn(),
        runExperiment: vi.fn().mockResolvedValue({
          stream: mockStream,
          streamHeaders: {}
        })
      };

      const response = await handleWebhookRequest(
        {
          type: 'dataset-run',
          data: { ast: { type: 'root', children: [] } }
        },
        mockHandler
      );

      if (response.type === 'stream' && response.stream) {
        const reader = response.stream.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Score should still be posted even with chunked data
      expect(postedScores.length).toBe(1);
      expect(postedScores[0].body.name).toBe('chunked-eval');
    });

    it('uses AGENTMARK_API_PORT environment variable', async () => {
      const originalPort = process.env.AGENTMARK_API_PORT;
      process.env.AGENTMARK_API_PORT = '9999';

      try {
        const events = [
          {
            type: 'dataset',
            traceId: 'trace-port-test',
            result: {
              evals: [{ name: 'port-test', passed: true }]
            }
          }
        ];

        const streamContent = events.map(e => JSON.stringify(e) + '\n').join('');
        const mockStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(streamContent));
            controller.close();
          }
        });

        const mockHandler: WebhookHandler = {
          runPrompt: vi.fn(),
          runExperiment: vi.fn().mockResolvedValue({
            stream: mockStream,
            streamHeaders: {}
          })
        };

        const response = await handleWebhookRequest(
          {
            type: 'dataset-run',
            data: { ast: { type: 'root', children: [] } }
          },
          mockHandler
        );

        if (response.type === 'stream' && response.stream) {
          const reader = response.stream.getReader();
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(postedScores.length).toBe(1);
        expect(postedScores[0].url).toBe('http://localhost:9999/v1/score');
      } finally {
        if (originalPort !== undefined) {
          process.env.AGENTMARK_API_PORT = originalPort;
        } else {
          delete process.env.AGENTMARK_API_PORT;
        }
      }
    });
  });
});
