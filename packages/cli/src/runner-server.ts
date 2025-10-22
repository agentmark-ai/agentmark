import express, { type Request, type Response } from 'express';
import { createServer } from 'node:http';
import { type RunnerPromptResponse, type RunnerDatasetResponse } from '@agentmark/prompt-core';
import { getCliMetadata, formatOptionsAsHtml } from './cli-metadata';

/**
 * Generic runner interface that any adapter can implement
 */
export interface Runner {
  runPrompt(promptAst: any, options?: { shouldStream?: boolean; customProps?: Record<string, any> }): Promise<RunnerPromptResponse>;
  runExperiment(promptAst: any, datasetRunName: string, datasetPath?: string): Promise<RunnerDatasetResponse>;
}

export interface RunnerServerOptions {
  port?: number;
  runner: Runner;
  fileServerUrl?: string;
  templatesDirectory?: string;
}

/**
 * Creates an HTTP server that wraps a runner instance.
 * This server provides endpoints for executing prompts and experiments via HTTP.
 * Used by the CLI and local development workflows.
 */
export async function createRunnerServer(options: RunnerServerOptions) {
  const { port = 9417, runner, fileServerUrl, templatesDirectory } = options;

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use((_req, _res, next) => { next(); });

  // Landing page for browser access
  app.get('/', async (_req: Request, res: Response) => {
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

    // Get CLI metadata dynamically from commander definitions
    const cliMetadata = getCliMetadata();
    const runPromptOptions = formatOptionsAsHtml(cliMetadata['run-prompt'].options);
    const runExperimentOptions = formatOptionsAsHtml(cliMetadata['run-experiment'].options);

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
    .option {
      margin: 15px 0;
      padding: 12px;
      background: #fafafa;
      border-radius: 4px;
      border-left: 3px solid #94a3b8;
    }
    .option-name {
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 4px;
    }
    .option-desc {
      color: #64748b;
      font-size: 14px;
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
  <div class="command">$ npm run prompt agentmark/&lt;file&gt;.prompt.mdx [options]</div>
${runPromptOptions}

  <h3>Run Experiments with Datasets</h3>
  <div class="command">$ npm run experiment agentmark/&lt;file&gt;.prompt.mdx [options]</div>
${runExperimentOptions}

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

  app.post('/', async (req: Request, res: Response) => {
    try {
      const event = req.body || {};

      if (event?.type === 'prompt-run') {
        // Validate that ast is an object (Root AST), not a string path
        if (!event.data?.ast || typeof event.data.ast !== 'object') {
          return res.status(400).json({
            error: 'Invalid or missing AST object',
            details: 'The request must include a valid AST (Abstract Syntax Tree) object in event.data.ast'
          });
        }
        const options = { ...event.data.options, customProps: event.data.customProps };
        const response = await runner.runPrompt(event.data.ast, options);

        if (response?.type === 'stream' && response.stream) {
          res.setHeader('AgentMark-Streaming', 'true');
          if (response.streamHeader) {
            for (const [k, v] of Object.entries(response.streamHeader)) {
              res.setHeader(k, String(v));
            }
          }
          const reader = response.stream.getReader();
          const decoder = new TextDecoder();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            res.write(typeof value === 'string' ? value : decoder.decode(value));
          }
          res.end();
          return;
        }
        return res.json(response);
      }

      if (event?.type === 'dataset-run') {
        // Validate that ast is an object (Root AST), not a string path
        if (!event.data?.ast || typeof event.data.ast !== 'object') {
          return res.status(400).json({
            error: 'Invalid or missing AST object in dataset-run event',
            details: 'The request must include a valid AST (Abstract Syntax Tree) object in event.data.ast'
          });
        }
        const experimentId = event.data.experimentId ?? 'local-experiment';
        let response;
        try {
          response = await runner.runExperiment(event.data.ast, experimentId, event.data.datasetPath);
        } catch (e: any) {
          // Provide more context about the error
          const errorMessage = e?.message || String(e);
          const errorStack = e?.stack;
          return res.status(500).json({
            error: errorMessage,
            details: 'An error occurred while running the experiment. Check that your prompt and dataset are valid.',
            stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
          });
        }
        if (response?.stream) {
          if (response.streamHeaders) {
            for (const [k, v] of Object.entries(response.streamHeaders)) {
              res.setHeader(k, String(v));
            }
          }
          const reader = response.stream.getReader();
          const decoder = new TextDecoder();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            res.write(typeof value === 'string' ? value : decoder.decode(value));
          }
          res.end();
          return;
        }
        return res.status(500).json({ error: 'Expected stream from dataset-run' });
      }

      return res.status(400).json({
        error: 'Unknown event type',
        details: `Expected event.type to be 'prompt-run' or 'dataset-run', got: ${event?.type || 'undefined'}`,
        validTypes: ['prompt-run', 'dataset-run']
      });
    } catch (e: any) {
      const errorMessage = e?.message || String(e);
      const errorStack = e?.stack;
      return res.status(500).json({
        error: errorMessage,
        details: 'An unexpected error occurred in the runner server',
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
      });
    }
  });

  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(port, resolve));
  return server;
}
