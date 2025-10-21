import { describe, it, expect, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import net from 'node:net';
import * as path from 'node:path';
import * as fs from 'node:fs';

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// No longer needed - dev server auto-generates

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
    // No dev-server.ts - let CLI auto-generate it

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

  it('auto-generates dev server when dev-server.ts is missing', async () => {
    const tmp = path.join(__dirname, '..', 'tmp-dev-autogen-' + Date.now());
    tmpDirs.push(tmp);
    fs.mkdirSync(path.join(tmp, 'agentmark'), { recursive: true });

    // Setup test directory
    setupTestDir(tmp);

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
    fs.writeFileSync(path.join(tmp, 'agentmark.json'), JSON.stringify({ agentmarkPath: '.' }, null, 2));
    fs.writeFileSync(path.join(tmp, 'agentmark', 'demo.prompt.mdx'), '---\ntext_config:\n  model_name: gpt-4o\n---\n\n# Demo');

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

    // Verify auto-generated message appears
    expect(stdout).toContain('Using auto-generated dev server');

    // Verify .agentmark/dev-entry.ts was created
    expect(fs.existsSync(path.join(tmp, '.agentmark', 'dev-entry.ts'))).toBe(true);

    // Verify server started
    const serverReady = await waitForServer(`http://localhost:${filePort}/v1/prompts`);
    expect(serverReady).toBe(true);
  }, 15000);

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
    // No dev-server.ts - let CLI auto-generate it

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
    let stderr = '';
    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    // Wait for server to be ready
    const serverReady = await waitForServer(`http://localhost:${filePort}/v1/prompts`);
    expect(serverReady).toBe(true);

    // Give it a bit more time for the adapter message to be printed
    await wait(500);

    const output = stdout + stderr;
    expect(output).toContain('vercel-ai-v4');
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
    // No dev-server.ts - let CLI auto-generate it

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
    // No dev-server.ts - let CLI auto-generate it

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
    expect(stdout).toContain('File server running on');

    // Runner may or may not start successfully in test environment, so we don't strictly require it
  }, 15000);
});
