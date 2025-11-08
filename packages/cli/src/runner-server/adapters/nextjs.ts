/**
 * Next.js adapter for AgentMark webhook server.
 * Compatible with Next.js App Router (Next.js 13+) and supports streaming.
 *
 * NOTE: This module requires Next.js to be installed as a peer dependency.
 * It will only work in Next.js projects that have 'next' installed.
 *
 * Installation:
 * ```bash
 * npm install next
 * ```
 */

// @ts-ignore - Next.js types are peer dependencies
import { NextRequest, NextResponse } from 'next/server';
import { handleWebhookRequest } from '../core';
import type { WebhookHandler } from '../types';

/**
 * Creates a Next.js App Router handler for AgentMark webhook requests.
 * Use this as your POST handler in app/api/[route]/route.ts
 *
 * @example
 * ```typescript
 * // app/api/agentmark/route.ts
 * import { createNextAppHandler } from '@agentmark/cli/runner-server/adapters/nextjs';
 * import { VercelAdapterWebhookHandler } from '@agentmark/ai-sdk-v4-adapter/runner';
 * import { agentmarkClient } from '@/lib/agentmark-config';
 *
 * const handler = new VercelAdapterWebhookHandler(agentmarkClient);
 *
 * export const POST = createNextAppHandler(handler);
 *
 * // Optional: Add GET for health check
 * export async function GET() {
 *   return Response.json({
 *     status: 'healthy',
 *     service: 'AgentMark Webhook'
 *   });
 * }
 * ```
 *
 * @param handler - The webhook handler instance (e.g., VercelAdapterWebhookHandler)
 * @returns A Next.js App Router handler function
 */
export function createNextAppHandler(handler: WebhookHandler) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // Parse request body
      let body;
      try {
        body = await request.json();
      } catch (parseError) {
        return NextResponse.json(
          {
            error: 'Invalid JSON',
            details: 'Request body must be valid JSON'
          },
          { status: 400 }
        );
      }

      // Call platform-agnostic core handler
      const result = await handleWebhookRequest(body, handler);

      // Handle error responses
      if (result.type === 'error') {
        return NextResponse.json(
          {
            error: result.error,
            details: result.details
          },
          { status: result.status }
        );
      }

      // Handle streaming responses
      if (result.type === 'stream') {
        // Next.js supports native streaming via Response API
        return new NextResponse(result.stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            ...result.headers
          }
        });
      }

      // Handle regular JSON responses
      return NextResponse.json(result.data, {
        status: result.status || 200
      });

    } catch (error) {
      console.error('Next.js adapter error:', error);

      return NextResponse.json(
        {
          error: 'Internal server error',
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Alternative: Pages Router handler (for Next.js 12 and below)
 * Use this in pages/api/[route].ts
 *
 * @example
 * ```typescript
 * // pages/api/agentmark.ts
 * import type { NextApiRequest, NextApiResponse } from 'next';
 * import { createNextPagesHandler } from '@agentmark/cli/runner-server/adapters/nextjs';
 * import { handler } from '@/lib/agentmark-config';
 *
 * export default createNextPagesHandler(handler);
 * ```
 */
export function createNextPagesHandler(handler: WebhookHandler) {
  return async (req: any, res: any) => {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({
        error: 'Method not allowed',
        details: 'Only POST requests are supported'
      });
    }

    try {
      const body = req.body;

      // Call platform-agnostic core handler
      const result = await handleWebhookRequest(body, handler);

      // Handle error responses
      if (result.type === 'error') {
        return res.status(result.status).json({
          error: result.error,
          details: result.details
        });
      }

      // Handle streaming responses
      if (result.type === 'stream') {
        // Set streaming headers
        for (const [key, value] of Object.entries(result.headers)) {
          res.setHeader(key, value);
        }
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Stream the response
        const reader = result.stream.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            res.write(typeof value === 'string' ? value : decoder.decode(value));
          }
          res.end();
        } catch (streamError) {
          console.error('Streaming error:', streamError);
          if (!res.headersSent) {
            res.status(500).json({
              error: 'Streaming error',
              details: streamError instanceof Error ? streamError.message : String(streamError)
            });
          } else {
            res.end();
          }
        }
        return;
      }

      // Handle regular JSON responses
      return res.status(result.status || 200).json(result.data);

    } catch (error) {
      console.error('Next.js Pages adapter error:', error);

      return res.status(500).json({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  };
}

/**
 * Edge Runtime compatible handler (experimental)
 * Use this when deploying to Vercel Edge Runtime
 *
 * @example
 * ```typescript
 * // app/api/agentmark/route.ts
 * export const runtime = 'edge';
 * export const POST = createNextEdgeHandler(handler);
 * ```
 *
 * Note: Ensure your webhook handler and dependencies are Edge-compatible
 */
export function createNextEdgeHandler(handler: WebhookHandler) {
  return async (request: Request): Promise<Response> => {
    try {
      // Parse request body
      let body;
      try {
        body = await request.json();
      } catch (parseError) {
        return Response.json(
          {
            error: 'Invalid JSON',
            details: 'Request body must be valid JSON'
          },
          { status: 400 }
        );
      }

      // Call platform-agnostic core handler
      const result = await handleWebhookRequest(body, handler);

      // Handle error responses
      if (result.type === 'error') {
        return Response.json(
          {
            error: result.error,
            details: result.details
          },
          { status: result.status }
        );
      }

      // Handle streaming responses
      if (result.type === 'stream') {
        return new Response(result.stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            ...result.headers
          }
        });
      }

      // Handle regular JSON responses
      return Response.json(result.data, {
        status: result.status || 200
      });

    } catch (error) {
      console.error('Next.js Edge adapter error:', error);

      return Response.json(
        {
          error: 'Internal server error',
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      );
    }
  };
}
