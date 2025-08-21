export const getRunnerFileContent = () => `// agentmark.runner.ts
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '.env') });
import express, { type Request, type Response } from 'express';
import { createServer } from 'node:http';
import type { AgentMark } from '@agentmark/agentmark-core';
import { VercelAdapterRunner } from '@agentmark/vercel-ai-v4-adapter/runner';
import { createClient } from './agentmark.config';

export function createRunner(): InstanceType<typeof VercelAdapterRunner> {
  const client = createClient({});
  return new VercelAdapterRunner(client as unknown as AgentMark<any, any>);
}

export async function serve({ port = 9417 }: { port?: number } = {}){
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use((_req, _res, next) => { next(); });

  const runner = createRunner();

  app.post('/v1/run', async (req: Request, res: Response) => {
    try {
      const event = req.body || {};
      
      if (event?.type === 'prompt-run') {
        if (!event.data?.ast) {
          return res.status(400).json({ error: 'Missing data.ast in prompt-run event' });
        }
        const response = await runner.runPrompt(event.data.ast, event.data.options);
        if (response?.type === 'stream' && response.stream) {
          res.setHeader('AgentMark-Streaming', 'true');
          if (response.streamHeader) for (const [k, v] of Object.entries(response.streamHeader)) res.setHeader(k, String(v));
          const reader = response.stream.getReader();
          const decoder = new TextDecoder();
          for (;;) { const { value, done } = await reader.read(); if (done) break; res.write(typeof value === 'string' ? value : decoder.decode(value)); }
          res.end();
          return;
        }
        return res.json(response);
      }
      if (event?.type === 'dataset-run') {
        if (!event.data?.ast) {
          return res.status(400).json({ error: 'Missing data.ast in dataset-run event' });
        }
        const experimentId = event.data.experimentId ?? 'local-experiment';
        let response;
        try {
          response = await runner.runExperiment(event.data.ast, experimentId);
        } catch (e: any) {
          return res.status(500).json({ error: e?.message || String(e), stack: process.env.AGENTMARK_DEBUG ? (e?.stack || String(e)) : undefined });
        }
        if (response?.stream) {
          if (response.streamHeaders) for (const [k, v] of Object.entries(response.streamHeaders)) res.setHeader(k, String(v));
          const reader = response.stream.getReader();
          const decoder = new TextDecoder();
          for (;;) { const { value, done } = await reader.read(); if (done) break; res.write(typeof value === 'string' ? value : decoder.decode(value)); }
          res.end();
          return;
        }
        return res.status(500).json({ error: 'Expected stream from dataset-run' });
      }
      return res.status(400).json({ error: 'Unknown event type' });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || String(e), stack: process.env.AGENTMARK_DEBUG ? (e?.stack || String(e)) : undefined });
    }
  });

  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(port, resolve));
  const addr = server.address();
  const p = typeof addr === 'object' && addr ? addr.port : port;
  console.log('[agentmark.runner] listening on http://localhost:' + p);
  return server;
}

if (require.main === module) {
  serve({}).catch(err => { console.error(err); process.exit(1); });
}
`;
