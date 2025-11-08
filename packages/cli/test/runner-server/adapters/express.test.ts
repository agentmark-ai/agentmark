import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createExpressMiddleware, createWebhookServer } from '../../../src/runner-server/adapters/express';
import type { Runner } from '../../../src/runner-server/types';
import type { Request, Response } from 'express';

// Mock Express request/response
function createMockRequest(body: any = {}): Partial<Request> {
  return {
    body,
    method: 'POST',
    url: '/',
  };
}

function createMockResponse(): Partial<Response> {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    headersSent: false,
  };
  return res;
}

describe('runner-server/adapters/express', () => {
  let mockHandler: Runner;

  beforeEach(() => {
    mockHandler = {
      runPrompt: vi.fn(),
      runExperiment: vi.fn(),
    };
  });

  describe('createExpressMiddleware', () => {
    it('should handle successful prompt execution', async () => {
      const mockResponse = {
        type: 'text' as const,
        result: 'Hello, world!',
        usage: { totalTokens: 10 },
      };

      vi.mocked(mockHandler.runPrompt).mockResolvedValue(mockResponse);

      const middleware = createExpressMiddleware(mockHandler);
      const req = createMockRequest({
        type: 'prompt-run',
        data: {
          ast: { type: 'root' },
          customProps: { message: 'Hello' },
        },
      }) as Request;
      const res = createMockResponse() as Response;

      await middleware(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResponse);
    });

    it('should handle streaming responses', async () => {
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

      const middleware = createExpressMiddleware(mockHandler);
      const req = createMockRequest({
        type: 'prompt-run',
        data: {
          ast: { type: 'root' },
          options: { shouldStream: true },
        },
      }) as Request;
      const res = createMockResponse() as Response;

      await middleware(req, res, vi.fn());

      expect(res.setHeader).toHaveBeenCalledWith('AgentMark-Streaming', 'true');
      expect(res.write).toHaveBeenCalledTimes(2);
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle validation errors', async () => {
      const middleware = createExpressMiddleware(mockHandler);
      const req = createMockRequest({
        type: 'prompt-run',
        data: {
          ast: null, // Invalid AST
        },
      }) as Request;
      const res = createMockResponse() as Response;

      await middleware(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid or missing AST object',
        })
      );
    });

    it('should handle runner errors', async () => {
      vi.mocked(mockHandler.runPrompt).mockRejectedValue(
        new Error('Runner failed')
      );

      const middleware = createExpressMiddleware(mockHandler);
      const req = createMockRequest({
        type: 'prompt-run',
        data: {
          ast: { type: 'root' },
        },
      }) as Request;
      const res = createMockResponse() as Response;

      await middleware(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Runner failed',
        })
      );
    });

    it('should handle empty request body', async () => {
      const middleware = createExpressMiddleware(mockHandler);
      const req = createMockRequest(null) as Request;
      const res = createMockResponse() as Response;

      await middleware(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
    });

    it('should handle streaming with multiple chunks', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('chunk1'));
          controller.enqueue(new TextEncoder().encode('chunk2'));
          controller.enqueue(new TextEncoder().encode('chunk3'));
          controller.close();
        },
      });

      const mockResponse = {
        type: 'stream' as const,
        stream: mockStream,
        streamHeader: { 'X-Custom-Header': 'test' },
      };

      vi.mocked(mockHandler.runPrompt).mockResolvedValue(mockResponse);

      const middleware = createExpressMiddleware(mockHandler);
      const req = createMockRequest({
        type: 'prompt-run',
        data: {
          ast: { type: 'root' },
          options: { shouldStream: true },
        },
      }) as Request;
      const res = createMockResponse() as Response;

      await middleware(req, res, vi.fn());

      // Should set all headers including custom ones
      expect(res.setHeader).toHaveBeenCalledWith('X-Custom-Header', 'test');
      // Should write all chunks
      expect(res.write).toHaveBeenCalledWith('chunk1');
      expect(res.write).toHaveBeenCalledWith('chunk2');
      expect(res.write).toHaveBeenCalledWith('chunk3');
      expect(res.write).toHaveBeenCalledTimes(3);
      // Should end after all chunks
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle dataset-run requests', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ type: 'dataset', result: {} })
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

      const middleware = createExpressMiddleware(mockHandler);
      const req = createMockRequest({
        type: 'dataset-run',
        data: {
          ast: { type: 'root' },
          experimentId: 'test',
        },
      }) as Request;
      const res = createMockResponse() as Response;

      await middleware(req, res, vi.fn());

      expect(mockHandler.runExperiment).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('AgentMark-Streaming', 'true');
      expect(res.end).toHaveBeenCalled();
    });

    it('should decode Uint8Array chunks to strings', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([72, 101, 108, 108, 111])); // "Hello"
          controller.close();
        },
      });

      const mockResponse = {
        type: 'stream' as const,
        stream: mockStream,
        streamHeader: {},
      };

      vi.mocked(mockHandler.runPrompt).mockResolvedValue(mockResponse);

      const middleware = createExpressMiddleware(mockHandler);
      const req = createMockRequest({
        type: 'prompt-run',
        data: {
          ast: { type: 'root' },
          options: { shouldStream: true },
        },
      }) as Request;
      const res = createMockResponse() as Response;

      await middleware(req, res, vi.fn());

      expect(res.write).toHaveBeenCalledWith('Hello');
    });

    it('should handle catch-all errors', async () => {
      // Simulate an error thrown during request processing
      const middleware = createExpressMiddleware(mockHandler);
      const req = createMockRequest({
        type: 'prompt-run',
        data: {
          // Intentionally create a scenario that might throw
          get ast() {
            throw new Error('Property access error');
          },
        },
      }) as Request;
      const res = createMockResponse() as Response;

      await middleware(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Property access error',
          details: expect.stringContaining('An unexpected error occurred'),
        })
      );
    });
  });

  describe('createWebhookServer', () => {
    it('should create a server and start listening', async () => {
      const server = await createWebhookServer({
        port: 0, // Use 0 to get random available port
        runner: mockHandler,
      });

      expect(server).toBeDefined();
      expect(server.listening).toBe(true);

      // Clean up
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    it('should accept custom options', async () => {
      const server = await createWebhookServer({
        port: 0,
        runner: mockHandler,
        fileServerUrl: 'http://localhost:9418',
        templatesDirectory: './custom-templates',
      });

      expect(server).toBeDefined();

      // Clean up
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });
  });

  describe('integration tests', () => {
    it('should handle a complete request/response cycle', async () => {
      const mockResponse = {
        type: 'text' as const,
        result: 'Integration test response',
        usage: { totalTokens: 20 },
      };

      vi.mocked(mockHandler.runPrompt).mockResolvedValue(mockResponse);

      const middleware = createExpressMiddleware(mockHandler);
      const req = createMockRequest({
        type: 'prompt-run',
        data: {
          ast: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: 'Test prompt' }],
              },
            ],
          },
          customProps: {
            userInput: 'Test input',
          },
          options: {
            shouldStream: false,
          },
        },
      }) as Request;
      const res = createMockResponse() as Response;

      await middleware(req, res, vi.fn());

      // Verify the runner was called with correct arguments
      expect(mockHandler.runPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'root',
        }),
        expect.objectContaining({
          shouldStream: false,
          customProps: { userInput: 'Test input' },
        })
      );

      // Verify the response
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResponse);
    });
  });
});
