/**
 * AgentMark Webhook Server
 *
 * This file provides the webhook server for local development,
 * used to execute prompts and experiments via Express.
 */

import express, { Request, Response, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { createServer, Server } from 'node:http';
import { handleWebhookRequest } from './runner-server/core';
import type { WebhookHandler } from './runner-server/types';
import {
  verifyWebhookSignature,
  shouldSkipVerification,
  type SignatureVerificationOptions
} from './runner-server/middleware/signature-verification';
import { getWebhookSecret } from './config';

// Set up rate limiter: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Re-export WebhookHandler for external use
export type { WebhookHandler } from './runner-server/types';

export interface WebhookServerOptions {
  port?: number;
  handler: WebhookHandler;
  apiServerUrl?: string;
  templatesDirectory?: string;
  /**
   * Webhook signature verification options.
   * If not provided, will check AGENTMARK_WEBHOOK_SECRET env var.
   */
  signatureVerification?: SignatureVerificationOptions;
}

/**
 * Creates an Express middleware handler for AgentMark webhook requests.
 */
function createMiddleware(
  handler: WebhookHandler,
  signatureOptions?: SignatureVerificationOptions
): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      // Log incoming request
      const timestamp = new Date().toISOString();
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      console.log(`\n[${timestamp}] ${req.method} ${req.path} - ${clientIp}`);

      const body = req.body || {};

      // Verify signature if configured
      if (signatureOptions && !shouldSkipVerification(signatureOptions)) {
        const headerName = signatureOptions.headerName || 'x-agentmark-signature-256';
        const signature = req.headers[headerName.toLowerCase()] as string;

        if (!signature) {
          console.error('   ❌ 401 Missing signature header');
          console.error(`      Expected header: ${headerName}`);
          console.error('      Ensure the client is sending a signed request with AGENTMARK_WEBHOOK_SECRET.');
          return res.status(401).json({
            message: `Missing signature header: Expected ${headerName} header for webhook verification`
          });
        }

        const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
        const isValid = await verifyWebhookSignature(bodyString, signature, signatureOptions.secret);

        if (!isValid) {
          console.error('   ❌ 401 Invalid webhook signature');
          console.error('      The signature in the request header does not match.');
          return res.status(401).json({
            message: 'Invalid webhook signature - signature verification failed'
          });
        }
        console.log('   ✓ Signature verified');
      }

      // Call platform-agnostic core handler
      const result = await handleWebhookRequest(body, handler);

      // Handle error responses
      if (result.type === 'error') {
        const errorMessage = result.details || result.error;
        console.log(`   → ${result.status} Error: ${errorMessage}`);
        return res.status(result.status).json({
          message: errorMessage
        });
      }

      // Handle streaming responses
      if (result.type === 'stream') {
        // Set streaming headers
        for (const [key, value] of Object.entries(result.headers)) {
          res.setHeader(key, value);
        }

        // Stream the response
        const reader = result.stream.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = typeof value === 'string' ? value : decoder.decode(value);
            // Log errors from the stream
            try {
              const parsed = JSON.parse(chunk.trim());
              if (parsed.type === 'error') {
                console.error(`   ❌ Error: ${parsed.error || parsed.message || 'Unknown error'}`);
              }
            } catch {
              // Not JSON or multi-line, ignore parsing errors
            }
            res.write(chunk);
          }
          // Send traceId as final event if available
          if (result.traceId) {
            res.write(JSON.stringify({ type: 'done', traceId: result.traceId }) + '\n');
          }
          res.end();
        } catch (streamError) {
          console.error('Streaming error:', streamError);
          if (!res.headersSent) {
            res.status(500).json({
              message: streamError instanceof Error ? streamError.message : String(streamError)
            });
          } else {
            res.end();
          }
        }
        return;
      }

      // Handle regular JSON responses
      console.log(`   → ${result.status || 200} Success`);
      return res.status(result.status || 200).json(result.data);

    } catch (error) {
      console.error('   → 500 Internal Error:', error);
      return res.status(500).json({
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };
}

/**
 * Creates an HTTP server that wraps a webhook handler instance.
 * This server provides endpoints for executing prompts and experiments via HTTP.
 * Used by the CLI and local development workflows.
 *
 * @param options - Server configuration options
 * @returns HTTP server instance
 */
export async function createWebhookServer(options: WebhookServerOptions): Promise<Server> {
  const { port = 9417, handler, signatureVerification } = options;

  // Setup signature verification options
  let sigOptions = signatureVerification;
  if (!sigOptions) {
    // Check for env var
    const secret = getWebhookSecret();
    if (secret) {
      sigOptions = { secret };
    }
  }

  const app = express();

  // Trust first proxy hop (for tunnels like ngrok, cloudflare, etc.)
  // Using 1 instead of true limits trust to single proxy, more secure for dev
  app.set('trust proxy', 1);

  // Parse JSON bodies (up to 10mb)
  app.use(express.json({ limit: '10mb' }));

  // Landing page for browser access
  app.get('/', async (_req: Request, res: Response) => {
    const { apiServerUrl, templatesDirectory } = options;

    // Fetch available prompts dynamically
    let promptsList = '';

    if (apiServerUrl) {
      try {
        const response = await fetch(`${apiServerUrl}/v1/prompts`);
        if (response.ok) {
          const data = await response.json();
          if (data.paths && data.paths.length > 0) {
            promptsList = data.paths.map((p: string) =>
              `      <li><code>${p}</code></li>`
            ).join('\n');
          } else {
            promptsList = '      <li style="color: #64748b;">No prompts found</li>';
          }
        } else {
          promptsList = '      <li style="color: #64748b;">Unable to fetch prompts</li>';
        }
      } catch {
        promptsList = '      <li style="color: #64748b;">API server not available</li>';
      }
    } else {
      promptsList = '      <li style="color: #64748b;">API server URL not configured</li>';
    }

    const templatesDir = templatesDirectory || 'agentmark/';
    const apiServerInfo = apiServerUrl ?
      `<div class="info-box">
        <strong>📁 Templates Directory:</strong><br>
        <code>${templatesDir}</code><br><br>
        <strong>🔗 API:</strong><br>
        <a href="${apiServerUrl}" target="_blank">${apiServerUrl}</a>
      </div>` : '';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentMark CLI Runner</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    h1 { color: #2563eb; margin-bottom: 10px; }
    .subtitle { color: #64748b; margin-bottom: 30px; }
    .status {
      background: #dcfce7;
      border-left: 4px solid #22c55e;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .endpoint {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 15px;
      margin: 15px 0;
    }
    .endpoint-title {
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 8px;
    }
    .endpoint-desc {
      color: #64748b;
      font-size: 14px;
      margin-bottom: 10px;
    }
    code {
      background: #1e293b;
      color: #e2e8f0;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 13px;
    }
    .command {
      background: #1e293b;
      color: #e2e8f0;
      padding: 12px;
      border-radius: 4px;
      margin: 10px 0;
      overflow-x: auto;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-size: 13px;
    }
    .info-box {
      background: #f0f9ff;
      border-left: 4px solid #2563eb;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      color: #64748b;
      font-size: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      font-size: 14px;
    }
    th {
      background: #f1f5f9;
      padding: 10px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #e2e8f0;
    }
    td {
      padding: 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    td code {
      background: #1e293b;
      color: #e2e8f0;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h1>AgentMark CLI Runner</h1>
  <div class="subtitle">Local development server for executing prompts and experiments</div>

  <div class="status">
    <strong>✓ Server Status:</strong> Running on port ${port}
  </div>

  ${apiServerInfo}

  <h2>What is this?</h2>
  <p>
    This is the <strong>AgentMark CLI Runner</strong>, an internal development server that executes
    prompts and experiments locally. It's automatically started when you run <code>agentmark dev</code>
    and is used by CLI commands to process your prompts.
  </p>

  <h2>Your Prompts</h2>
  <ul>
${promptsList}
  </ul>

  <h2>Available Commands</h2>

  <h3>Run a Single Prompt</h3>
  <div class="command">$ npm run prompt agentmark/&lt;file&gt;.prompt.mdx</div>

  <h3>Run Experiments with Datasets</h3>
  <div class="command">$ npm run experiment agentmark/&lt;file&gt;.prompt.mdx</div>

  <h2>API Endpoints</h2>

  <table>
    <thead>
      <tr>
        <th>Endpoint</th>
        <th>Method</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>POST /</code></td>
        <td>POST</td>
        <td>Execute prompts or run experiments</td>
      </tr>
    </tbody>
  </table>

  <p><strong>Event Types:</strong></p>
  <ul>
    <li><code>prompt-run</code> - Execute a single prompt with test props</li>
    <li><code>dataset-run</code> - Run experiments across a dataset</li>
  </ul>

  <footer>
    <div><strong>AgentMark Development Server</strong></div>
    <div>Learn more: <a href="https://docs.agentmark.co" target="_blank">docs.agentmark.co</a></div>
  </footer>
</body>
</html>
    `.trim());
  });

  // Mount the webhook handler middleware at POST /
  app.post('/', limiter, createMiddleware(handler, sigOptions));

  // Create HTTP server and start listening
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(port, resolve));

  return server;
}

// Re-export core handler and types
export { handleWebhookRequest } from './runner-server/core';
export type { WebhookRequest, WebhookResponse } from './runner-server/types';
