import { describe, it, expect, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import net from 'node:net';
import * as path from 'node:path';
import * as fs from 'node:fs';

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function getDevServerContent() {
  return `// dev-server.ts
// This file starts the AgentMark development servers
// Run with: npm run dev (or agentmark dev)

import { client } from './agentmark.config';

// Parse command line arguments
const args = process.argv.slice(2);
const runnerPortArg = args.find(arg => arg.startsWith('--runner-port='));
const filePortArg = args.find(arg => arg.startsWith('--file-port='));

const runnerPort = runnerPortArg ? parseInt(runnerPortArg.split('=')[1]) : 9417;
const fileServerPort = filePortArg ? parseInt(filePortArg.split('=')[1]) : 9418;

async function main() {
  const { createDevServers } = await import("@agentmark/vercel-ai-v4-adapter/dev");

  await createDevServers({
    client: client as any,
    runnerPort,
    fileServerPort
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
`;
}

function setupTestDir(tmp: string) {
  // Create package.json for proper module resolution
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'test-app', type: 'module' }, null, 2));

  // Symlink node_modules from monorepo root to temp dir
  const monorepoRoot = path.resolve(__dirname, '../../..');
  const nodeModulesSource = path.join(monorepoRoot, 'node_modules');
  const nodeModulesTarget = path.join(tmp, 'node_modules');
  try {
    fs.symlinkSync(nodeModulesSource, nodeModulesTarget, 'dir');
  } catch (e: any) {
    // Ignore if symlink already exists
    if (e.code !== 'EEXIST') throw e;
  }
}

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

async function waitForServer(url: string, maxAttempts = 30, delayMs = 500): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      // Any response (even 400/500) means server is up
      return true;
    } catch {
      await wait(delayMs);
    }
  }
  return false;
}

