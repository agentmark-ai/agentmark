import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleWebhookRequest } from '../../src/runner-server/core';
import type { WebhookHandler, WebhookRequest } from '../../src/runner-server/types';

describe('runner-server/core', () => {
  let mockHandler: WebhookHandler;

  beforeEach(() => {
    // Create a mock webhook handler for testing
    mockHandler = {
      runPrompt: vi.fn(),
      runExperiment: vi.fn(),
    };
  });

  describe('handleWebhookRequest', () => {
    describe('validation', () => {
      it('should return error if ast is missing', async () => {
        const request: WebhookRequest = {
          type: 'prompt-run',
          data: {
            ast: undefined as any,
          },
        };

        const result = await handleWebhookRequest(request, mockHandler);

        expect(result.type).toBe('error');
        expect(result).toMatchObject({
          type: 'error',
          error: 'Invalid or missing AST object',
          status: 400,
        });
      });

      it('should return error if ast is not an object', async () => {
        const request: WebhookRequest = {
          type: 'prompt-run',
          data: {
            ast: 'invalid-ast-string' as any,
          },
        };

        const result = await handleWebhookRequest(request, mockHandler);

        expect(result.type).toBe('error');
        expect(result).toMatchObject({
          type: 'error',
          error: 'Invalid or missing AST object',
          status: 400,
        });
      });

      it('should return error for unknown event type', async () => {
        const request: WebhookRequest = {
          type: 'unknown-type' as any,
          data: {
            ast: { type: 'root' },
          },
        };

        const result = await handleWebhookRequest(request, mockHandler);

        expect(result.type).toBe('error');
        expect(result).toMatchObject({
          type: 'error',
          error: 'Unknown event type',
          status: 400,
        });
      });
    });

    describe('prompt-run', () => {
      it('should handle text response successfully', async () => {
        const mockResponse = {
          type: 'text' as const,
          result: 'Hello, world!',
          usage: { totalTokens: 10 },
          finishReason: 'stop',
        };

        vi.mocked(mockHandler.runPrompt).mockResolvedValue(mockResponse);

        const request: WebhookRequest = {
          type: 'prompt-run',
          data: {
            ast: { type: 'root', children: [] },
            customProps: { userMessage: 'Hello' },
            options: { shouldStream: false },
          },
        };

        const result = await handleWebhookRequest(request, mockHandler);

        expect(result.type).toBe('json');
        expect(mockHandler.runPrompt).toHaveBeenCalledWith(
          { type: 'root', children: [] },
          {
            shouldStream: false,
            customProps: { userMessage: 'Hello' },
          }
        );

        if (result.type === 'json') {
          expect(result.data).toEqual(mockResponse);
          expect(result.status).toBe(200);
        }
      });

      it('should handle object response successfully', async () => {
        const mockResponse = {
          type: 'object' as const,
          result: { name: 'John', age: 30 },
          usage: { totalTokens: 15 },
          finishReason: 'stop',
        };

        vi.mocked(mockHandler.runPrompt).mockResolvedValue(mockResponse);

        const request: WebhookRequest = {
          type: 'prompt-run',
          data: {
            ast: { type: 'root' },
          },
        };

        const result = await handleWebhookRequest(request, mockHandler);

        expect(result.type).toBe('json');
        if (result.type === 'json') {
          expect(result.data).toEqual(mockResponse);
        }
      });

      it('should handle stream response successfully', async () => {
        const mockStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('chunk1'));
            controller.enqueue(new TextEncoder().encode('chunk2'));
            controller.close();
          },
        });

        const mockResponse = {
          type: 'stream' as const,
          stream: mockStream,
          streamHeader: { 'AgentMark-Streaming': 'true' },
        };

        vi.mocked(mockHandler.runPrompt).mockResolvedValue(mockResponse);

        const request: WebhookRequest = {
          type: 'prompt-run',
          data: {
            ast: { type: 'root' },
            options: { shouldStream: true },
          },
        };

        const result = await handleWebhookRequest(request, mockHandler);

        expect(result.type).toBe('stream');
        if (result.type === 'stream') {
          expect(result.stream).toBe(mockStream);
          expect(result.headers).toEqual({ 'AgentMark-Streaming': 'true' });
        }
      });

      it('should use default streaming header if not provided', async () => {
        const mockStream = new ReadableStream();

        const mockResponse = {
          type: 'stream' as const,
          stream: mockStream,
        };

        vi.mocked(mockHandler.runPrompt).mockResolvedValue(mockResponse);

        const request: WebhookRequest = {
          type: 'prompt-run',
          data: {
            ast: { type: 'root' },
          },
        };

        const result = await handleWebhookRequest(request, mockHandler);

        expect(result.type).toBe('stream');
        if (result.type === 'stream') {
          expect(result.headers).toEqual({ 'AgentMark-Streaming': 'true' });
        }
      });

      it('should handle runner errors', async () => {
        vi.mocked(mockHandler.runPrompt).mockRejectedValue(
          new Error('Runner execution failed')
        );

        const request: WebhookRequest = {
          type: 'prompt-run',
          data: {
            ast: { type: 'root' },
          },
        };

        const result = await handleWebhookRequest(request, mockHandler);

        expect(result.type).toBe('error');
        if (result.type === 'error') {
          expect(result.error).toBe('Runner execution failed');
          expect(result.status).toBe(500);
        }
      });
    });

    describe('dataset-run', () => {
      it('should handle experiment successfully', async () => {
        const mockStream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({
                  type: 'dataset',
                  result: {
                    input: 'test input',
                    expectedOutput: 'expected',
                    actualOutput: 'actual',
                    tokens: 10,
                    evals: [{ name: 'exact_match', passed: true }],
                  },
                })
              )
            );
            controller.close();
          },
        });

        const mockResponse = {
          stream: mockStream,
          streamHeaders: { 'AgentMark-Streaming': 'true' },
        };

        vi.mocked(mockHandler.runExperiment).mockResolvedValue(mockResponse);

        const request: WebhookRequest = {
          type: 'dataset-run',
          data: {
            ast: { type: 'root' },
            experimentId: 'test-experiment',
            datasetPath: './dataset.json',
          },
        };

        const result = await handleWebhookRequest(request, mockHandler);

        expect(result.type).toBe('stream');
        expect(mockHandler.runExperiment).toHaveBeenCalledWith(
          { type: 'root' },
          'test-experiment',
          './dataset.json'
        );

        if (result.type === 'stream') {
          expect(result.stream).toBe(mockStream);
          expect(result.headers).toEqual({ 'AgentMark-Streaming': 'true' });
        }
      });

      it('should use default experiment ID if not provided', async () => {
        const mockStream = new ReadableStream();
        const mockResponse = {
          stream: mockStream,
          streamHeaders: {},
        };

        vi.mocked(mockHandler.runExperiment).mockResolvedValue(mockResponse);

        const request: WebhookRequest = {
          type: 'dataset-run',
          data: {
            ast: { type: 'root' },
          },
        };

        await handleWebhookRequest(request, mockHandler);

        expect(mockHandler.runExperiment).toHaveBeenCalledWith(
          { type: 'root' },
          'local-experiment',
          undefined
        );
      });

      it('should handle experiment errors', async () => {
        vi.mocked(mockHandler.runExperiment).mockRejectedValue(
          new Error('Dataset processing failed')
        );

        const request: WebhookRequest = {
          type: 'dataset-run',
          data: {
            ast: { type: 'root' },
          },
        };

        const result = await handleWebhookRequest(request, mockHandler);

        expect(result.type).toBe('error');
        if (result.type === 'error') {
          expect(result.error).toBe('Dataset processing failed');
          expect(result.details).toContain('error occurred while running the experiment');
          expect(result.status).toBe(500);
        }
      });

      it('should return error if experiment does not return stream', async () => {
        const mockResponse = {
          stream: null as any,
        };

        vi.mocked(mockHandler.runExperiment).mockResolvedValue(mockResponse);

        const request: WebhookRequest = {
          type: 'dataset-run',
          data: {
            ast: { type: 'root' },
          },
        };

        const result = await handleWebhookRequest(request, mockHandler);

        expect(result.type).toBe('error');
        if (result.type === 'error') {
          expect(result.error).toBe('Expected stream from dataset-run');
          expect(result.status).toBe(500);
        }
      });
    });

    describe('error handling', () => {
      it('should handle unexpected errors gracefully', async () => {
        vi.mocked(mockHandler.runPrompt).mockImplementation(() => {
          throw new Error('Unexpected error');
        });

        const request: WebhookRequest = {
          type: 'prompt-run',
          data: {
            ast: { type: 'root' },
          },
        };

        const result = await handleWebhookRequest(request, mockHandler);

        expect(result.type).toBe('error');
        if (result.type === 'error') {
          expect(result.error).toBe('Unexpected error');
          expect(result.details).toContain('unexpected error');
          expect(result.status).toBe(500);
        }
      });

      it('should handle non-Error exceptions', async () => {
        vi.mocked(mockHandler.runPrompt).mockImplementation(() => {
          throw 'string error';
        });

        const request: WebhookRequest = {
          type: 'prompt-run',
          data: {
            ast: { type: 'root' },
          },
        };

        const result = await handleWebhookRequest(request, mockHandler);

        expect(result.type).toBe('error');
        if (result.type === 'error') {
          expect(result.error).toBe('string error');
          expect(result.status).toBe(500);
        }
      });
    });
  });
});
