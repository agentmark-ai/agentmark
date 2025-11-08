import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Runner } from '../../../src/runner-server/types';

// Mock Next.js modules since they're peer dependencies
vi.mock('next/server', () => ({
  NextRequest: class NextRequest {
    constructor(public url: string, public init?: RequestInit) {}
    async json() {
      return JSON.parse((this.init?.body as string) || '{}');
    }
  },
  NextResponse: class NextResponse {
    constructor(public body: any, public init?: ResponseInit) {}
    static json(data: any, init?: ResponseInit) {
      return new NextResponse(JSON.stringify(data), {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      });
    }
  },
}));

describe('runner-server/adapters/nextjs', () => {
  let mockHandler: Runner;
  let createNextAppHandler: any;
  let createNextPagesHandler: any;
  let createNextEdgeHandler: any;

  beforeEach(async () => {
    mockHandler = {
      runPrompt: vi.fn(),
      runExperiment: vi.fn(),
    };

    // Dynamically import the module to use the mocked Next.js
    const module = await import('../../../src/runner-server/adapters/nextjs');
    createNextAppHandler = module.createNextAppHandler;
    createNextPagesHandler = module.createNextPagesHandler;
    createNextEdgeHandler = module.createNextEdgeHandler;
  });

  describe('createNextAppHandler', () => {
    it('should handle successful prompt execution', async () => {
      const mockResponse = {
        type: 'text' as const,
        result: 'Hello from Next.js!',
        usage: { totalTokens: 10 },
      };

      vi.mocked(mockHandler.runPrompt).mockResolvedValue(mockResponse);

      const handler = createNextAppHandler(mockHandler);

      const request = new Request('http://localhost:3000/api/agentmark', {
        method: 'POST',
        body: JSON.stringify({
          type: 'prompt-run',
          data: {
            ast: { type: 'root' },
            customProps: { message: 'Hello' },
          },
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await handler(request as any);

      expect(response).toBeDefined();
      const data = JSON.parse(response.body);
      expect(data).toEqual(mockResponse);
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

      const handler = createNextAppHandler(mockHandler);

      const request = new Request('http://localhost:3000/api/agentmark', {
        method: 'POST',
        body: JSON.stringify({
          type: 'prompt-run',
          data: {
            ast: { type: 'root' },
            options: { shouldStream: true },
          },
        }),
      });

      const response = await handler(request as any);

      expect(response).toBeDefined();
      expect(response.body).toBeInstanceOf(ReadableStream);
    });

    it('should handle validation errors', async () => {
      const handler = createNextAppHandler(mockHandler);

      const request = new Request('http://localhost:3000/api/agentmark', {
        method: 'POST',
        body: JSON.stringify({
          type: 'prompt-run',
          data: {
            ast: null, // Invalid AST
          },
        }),
      });

      const response = await handler(request as any);

      const data = JSON.parse(response.body);
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('Invalid or missing AST object');
    });

    it('should handle invalid JSON', async () => {
      const handler = createNextAppHandler(mockHandler);

      const request = new Request('http://localhost:3000/api/agentmark', {
        method: 'POST',
        body: 'invalid json{',
      });

      const response = await handler(request as any);

      const data = JSON.parse(response.body);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Invalid JSON');
    });

    it('should handle runner errors', async () => {
      vi.mocked(mockHandler.runPrompt).mockRejectedValue(
        new Error('Next.js runner failed')
      );

      const handler = createNextAppHandler(mockHandler);

      const request = new Request('http://localhost:3000/api/agentmark', {
        method: 'POST',
        body: JSON.stringify({
          type: 'prompt-run',
          data: {
            ast: { type: 'root' },
          },
        }),
      });

      const response = await handler(request as any);

      const data = JSON.parse(response.body);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Next.js runner failed');
      expect(data.details).toContain('An unexpected error occurred');
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

      const handler = createNextAppHandler(mockHandler);

      const request = new Request('http://localhost:3000/api/agentmark', {
        method: 'POST',
        body: JSON.stringify({
          type: 'dataset-run',
          data: {
            ast: { type: 'root' },
            experimentId: 'test',
          },
        }),
      });

      const response = await handler(request as any);

      expect(mockHandler.runExperiment).toHaveBeenCalled();
      expect(response.body).toBeInstanceOf(ReadableStream);
    });
  });

  describe('createNextPagesHandler', () => {
    it('should reject non-POST requests', async () => {
      const handler = createNextPagesHandler(mockHandler);

      const req = {
        method: 'GET',
        body: {},
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Method not allowed',
        })
      );
    });

    it('should handle POST requests', async () => {
      const mockResponse = {
        type: 'text' as const,
        result: 'Pages router response',
      };

      vi.mocked(mockHandler.runPrompt).mockResolvedValue(mockResponse);

      const handler = createNextPagesHandler(mockHandler);

      const req = {
        method: 'POST',
        body: {
          type: 'prompt-run',
          data: {
            ast: { type: 'root' },
          },
        },
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        setHeader: vi.fn().mockReturnThis(),
        write: vi.fn().mockReturnThis(),
        end: vi.fn().mockReturnThis(),
        headersSent: false,
      };

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResponse);
    });

    it('should handle streaming in pages router', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('pages chunk'));
          controller.close();
        },
      });

      const mockResponse = {
        type: 'stream' as const,
        stream: mockStream,
        streamHeader: {},
      };

      vi.mocked(mockHandler.runPrompt).mockResolvedValue(mockResponse);

      const handler = createNextPagesHandler(mockHandler);

      const req = {
        method: 'POST',
        body: {
          type: 'prompt-run',
          data: {
            ast: { type: 'root' },
            options: { shouldStream: true },
          },
        },
      };

      const res = {
        setHeader: vi.fn().mockReturnThis(),
        write: vi.fn().mockReturnThis(),
        end: vi.fn().mockReturnThis(),
        headersSent: false,
      };

      await handler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.write).toHaveBeenCalled();
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('createNextEdgeHandler', () => {
    it('should handle requests in edge runtime', async () => {
      const mockResponse = {
        type: 'text' as const,
        result: 'Edge runtime response',
      };

      vi.mocked(mockHandler.runPrompt).mockResolvedValue(mockResponse);

      const handler = createNextEdgeHandler(mockHandler);

      const request = new Request('http://localhost:3000/api/agentmark', {
        method: 'POST',
        body: JSON.stringify({
          type: 'prompt-run',
          data: {
            ast: { type: 'root' },
          },
        }),
      });

      const response = await handler(request);

      expect(response).toBeDefined();
      const data = await response.json();
      expect(data).toEqual(mockResponse);
    });

    it('should handle streaming in edge runtime', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('edge chunk'));
          controller.close();
        },
      });

      const mockResponse = {
        type: 'stream' as const,
        stream: mockStream,
        streamHeader: {},
      };

      vi.mocked(mockHandler.runPrompt).mockResolvedValue(mockResponse);

      const handler = createNextEdgeHandler(mockHandler);

      const request = new Request('http://localhost:3000/api/agentmark', {
        method: 'POST',
        body: JSON.stringify({
          type: 'prompt-run',
          data: {
            ast: { type: 'root' },
            options: { shouldStream: true },
          },
        }),
      });

      const response = await handler(request);

      expect(response).toBeDefined();
      expect(response.body).toBeInstanceOf(ReadableStream);
    });

    it('should handle errors in edge runtime', async () => {
      vi.mocked(mockHandler.runPrompt).mockRejectedValue(
        new Error('Edge runtime error')
      );

      const handler = createNextEdgeHandler(mockHandler);

      const request = new Request('http://localhost:3000/api/agentmark', {
        method: 'POST',
        body: JSON.stringify({
          type: 'prompt-run',
          data: {
            ast: { type: 'root' },
          },
        }),
      });

      const response = await handler(request);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Edge runtime error');
      expect(data.details).toContain('An unexpected error occurred');
    });
  });

  describe('integration tests', () => {
    it('should handle complete request cycle in App Router', async () => {
      const mockResponse = {
        type: 'object' as const,
        result: { name: 'John', age: 30 },
        usage: { totalTokens: 15 },
      };

      vi.mocked(mockHandler.runPrompt).mockResolvedValue(mockResponse);

      const handler = createNextAppHandler(mockHandler);

      const request = new Request('http://localhost:3000/api/agentmark', {
        method: 'POST',
        body: JSON.stringify({
          type: 'prompt-run',
          data: {
            ast: {
              type: 'root',
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', value: 'Test Next.js prompt' }],
                },
              ],
            },
            customProps: {
              userId: '123',
            },
          },
        }),
      });

      const response = await handler(request as any);

      expect(mockHandler.runPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'root',
        }),
        expect.objectContaining({
          customProps: { userId: '123' },
        })
      );

      const data = JSON.parse(response.body);
      expect(data).toEqual(mockResponse);
    });
  });
});