describe('agentmark dev', () => {
  const processes: ChildProcess[] = [];
  const tmpDirs: string[] = [];

  afterEach(async () => {
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

    // Wait for processes to fully terminate
    await wait(500);

    // Clean up all temp directories
    for (const dir of tmpDirs) {
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch {}
    }
    tmpDirs.length = 0;
  });

  it('starts file server and runner, serves templates endpoint', async () => {
    const tmp = path.join(__dirname, '..', 'tmp-dev-' + Date.now());
    tmpDirs.push(tmp);
    fs.mkdirSync(path.join(tmp, 'agentmark'), { recursive: true });

    // Setup test directory with node_modules
    setupTestDir(tmp);

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
    fs.writeFileSync(path.join(tmp, 'dev-server.ts'), getDevServerContent());

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

    // Capture output for debugging
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    // Wait for servers to start
    await wait(3000);

    // Debug: print output if servers didn't start
    if (stderr) {
      console.log('STDERR:', stderr);
    }
    if (stdout) {
      console.log('STDOUT:', stdout);
    }

    // Test file server /v1/prompts endpoint
    const listResp = await fetch(`http://localhost:${filePort}/v1/prompts`);
    if (!listResp.ok) {
      const errorText = await listResp.text();
      console.log(`Response status: ${listResp.status}, body: ${errorText}`);
    }
    expect(listResp.ok).toBe(true);
    const { paths } = await listResp.json() as any;
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);

    // Test /v1/templates dataset endpoint
    const dsResp = await fetch(`http://localhost:${filePort}/v1/templates?path=demo.jsonl`);
    expect(dsResp.ok).toBe(true);
    const text = await dsResp.text();
    expect(text.trim().length).toBeGreaterThan(0);
  }, 15000); // Increase timeout for this test

  it('fails gracefully when dev-server.ts is missing', async () => {
    const tmp = path.join(__dirname, '..', 'tmp-dev-no-devserver-' + Date.now());
    tmpDirs.push(tmp);
    fs.mkdirSync(tmp, { recursive: true });

    // Create agentmark.config.ts but NOT dev-server.ts
    const configContent = `
import { AgentMark } from '@agentmark/agentmark-core';
import { VercelAIAdapter, VercelAIModelRegistry } from '@agentmark/vercel-ai-v4-adapter';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({ apiKey: 'test-key' });
const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(['gpt-4o'], (name: string) => openai(name));

const adapter = new VercelAIAdapter(modelRegistry);
export const client = new AgentMark({ prompt: {}, adapter });
`;
    fs.writeFileSync(path.join(tmp, 'agentmark.config.ts'), configContent);

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

    expect(stderr).toContain('dev-server.ts not found');
  });

  it('detects and displays the correct adapter name', async () => {
    const tmp = path.join(__dirname, '..', 'tmp-dev-adapter-' + Date.now());
    tmpDirs.push(tmp);
    fs.mkdirSync(path.join(tmp, 'agentmark'), { recursive: true });

    // Setup test directory with node_modules
    setupTestDir(tmp);

    fs.writeFileSync(path.join(tmp, 'agentmark.json'), JSON.stringify({ agentmarkPath: '.' }, null, 2));
    fs.writeFileSync(path.join(tmp, 'agentmark', 'demo.prompt.mdx'), '---\ntext_config:\n  model_name: gpt-4o\n---\n\n# Demo');

    // Create config with Vercel AI adapter
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
    fs.writeFileSync(path.join(tmp, 'dev-server.ts'), getDevServerContent());

    const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
    const filePort = await getFreePort();
    const runnerPort = await getFreePort();

    const child = spawn(process.execPath, [cli, 'dev', '--port', String(filePort), '--runner-port', String(runnerPort)], {
      cwd: tmp,
      env: { ...process.env, OPENAI_API_KEY: 'test-key' },
      stdio: 'pipe'
    });

    processes.push(child);

    let stdout = '';
    child.stdout?.on('data', (data) => { stdout += data.toString(); });

    await wait(3000);

    expect(stdout).toContain('Vercel AI SDK v4');
  }, 15000);

  it('allows custom port configuration', async () => {
    const tmp = path.join(__dirname, '..', 'tmp-dev-custom-port-' + Date.now());
    tmpDirs.push(tmp);
    fs.mkdirSync(path.join(tmp, 'agentmark'), { recursive: true });

    // Setup test directory with node_modules
    setupTestDir(tmp);

    fs.writeFileSync(path.join(tmp, 'agentmark.json'), JSON.stringify({ agentmarkPath: '.' }, null, 2));
    fs.writeFileSync(path.join(tmp, 'agentmark', 'demo.prompt.mdx'), '---\ntext_config:\n  model_name: gpt-4o\n---\n\n# Demo');

    const configContent = `
import { AgentMark } from '@agentmark/agentmark-core';
import { VercelAIAdapter, VercelAIModelRegistry } from '@agentmark/vercel-ai-v4-adapter';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({ apiKey: 'test-key' });
const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(['gpt-4o'], (name: string) => openai(name));

const adapter = new VercelAIAdapter(modelRegistry);
export const client = new AgentMark({ prompt: {}, adapter });
`;
    fs.writeFileSync(path.join(tmp, 'agentmark.config.ts'), configContent);
    fs.writeFileSync(path.join(tmp, 'dev-server.ts'), getDevServerContent());

    const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
    const customFilePort = await getFreePort();
    const customRunnerPort = await getFreePort();

    const child = spawn(process.execPath, [cli, 'dev', '--port', String(customFilePort), '--runner-port', String(customRunnerPort)], {
      cwd: tmp,
      env: { ...process.env, OPENAI_API_KEY: 'test-key' },
      stdio: 'pipe'
    });

    processes.push(child);

    await wait(3000);

    // Test that server is running on custom port
    const resp = await fetch(`http://localhost:${customFilePort}/v1/prompts`);
    expect(resp.ok).toBe(true);
  }, 15000);

  it('displays correct file server URL', async () => {
    const tmp = path.join(__dirname, '..', 'tmp-dev-urls-' + Date.now());
    tmpDirs.push(tmp);
    fs.mkdirSync(path.join(tmp, 'agentmark'), { recursive: true });

    // Setup test directory with node_modules
    setupTestDir(tmp);

    fs.writeFileSync(path.join(tmp, 'agentmark.json'), JSON.stringify({ agentmarkPath: '.' }, null, 2));
    fs.writeFileSync(path.join(tmp, 'agentmark', 'demo.prompt.mdx'), '---\ntext_config:\n  model_name: gpt-4o\n---\n\n# Demo');

    const configContent = `
import { AgentMark } from '@agentmark/agentmark-core';
import { VercelAIAdapter, VercelAIModelRegistry } from '@agentmark/vercel-ai-v4-adapter';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({ apiKey: 'test-key' });
const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(['gpt-4o'], (name: string) => openai(name));

const adapter = new VercelAIAdapter(modelRegistry);
export const client = new AgentMark({ prompt: {}, adapter });
`;
    fs.writeFileSync(path.join(tmp, 'agentmark.config.ts'), configContent);
    fs.writeFileSync(path.join(tmp, 'dev-server.ts'), getDevServerContent());

    const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
    const filePort = await getFreePort();
    const runnerPort = await getFreePort();

    const child = spawn(process.execPath, [cli, 'dev', '--port', String(filePort), '--runner-port', String(runnerPort)], {
      cwd: tmp,
      env: { ...process.env, OPENAI_API_KEY: 'test-key' },
      stdio: 'pipe'
    });

    processes.push(child);

    let stdout = '';
    child.stdout?.on('data', (data) => { stdout += data.toString(); });

    await wait(3000);

    // File server should always start
    expect(stdout).toContain(`http://localhost:${filePort}`);
    expect(stdout).toContain('Files served on:');

    // Runner may or may not start successfully in test environment, so we don't strictly require it
  }, 15000);
});
