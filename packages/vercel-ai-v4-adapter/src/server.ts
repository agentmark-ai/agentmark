import express, { type Request, type Response } from 'express';
import { createServer } from 'node:http';
import type { AgentMark } from '@agentmark/agentmark-core';
import { VercelAdapterRunner } from './runner';

export interface RunnerServerOptions {
  port?: number;
  client: AgentMark<any, any>;
}

export async function createRunnerServer(options: RunnerServerOptions) {
  const { port = 9417, client } = options;

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use((_req, _res, next) => { next(); });

  const runner = new VercelAdapterRunner(client);

  app.post('/', async (req: Request, res: Response) => {
    try {
      const event = req.body || {};

      if (event?.type === 'prompt-run') {
        // Validate that ast is an object (Root AST), not a string path
        if (!event.data?.ast || typeof event.data.ast !== 'object') {
          return res.status(400).json({ error: 'Invalid or missing AST object' });
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
          return res.status(400).json({ error: 'Invalid or missing AST object in dataset-run event' });
        }
        const experimentId = event.data.experimentId ?? 'local-experiment';
        let response;
        try {
          response = await runner.runExperiment(event.data.ast, experimentId, event.data.datasetPath);
        } catch (e: any) {
          return res.status(500).json({
            error: e?.message || String(e)
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

      return res.status(400).json({ error: 'Unknown event type' });
    } catch (e: any) {
      return res.status(500).json({
        error: e?.message || String(e)
      });
    }
  });

  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(port, resolve));
  return server;
}
