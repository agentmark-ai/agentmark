import express, { type Request, type Response } from 'express';
import { createServer } from 'node:http';
import type { AgentMark } from '@agentmark/agentmark-core';
import { VercelAdapterRunner } from './runner';
import fs from 'node:fs';
import path from 'node:path';

export interface RunnerServerOptions {
  port?: number;
  client: AgentMark<any, any>;
}

export interface DevServerOptions {
  runnerPort?: number;
  fileServerPort?: number;
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
        if (!event.data?.ast) {
          return res.status(400).json({ error: 'Missing data.ast in dataset-run event' });
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
  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;

  console.log(`AgentMark Runner listening on http://localhost:${actualPort}`);

  return server;
}

async function createFileServer(port: number) {
  const app = express();

  function safePath(): string {
    try { return process.cwd(); } catch { return process.env.PWD || process.env.INIT_CWD || '.'; }
  }

  const currentPath = safePath();
  const basePath = path.join(currentPath);
  let agentmarkTemplatesBase = path.join(basePath, 'agentmark');

  try {
    const jsonPath = path.join(currentPath, 'agentmark.json');
    if (fs.existsSync(jsonPath)) {
      const agentmarkJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      if (agentmarkJson?.agentmarkPath) {
        agentmarkTemplatesBase = path.join(basePath, agentmarkJson.agentmarkPath, 'agentmark');
      }
    }
  } catch {}

  app.get('/v1/templates', async (req: any, res: any) => {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ error: 'Path query parameter is required' });
    }

    // If path is absolute, use it directly; otherwise resolve relative to agentmarkTemplatesBase
    // Always resolve filePath relative to agentmarkTemplatesBase
    const normalizedInput = filePath.replace(/^(\.*[\/\\])+/g, ''); // Remove leading dots/slashes
    let fullPath = path.resolve(agentmarkTemplatesBase, normalizedInput);

    // Prevent path traversal: Ensure fullPath is contained within agentmarkTemplatesBase
    const basePathResolved = path.resolve(agentmarkTemplatesBase);
    if (!fullPath.startsWith(basePathResolved + path.sep)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fallback: if not found and it's a .jsonl file, try templates directory
    if (!fs.existsSync(fullPath) && filePath.endsWith('.jsonl') && !path.isAbsolute(filePath)) {
      const alt = path.join(agentmarkTemplatesBase, 'templates', path.basename(filePath));
      if (fs.existsSync(alt)) fullPath = alt;
    }

    try {
      if (fullPath.endsWith('.jsonl')) {
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Dataset not found' });
        const accept = (req.get('accept') || '').toLowerCase();
        const explicitlyNdjson = accept.includes('application/x-ndjson');
        const wantsJsonArray = req.query.format === 'json' && !explicitlyNdjson;
        if (wantsJsonArray) {
          try {
            const lines = fs.readFileSync(fullPath, 'utf-8').split(/\r?\n/).filter(Boolean);
            const arr = lines.map((l: string) => JSON.parse(l));
            return res.json(arr);
          } catch (e) {
            return res.status(500).json({ error: 'Failed to read dataset' });
          }
        }
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        return fs.createReadStream(fullPath).pipe(res);
      }

      const { parse } = await import('@agentmark/templatedx');
      const fileContent = fs.readFileSync(fullPath, 'utf-8');
      const data = await parse(fileContent, path.dirname(fullPath), async (p: string) => {
        const resolved = path.isAbsolute(p) ? p : path.join(path.dirname(fullPath), p);
        return fs.readFileSync(resolved, 'utf-8');
      });
      return res.json({ data });
    } catch (error) {
      return res.status(404).json({ error: 'File not found or invalid' });
    }
  });

  app.post('/v1/export-traces', (_req: any, res: any) => {
    return res.json({ success: true });
  });

  app.get('/v1/prompts', async (_req: any, res: any) => {
    try {
      // Try to dynamically import shared-utils findPromptFiles function
      // This may fail if @agentmark/shared-utils is not available (e.g., in tests or other packages)
      let findPromptFiles;
      try {
        const utilsModule = await import('@agentmark/shared-utils');
        findPromptFiles = utilsModule.findPromptFiles;
      } catch (importError) {
        // Fallback: manually find .prompt.mdx files if CLI isn't available
        const glob = await import('glob');
        const pattern = '**/*.prompt.mdx';
        const files = glob.sync(pattern, { cwd: agentmarkTemplatesBase, absolute: true });
        return res.json({ paths: files.map((file: string) => path.relative(agentmarkTemplatesBase, file)) });
      }

      const promptFiles = await findPromptFiles(agentmarkTemplatesBase);
      const paths = promptFiles.map((file: string) => path.relative(agentmarkTemplatesBase, file));
      res.json({ paths });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list prompts' });
    }
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`File server running on port ${port}...`);
      resolve(server);
    });
  });
}

export async function createDevServers(options: DevServerOptions) {
  const { runnerPort = 9417, fileServerPort = 9418, client } = options;

  // Start file server
  const fileServer = await createFileServer(fileServerPort);

  // Start runner server
  const runnerServer = await createRunnerServer({ port: runnerPort, client });

  console.log('\n' + '─'.repeat(60));
  console.log('AgentMark Development Servers Started');
  console.log('─'.repeat(60));
  console.log(`  Files served on:  http://localhost:${fileServerPort}`);
  console.log(`  CLI served on:    http://localhost:${runnerPort}`);
  console.log('─'.repeat(60) + '\n');
  console.log('Ready! Use these CLI commands:');
  console.log('  $ agentmark run-prompt agentmark/<your-prompt>.prompt.mdx');
  console.log('  $ agentmark run-experiment agentmark/<your-prompt>.prompt.mdx');
  console.log('\nPress Ctrl+C to stop all servers\n');

  return { fileServer, runnerServer };
}
