import express from 'express';
import path from 'path';
import { VercelAdapterRunner } from '@agentmark/vercel-ai-v4-adapter/runner';
import type { AgentMark } from '@agentmark/agentmark-core';

const resolveClient = async (): Promise<AgentMark<any, any>> => {
  const candidates = [
    process.env.AGENTMARK_CLIENT,
    path.resolve(process.cwd(), 'agentmark.config.ts'),
    path.resolve(process.cwd(), 'agentmark.config.mjs'),
    path.resolve(process.cwd(), 'agentmark.config.js'),
  ].filter(Boolean) as string[];
  const coerceClient = async (mod: any) => {
    const m = mod?.default ?? mod;
    if (m && typeof m.createClient === 'function') return await m.createClient({ env: process.env });
    if (m?.clientPromise) return await m.clientPromise;
    if (m?.client) return typeof m.client.then === 'function' ? await m.client : m.client;
    return undefined;
  };
  for (const p of candidates) {
    try {
      const mod = await import(p);
      const client = await coerceClient(mod);
      if (client) return client;
    } catch {}
    // Fallback: support loading TypeScript configs via jiti
    try {
      const j = await import('jiti').then(m => (m as any).default || (m as any));
      const jrequire = j(process.cwd());
      const mod = jrequire(p);
      const client = await coerceClient(mod);
      if (client) return client;
    } catch {}
  }
  throw new Error('Unable to resolve AgentMark client. Provide --client or AGENTMARK_CLIENT, or create agentmark.config.ts');
};

const clientServe = async (options: { port?: number } = {}) => {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  const port = options.port || parseInt(process.env.PORT || '9417', 10);

  const client = await resolveClient();
  const runner = new VercelAdapterRunner(client as any);

  app.post('/v1/run', async (req, res) => {
    try {
      const { promptPath, shouldStream } = req.body || {};
      if (typeof promptPath !== 'string') {
        return res.status(400).json({ error: 'promptPath is required' });
      }
      const { load } = await import('@agentmark/templatedx');
      const ast = await load(path.resolve(process.cwd(), promptPath));
      const result = await runner.runPrompt(ast as any, { shouldStream: !!shouldStream });
      if ((result as any).type === 'stream') {
        res.setHeader('AgentMark-Streaming', 'true');
        const reader = (result as any).stream.getReader();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
        return;
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  app.listen(port, () => {
    console.log(`AgentMark client server listening on http://localhost:${port}`);
  });
};

export default clientServe;
