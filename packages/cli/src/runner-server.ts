import express, { type Request, type Response } from 'express';
import { createServer } from 'node:http';
import { type RunnerPromptResponse, type RunnerDatasetResponse } from '@agentmark/agentmark-core';

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
}

/**
 * Creates an HTTP server that wraps a runner instance.
 * This server provides endpoints for executing prompts and experiments via HTTP.
 * Used by the CLI and local development workflows.
 */
export async function createRunnerServer(options: RunnerServerOptions) {
  const { port = 9417, runner } = options;

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use((_req, _res, next) => { next(); });

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
