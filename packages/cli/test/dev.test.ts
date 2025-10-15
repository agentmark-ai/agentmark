import { describe, it, expect, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import net from 'node:net';
import * as path from 'node:path';
import * as fs from 'node:fs';

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

describe('agentmark dev', () => {
  const processes: ChildProcess[] = [];

  afterEach(() => {
    // Kill all spawned processes
    for (const proc of processes) {
      try {
        if (proc.pid) {
          process.kill(proc.pid, 'SIGKILL');
          // Also kill any child processes
          try { spawn('pkill', ['-P', String(proc.pid)]); } catch {}
        }
      } catch {}
    }
    processes.length = 0;
  });

  it('starts file server and runner, serves templates endpoint', async () => {
    const tmp = path.join(__dirname, '..', 'tmp-dev-' + Date.now());
    fs.mkdirSync(path.join(tmp, 'agentmark'), { recursive: true });

    // Create required files
    fs.writeFileSync(path.join(tmp, 'agentmark.json'), JSON.stringify({ agentmarkPath: '.' }, null, 2));
    fs.writeFileSync(path.join(tmp, 'agentmark', 'demo.prompt.mdx'), '---\ntext_config:\n  model_name: gpt-4o\n---\n\n# Demo Prompt');
    fs.writeFileSync(path.join(tmp, 'agentmark', 'demo.jsonl'), JSON.stringify({ input: {}, expected_output: 'EXPECTED' }) + '\n');

    // Create minimal agentmark.config.ts
    const configContent = `
import { AgentMark } from '@agentmark/agentmark-core';
import { VercelAIAdapter, VercelAIModelRegistry } from '@agentmark/vercel-ai-v4-adapter';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY || 'test-key' });
const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(['gpt-4o'], (name: string) => openai(name));

const adapter = new VercelAIAdapter(modelRegistry);
export const client = new AgentMark({ prompt: {}, adapter });
`;
    fs.writeFileSync(path.join(tmp, 'agentmark.config.ts'), configContent);

    const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
    const filePort = await getFreePort();
    const runnerPort = await getFreePort();

    // Spawn dev command
    const child = spawn(process.execPath, [cli, 'dev', '--port', String(filePort), '--runner-port', String(runnerPort)], {
      cwd: tmp,
      env: { ...process.env, OPENAI_API_KEY: 'test-key' },
      stdio: 'pipe'
    });

    processes.push(child);

    // Wait for servers to start
    await wait(3000);

    // Test file server /v1/prompts endpoint
    const listResp = await fetch(`http://localhost:${filePort}/v1/prompts`);
    expect(listResp.ok).toBe(true);
    const { paths } = await listResp.json() as any;
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);

    // Test /v1/templates dataset endpoint
    const dsResp = await fetch(`http://localhost:${filePort}/v1/templates?path=demo.jsonl`);
    expect(dsResp.ok).toBe(true);
    const text = await dsResp.text();
    expect(text.trim().length).toBeGreaterThan(0);

    // Cleanup
    try { if (child.pid) process.kill(child.pid, 'SIGKILL'); } catch {}
    try { spawn('pkill', ['-P', String(child.pid)]); } catch {}
    await wait(500);
    fs.rmSync(tmp, { recursive: true, force: true });
  }, 15000); // Increase timeout for this test

  it('fails gracefully when agentmark.config.ts is missing', async () => {
    const tmp = path.join(__dirname, '..', 'tmp-dev-no-config-' + Date.now());
    fs.mkdirSync(tmp, { recursive: true });

    const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
    const filePort = await getFreePort();

    const child = spawn(process.execPath, [cli, 'dev', '--port', String(filePort)], {
      cwd: tmp,
      env: { ...process.env },
      stdio: 'pipe'
    });

    processes.push(child);

    let stderr = '';
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    await wait(1000);

    expect(stderr).toContain('agentmark.config.ts not found');

    // Cleanup
    try { if (child.pid) process.kill(child.pid, 'SIGKILL'); } catch {}
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
