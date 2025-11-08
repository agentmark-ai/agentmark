/**
 * Express adapter for AgentMark webhook server.
 * Provides both a full server (createWebhookServer) and middleware (createExpressMiddleware).
 */

import express, { Request, Response, RequestHandler } from 'express';
import { createServer, Server } from 'node:http';
import { handleWebhookRequest } from '../core';
import type { WebhookHandler } from '../types';
import {
  verifyWebhookSignature,
  shouldSkipVerification,
  getWebhookSecret,
  type SignatureVerificationOptions
} from '../middleware/signature-verification';

export interface ExpressWebhookServerOptions {
  port?: number;
  handler: WebhookHandler;
  fileServerUrl?: string;
  templatesDirectory?: string;
  /**
   * Webhook signature verification options.
   * If not provided, will check AGENTMARK_WEBHOOK_SECRET env var.
   */
  signatureVerification?: SignatureVerificationOptions;
}

/**
 * Creates an Express middleware handler for AgentMark webhook requests.
 * Use this when you want to mount the webhook handler at a custom path in your existing Express app.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createExpressMiddleware } from '@agentmark/cli/runner-server/adapters/express';
 *
 * const app = express();
 * app.post('/api/agentmark', createExpressMiddleware(handler));
 * app.listen(3000);
 * ```
 */
export function createExpressMiddleware(
  handler: WebhookHandler,
  signatureOptions?: SignatureVerificationOptions
): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      // Log incoming request
      const timestamp = new Date().toISOString();
      console.log(`\n[${timestamp}] ${req.method} ${req.path} - ${req.ip || req.socket.remoteAddress}`);

      const body = req.body || {};

      // Debug signature verification settings
      console.log(`   🔍 Signature verification: ${signatureOptions ? 'configured' : 'not configured'}`);
      if (signatureOptions) {
        console.log(`      - Secret: ${signatureOptions.secret ? `${signatureOptions.secret.substring(0, 8)}...` : 'NOT SET'}`);
        console.log(`      - Skip verification: ${shouldSkipVerification(signatureOptions)}`);
      }

      // Verify signature if configured
      if (signatureOptions && !shouldSkipVerification(signatureOptions)) {
        const headerName = signatureOptions.headerName || 'x-agentmark-signature-256';
        const signature = req.headers[headerName.toLowerCase()] as string;

        if (!signature) {
          console.log('   → 401 Missing signature header');
          console.log(`      Expected header: ${headerName}`);
          console.log(`      Available headers: ${Object.keys(req.headers).join(', ')}`);
          return res.status(401).json({
            message: `Missing signature header: Expected ${headerName} header for webhook verification`
          });
        }

        const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
        const isValid = await verifyWebhookSignature(bodyString, signature, signatureOptions.secret);

        if (!isValid) {
          console.log('   → 401 Invalid signature');
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
            res.write(typeof value === 'string' ? value : decoder.decode(value));
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
 * Creates a complete Express HTTP server for AgentMark webhook handler.
 * This is the full development server with landing page and health checks.
 * Use this for local development or self-hosted deployments.
 *
 * @example
 * ```typescript
 * import { createWebhookServer } from '@agentmark/cli/runner-server/adapters/express';
 *
 * const server = await createWebhookServer({
 *   port: 9417,
 *   handler: myHandler,
 *   fileServerUrl: 'http://localhost:9418',
 *   templatesDirectory: './agentmark'
 * });
 *
 * console.log('Server listening on port 9417');
 * ```
 */
export async function createWebhookServer(options: ExpressWebhookServerOptions): Promise<Server> {
  const { port = 9417, handler, signatureVerification } = options;

  // Setup signature verification options
  let sigOptions = signatureVerification;
  if (!sigOptions) {
    // Check for env var
    const secret = getWebhookSecret();
    console.log(`🔐 AGENTMARK_WEBHOOK_SECRET from env: ${secret ? `${secret.substring(0, 8)}... (${secret.length} chars)` : 'NOT SET'}`);
    if (secret) {
      sigOptions = { secret };
      console.log('✓ Webhook signature verification enabled');
    } else {
      console.log('⚠️  Webhook signature verification disabled (no secret found)');
    }
  }

  const app = express();

  // Parse JSON bodies (up to 10mb)
  app.use(express.json({ limit: '10mb' }));

  // Landing page for browser access
  app.get('/', async (_req: Request, res: Response) => {
    const { fileServerUrl, templatesDirectory } = options;

    // Fetch available prompts dynamically
    let promptsList = '';

    if (fileServerUrl) {
      try {
        const response = await fetch(`${fileServerUrl}/v1/prompts`);
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
        promptsList = '      <li style="color: #64748b;">File server not available</li>';
      }
    } else {
      promptsList = '      <li style="color: #64748b;">File server URL not configured</li>';
    }

    const templatesDir = templatesDirectory || 'agentmark/';
    const fileServerInfo = fileServerUrl ?
      `<div class="info-box">
        <strong>📁 Templates Directory:</strong><br>
        <code>${templatesDir}</code><br><br>
        <strong>🔗 File Server:</strong><br>
        <a href="${fileServerUrl}" target="_blank">${fileServerUrl}</a>
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

  ${fileServerInfo}

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
  app.post('/', createExpressMiddleware(handler, sigOptions));

  // Create HTTP server and start listening
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(port, resolve));

  return server;
}
