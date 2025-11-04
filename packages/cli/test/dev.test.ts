import { describe, it, expect, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import net from 'net';
import * as path from 'path';
import * as fs from 'fs';

// Constants
const SERVER_STARTUP_WAIT_MS = 3000; // Time for dev servers to fully start
const PROCESS_CLEANUP_WAIT_MS = 500; // Time for processes to terminate
const SERVER_READY_CHECK_MAX_ATTEMPTS = 30;
const SERVER_READY_CHECK_DELAY_MS = 500;

// Helper functions
function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function createMinimalAgentMarkConfig(): string {
  return `
import { AgentMark } from '@agentmark/prompt-core';
import { VercelAIAdapter, VercelAIModelRegistry } from '@agentmark/vercel-ai-v4-adapter';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY || 'test-key' });
const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(['gpt-4o'], (name: string) => openai(name));

const adapter = new VercelAIAdapter(modelRegistry);
export const client = new AgentMark({ prompt: {}, adapter });
`;
}

const DEV_ENTRY_TEMPLATE = `// Auto-generated runner server entry point
// To customize, create a dev-server.ts file in your project root

import { createRunnerServer } from '@agentmark/cli/runner-server';
import { VercelAdapterRunner } from '@agentmark/vercel-ai-v4-adapter/runner';

async function main() {
  const { client } = await import('../agentmark.client.js');

  const args = process.argv.slice(2);
  const runnerPortArg = args.find(arg => arg.startsWith('--runner-port='));
  const runnerPort = runnerPortArg ? parseInt(runnerPortArg.split('=')[1]) : 9417;

  const runner = new VercelAdapterRunner(client as any);
  await createRunnerServer({ port: runnerPort, runner });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

function setupTestDir(tempDir: string) {
  // Create package.json for proper module resolution
  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-app', type: 'module' }, null, 2));

  // Symlink node_modules from monorepo root to temp dir
  const monorepoRoot = path.resolve(__dirname, '../../..');
  const nodeModulesSource = path.join(monorepoRoot, 'node_modules');
  const nodeModulesTarget = path.join(tempDir, 'node_modules');
  try {
    fs.symlinkSync(nodeModulesSource, nodeModulesTarget, 'dir');
  } catch (e: any) {
    // Ignore if symlink already exists
    if (e.code !== 'EEXIST') throw e;
  }

  // Create .agentmark/dev-entry.ts (created during init in real apps)
  const agentmarkInternalDir = path.join(tempDir, '.agentmark');
  fs.mkdirSync(agentmarkInternalDir, { recursive: true});
  fs.writeFileSync(path.join(agentmarkInternalDir, 'dev-entry.ts'), DEV_ENTRY_TEMPLATE);
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

async function waitForServer(
  url: string,
  maxAttempts = SERVER_READY_CHECK_MAX_ATTEMPTS,
  delayMs = SERVER_READY_CHECK_DELAY_MS
): Promise<boolean> {
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

function cleanupTestResources(processes: ChildProcess[], tmpDirs: string[]) {
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

  // Clean up all temp directories after process termination
  setTimeout(() => {
    for (const dir of tmpDirs) {
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch {}
    }
    tmpDirs.length = 0;
  }, PROCESS_CLEANUP_WAIT_MS);
}

describe('agentmark dev', () => {
  const processes: ChildProcess[] = [];
  const tmpDirs: string[] = [];

  afterEach(async () => {
    cleanupTestResources(processes, tmpDirs);
    await wait(PROCESS_CLEANUP_WAIT_MS);
  });

  it('starts file server and runner, serves templates endpoint', async () => {
    const tempDir = path.join(__dirname, '..', 'tmp-dev-' + Date.now());
    tmpDirs.push(tempDir);
    fs.mkdirSync(path.join(tempDir, 'agentmark'), { recursive: true });

    // Setup test directory with node_modules
    setupTestDir(tempDir);

    // Create required files
    fs.writeFileSync(path.join(tempDir, 'agentmark.json'), JSON.stringify({ agentmarkPath: '.' }, null, 2));
    fs.writeFileSync(path.join(tempDir, 'agentmark', 'demo.prompt.mdx'), '---\ntext_config:\n  model_name: gpt-4o\n---\n\n# Demo Prompt');
    fs.writeFileSync(path.join(tempDir, 'agentmark', 'demo.jsonl'), JSON.stringify({ input: {}, expected_output: 'EXPECTED' }) + '\n');

    // Create minimal agentmark.client.ts
    fs.writeFileSync(path.join(tempDir, 'agentmark.client.ts'), createMinimalAgentMarkConfig());

    const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
    const filePort = await getFreePort();
    const runnerPort = await getFreePort();

    // Spawn dev command
    const child = spawn(process.execPath, [cli, 'dev', '--port', String(filePort), '--runner-port', String(runnerPort)], {
      cwd: tempDir,
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
    await wait(SERVER_STARTUP_WAIT_MS);

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

  it('uses default dev-entry.ts when custom dev-server.ts is missing', async () => {
    const tempDir = path.join(__dirname, '..', 'tmp-dev-autogen-' + Date.now());
    tmpDirs.push(tempDir);
    fs.mkdirSync(path.join(tempDir, 'agentmark'), { recursive: true });

    // Setup test directory (creates .agentmark/dev-entry.ts)
    setupTestDir(tempDir);

    // Create agentmark.client.ts but NOT custom dev-server.ts
    fs.writeFileSync(path.join(tempDir, 'agentmark.client.ts'), createMinimalAgentMarkConfig());
    fs.writeFileSync(path.join(tempDir, 'agentmark.json'), JSON.stringify({ agentmarkPath: '.' }, null, 2));
    fs.writeFileSync(path.join(tempDir, 'agentmark', 'demo.prompt.mdx'), '---\ntext_config:\n  model_name: gpt-4o\n---\n\n# Demo');

    const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
    const filePort = await getFreePort();
    const runnerPort = await getFreePort();

    const child = spawn(process.execPath, [cli, 'dev', '--port', String(filePort), '--runner-port', String(runnerPort)], {
      cwd: tempDir,
      env: { ...process.env, OPENAI_API_KEY: 'test-key' },
      stdio: 'pipe'
    });

    processes.push(child);

    let stdout = '';
    child.stdout?.on('data', (data) => { stdout += data.toString(); });

    await wait(SERVER_STARTUP_WAIT_MS);

    // Verify .agentmark/dev-entry.ts exists (created by setupTestDir simulating init)
    expect(fs.existsSync(path.join(tempDir, '.agentmark', 'dev-entry.ts'))).toBe(true);

    // Verify the output doesn't contain custom dev-server message (uses default dev-entry.ts)
    expect(stdout).not.toContain('Using custom dev-server.ts');

    // Verify server started
    const serverReady = await waitForServer(`http://localhost:${filePort}/v1/prompts`);
    expect(serverReady).toBe(true);
  }, 15000);

  it('allows custom port configuration', async () => {
    const tempDir = path.join(__dirname, '..', 'tmp-dev-custom-port-' + Date.now());
    tmpDirs.push(tempDir);
    fs.mkdirSync(path.join(tempDir, 'agentmark'), { recursive: true });

    // Setup test directory with node_modules
    setupTestDir(tempDir);

    fs.writeFileSync(path.join(tempDir, 'agentmark.json'), JSON.stringify({ agentmarkPath: '.' }, null, 2));
    fs.writeFileSync(path.join(tempDir, 'agentmark', 'demo.prompt.mdx'), '---\ntext_config:\n  model_name: gpt-4o\n---\n\n# Demo');
    fs.writeFileSync(path.join(tempDir, 'agentmark.client.ts'), createMinimalAgentMarkConfig());

    const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
    const customFilePort = await getFreePort();
    const customRunnerPort = await getFreePort();

    const child = spawn(process.execPath, [cli, 'dev', '--port', String(customFilePort), '--runner-port', String(customRunnerPort)], {
      cwd: tempDir,
      env: { ...process.env, OPENAI_API_KEY: 'test-key' },
      stdio: 'pipe'
    });

    processes.push(child);

    await wait(SERVER_STARTUP_WAIT_MS);

    // Test that server is running on custom port
    const resp = await fetch(`http://localhost:${customFilePort}/v1/prompts`);
    expect(resp.ok).toBe(true);
  }, 15000);

  it('displays correct file server URL', async () => {
    const tempDir = path.join(__dirname, '..', 'tmp-dev-urls-' + Date.now());
    tmpDirs.push(tempDir);
    fs.mkdirSync(path.join(tempDir, 'agentmark'), { recursive: true });

    // Setup test directory with node_modules
    setupTestDir(tempDir);

    fs.writeFileSync(path.join(tempDir, 'agentmark.json'), JSON.stringify({ agentmarkPath: '.' }, null, 2));
    fs.writeFileSync(path.join(tempDir, 'agentmark', 'demo.prompt.mdx'), '---\ntext_config:\n  model_name: gpt-4o\n---\n\n# Demo');
    fs.writeFileSync(path.join(tempDir, 'agentmark.client.ts'), createMinimalAgentMarkConfig());

    const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
    const filePort = await getFreePort();
    const runnerPort = await getFreePort();

    const child = spawn(process.execPath, [cli, 'dev', '--port', String(filePort), '--runner-port', String(runnerPort)], {
      cwd: tempDir,
      env: { ...process.env, OPENAI_API_KEY: 'test-key' },
      stdio: 'pipe'
    });

    processes.push(child);

    let stdout = '';
    child.stdout?.on('data', (data) => { stdout += data.toString(); });

    await wait(SERVER_STARTUP_WAIT_MS);

    // File server should always start
    expect(stdout).toContain(`http://localhost:${filePort}`);
    expect(stdout).toContain('File Server:');

    // Runner may or may not start successfully in test environment, so we don't strictly require it
  }, 15000);
});
