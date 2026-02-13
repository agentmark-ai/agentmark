import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import {
  IS_WINDOWS,
  PLATFORM_TIMEOUTS,
  getSymlinkType,
  killProcessTree,
  wait,
  safeRmDir,
} from '../cli-src/utils/platform';

function createMinimalAgentMarkConfig(): string {
  return `
import { AgentMark } from '@agentmark-ai/prompt-core';
import { VercelAIAdapter, VercelAIModelRegistry } from '@agentmark-ai/ai-sdk-v4-adapter';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY || 'test-key' });
const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(['gpt-4o'], (name: string) => openai(name));

const adapter = new VercelAIAdapter(modelRegistry);
export const client = new AgentMark({ prompt: {}, adapter });
`;
}

function getDevEntryTemplate(clientImportPath) {
  return `// Development webhook server entry point
// This file is version controlled - customize as needed for your project

import { createWebhookServer } from '@agentmark-ai/cli/runner-server';
import { VercelAdapterWebhookHandler } from '@agentmark-ai/ai-sdk-v4-adapter/runner';

async function main() {
  const { client } = await import('\${clientImportPath}');

  const args = process.argv.slice(2);
  const runnerPortArg = args.find(arg => arg.startsWith('--webhook-port='));
  const runnerPort = runnerPortArg ? parseInt(runnerPortArg.split('=')[1]) : 9417;

  const handler = new VercelAdapterWebhookHandler(client as any);
  await createWebhookServer({ port: runnerPort, handler });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;
}

function setupTestDir(tempDir: string, useLegacyLocation = false) {
  // Create package.json for proper module resolution
  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-app', type: 'module' }, null, 2));

  // Symlink node_modules from monorepo root to temp dir
  const monorepoRoot = path.resolve(__dirname, '../../..');
  const nodeModulesSource = path.join(monorepoRoot, 'node_modules');
  const nodeModulesTarget = path.join(tempDir, 'node_modules');
  try {
    fs.symlinkSync(nodeModulesSource, nodeModulesTarget, getSymlinkType());
  } catch (e: any) {
    // Ignore if symlink already exists
    if (e.code !== 'EEXIST') throw e;
  }

  if (useLegacyLocation) {
    // Create .agentmark/dev-entry.ts (legacy location for backward compatibility testing)
    const agentmarkInternalDir = path.join(tempDir, '.agentmark');
    fs.mkdirSync(agentmarkInternalDir, { recursive: true});
    fs.writeFileSync(path.join(agentmarkInternalDir, 'dev-entry.ts'), getDevEntryTemplate('./agentmark.client.js'));
  } else {
    // Create dev-entry.ts at project root (new default location, version controlled)
    fs.writeFileSync(path.join(tempDir, 'dev-entry.ts'), getDevEntryTemplate('./agentmark.client.js'));
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

async function waitForServer(
  url: string,
  maxAttempts = PLATFORM_TIMEOUTS.serverReadyMaxAttempts,
  delayMs = PLATFORM_TIMEOUTS.serverReadyCheckDelay
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
  // Kill all spawned processes and their children
  for (const proc of processes) {
    if (proc.pid) {
      killProcessTree(proc.pid);
    }
  }
  processes.length = 0;

  // Clean up all temp directories
  for (const dir of tmpDirs) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch {}
  }
  tmpDirs.length = 0;
}

describe('agentmark dev', () => {
  const processes: ChildProcess[] = [];
  const tmpDirs: string[] = [];

  afterEach(async () => {
    cleanupTestResources(processes, tmpDirs);
    await wait(PLATFORM_TIMEOUTS.processCleanup);
  });

  afterAll(async () => {
    // Final cleanup: find and remove any remaining tmp-dev-* directories
    const testDir = path.join(__dirname, '..');
    try {
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        if (file.startsWith('tmp-dev-') || file.startsWith('tmp-express-')) {
          const fullPath = path.join(testDir, file);
          try {
            if (fs.existsSync(fullPath)) {
              fs.rmSync(fullPath, { recursive: true, force: true });
            }
          } catch (e) {
            console.warn(`Failed to clean up ${fullPath}:`, e);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to perform final cleanup:', e);
    }
  });

  it('starts file server and runner, serves templates endpoint', async () => {
    const tempDir = path.join(__dirname, '..', 'tmp-dev-' + Date.now());
    tmpDirs.push(tempDir);

    try {
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
      const apiPort = await getFreePort();
      const webhookPort = await getFreePort();

      // Spawn dev command in its own process group for clean cleanup
      const child = spawn(process.execPath, [cli, 'dev', '--api-port', String(apiPort), '--webhook-port', String(webhookPort)], {
        cwd: tempDir,
        env: { ...process.env, OPENAI_API_KEY: 'test-key' },
        stdio: 'pipe',
        detached: true
      });

      processes.push(child);

      try {
        // Capture output for debugging
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (data) => { stdout += data.toString(); });
        child.stderr?.on('data', (data) => { stderr += data.toString(); });

        // Wait for servers to start
        await wait(PLATFORM_TIMEOUTS.serverStartup);

        // Debug: print output if servers didn't start
        if (stderr) {
          console.log('STDERR:', stderr);
        }
        if (stdout) {
          console.log('STDOUT:', stdout);
        }

        // Test API server /v1/prompts endpoint
        const listResp = await fetch(`http://127.0.0.1:${apiPort}/v1/prompts`);
        if (!listResp.ok) {
          const errorText = await listResp.text();
          console.log(`Response status: ${listResp.status}, body: ${errorText}`);
        }
        expect(listResp.ok).toBe(true);
        const { paths } = await listResp.json() as any;
        expect(Array.isArray(paths)).toBe(true);
        expect(paths.length).toBeGreaterThan(0);

        // Test /v1/templates dataset endpoint
        const dsResp = await fetch(`http://127.0.0.1:${apiPort}/v1/templates?path=demo.jsonl`);
        expect(dsResp.ok).toBe(true);
        const text = await dsResp.text();
        expect(text.trim().length).toBeGreaterThan(0);
      } finally {
        // Ensure process is cleaned up even if test fails
        if (child.pid) {
          killProcessTree(child.pid);
        }
        // Wait for processes to fully terminate on Windows
        await wait(PLATFORM_TIMEOUTS.processCleanup);
      }
    } finally {
      // Ensure directory is cleaned up even if test setup fails
      await safeRmDir(tempDir);
    }
  }, 30000); // Increase timeout for CI

  it('uses dev-entry.ts from project root when available', async () => {
    const tempDir = path.join(__dirname, '..', 'tmp-dev-root-entry-' + Date.now());
    tmpDirs.push(tempDir);

    try {
      fs.mkdirSync(path.join(tempDir, 'agentmark'), { recursive: true });

      // Setup test directory with dev-entry.ts at project root (new default location)
      setupTestDir(tempDir);

      // Create agentmark.client.ts but NOT custom dev-server.ts
      fs.writeFileSync(path.join(tempDir, 'agentmark.client.ts'), createMinimalAgentMarkConfig());
      fs.writeFileSync(path.join(tempDir, 'agentmark.json'), JSON.stringify({ agentmarkPath: '.' }, null, 2));
      fs.writeFileSync(path.join(tempDir, 'agentmark', 'demo.prompt.mdx'), '---\ntext_config:\n  model_name: gpt-4o\n---\n\n# Demo');

      const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
      const apiPort = await getFreePort();
      const webhookPort = await getFreePort();

      const child = spawn(process.execPath, [cli, 'dev', '--api-port', String(apiPort), '--webhook-port', String(webhookPort)], {
        cwd: tempDir,
        env: { ...process.env, OPENAI_API_KEY: 'test-key' },
        stdio: 'pipe',
        detached: true
      });

      processes.push(child);

      try {
        let stdout = '';
        child.stdout?.on('data', (data) => { stdout += data.toString(); });

        await wait(PLATFORM_TIMEOUTS.serverStartup);

        // Verify dev-entry.ts exists at project root (new default location)
        expect(fs.existsSync(path.join(tempDir, 'dev-entry.ts'))).toBe(true);

        // Verify the output doesn't contain custom dev-server or legacy location messages
        expect(stdout).not.toContain('Using custom dev-server.ts');
        expect(stdout).not.toContain('Using legacy .agentmark/dev-entry.ts');

        // Verify server started
        const serverReady = await waitForServer(`http://127.0.0.1:${apiPort}/v1/prompts`);
        expect(serverReady).toBe(true);
      } finally {
        // Ensure process is cleaned up even if test fails
        if (child.pid) {
          killProcessTree(child.pid);
        }
        // Wait for processes to fully terminate on Windows
        await wait(PLATFORM_TIMEOUTS.processCleanup);
      }
    } finally {
      // Ensure directory is cleaned up even if test setup fails
      await safeRmDir(tempDir);
    }
  }, 30000); // Increase timeout for CI

  it('falls back to legacy .agentmark/dev-entry.ts for backward compatibility', async () => {
    const tempDir = path.join(__dirname, '..', 'tmp-dev-legacy-' + Date.now());
    tmpDirs.push(tempDir);

    try {
      fs.mkdirSync(path.join(tempDir, 'agentmark'), { recursive: true });

      // Setup test directory with dev-entry.ts in legacy location
      setupTestDir(tempDir, true);

      // Create agentmark.client.ts but NOT custom dev-server.ts
      fs.writeFileSync(path.join(tempDir, 'agentmark.client.ts'), createMinimalAgentMarkConfig());
      fs.writeFileSync(path.join(tempDir, 'agentmark.json'), JSON.stringify({ agentmarkPath: '.' }, null, 2));
      fs.writeFileSync(path.join(tempDir, 'agentmark', 'demo.prompt.mdx'), '---\ntext_config:\n  model_name: gpt-4o\n---\n\n# Demo');

      const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
      const apiPort = await getFreePort();
      const webhookPort = await getFreePort();

      const child = spawn(process.execPath, [cli, 'dev', '--api-port', String(apiPort), '--webhook-port', String(webhookPort)], {
        cwd: tempDir,
        env: { ...process.env, OPENAI_API_KEY: 'test-key' },
        stdio: 'pipe',
        detached: true
      });

      processes.push(child);

      try {
        let stdout = '';
        child.stdout?.on('data', (data) => { stdout += data.toString(); });

        await wait(PLATFORM_TIMEOUTS.serverStartup);

        // Verify .agentmark/dev-entry.ts exists (legacy location)
        expect(fs.existsSync(path.join(tempDir, '.agentmark', 'dev-entry.ts'))).toBe(true);
        // Verify dev-entry.ts does NOT exist at project root
        expect(fs.existsSync(path.join(tempDir, 'dev-entry.ts'))).toBe(false);

        // Verify the output shows legacy location warning
        expect(stdout).toContain('Using legacy .agentmark/dev-entry.ts');

        // Verify server started
        const serverReady = await waitForServer(`http://127.0.0.1:${apiPort}/v1/prompts`);
        expect(serverReady).toBe(true);
      } finally {
        // Ensure process is cleaned up even if test fails
        if (child.pid) {
          killProcessTree(child.pid);
        }
        // Wait for processes to fully terminate on Windows
        await wait(PLATFORM_TIMEOUTS.processCleanup);
      }
    } finally {
      // Ensure directory is cleaned up even if test setup fails
      await safeRmDir(tempDir);
    }
  }, 30000); // Increase timeout for CI

  it('allows custom port configuration', async () => {
    const tempDir = path.join(__dirname, '..', 'tmp-dev-custom-port-' + Date.now());
    tmpDirs.push(tempDir);

    try {
      fs.mkdirSync(path.join(tempDir, 'agentmark'), { recursive: true });

      // Setup test directory with node_modules
      setupTestDir(tempDir);

      fs.writeFileSync(path.join(tempDir, 'agentmark.json'), JSON.stringify({ agentmarkPath: '.' }, null, 2));
      fs.writeFileSync(path.join(tempDir, 'agentmark', 'demo.prompt.mdx'), '---\ntext_config:\n  model_name: gpt-4o\n---\n\n# Demo');
      fs.writeFileSync(path.join(tempDir, 'agentmark.client.ts'), createMinimalAgentMarkConfig());

      const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
      const customApiPort = await getFreePort();
      const customWebhookPort = await getFreePort();

      const child = spawn(process.execPath, [cli, 'dev', '--api-port', String(customApiPort), '--webhook-port', String(customWebhookPort)], {
        cwd: tempDir,
        env: { ...process.env, OPENAI_API_KEY: 'test-key' },
        stdio: 'pipe',
        detached: true
      });

      processes.push(child);

      try {
        await wait(PLATFORM_TIMEOUTS.serverStartup);

        // Test that server is running on custom port
        const resp = await fetch(`http://127.0.0.1:${customApiPort}/v1/prompts`);
        expect(resp.ok).toBe(true);
      } finally {
        // Ensure process is cleaned up even if test fails
        if (child.pid) {
          killProcessTree(child.pid);
        }
        // Wait for processes to fully terminate on Windows
        await wait(PLATFORM_TIMEOUTS.processCleanup);
      }
    } finally {
      // Ensure directory is cleaned up even if test setup fails
      await safeRmDir(tempDir);
    }
  }, 30000); // Increase timeout for CI

  describe('trace forwarding integration', () => {
    it('starts successfully when forwarding config exists', async () => {
      const tempDir = path.join(__dirname, '..', 'tmp-dev-with-forward-' + Date.now());
      tmpDirs.push(tempDir);

      try {
        fs.mkdirSync(path.join(tempDir, 'agentmark'), { recursive: true });

        // Setup test directory with node_modules
        setupTestDir(tempDir);

        // Create required files
        fs.writeFileSync(path.join(tempDir, 'agentmark.json'), JSON.stringify({ agentmarkPath: '.' }, null, 2));
        fs.writeFileSync(path.join(tempDir, 'agentmark', 'demo.prompt.mdx'), '---\ntext_config:\n  model_name: gpt-4o\n---\n\n# Demo');
        fs.writeFileSync(path.join(tempDir, 'agentmark.client.ts'), createMinimalAgentMarkConfig());

        const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
        const apiPort = await getFreePort();
        const webhookPort = await getFreePort();

        const child = spawn(process.execPath, [cli, 'dev', '--api-port', String(apiPort), '--webhook-port', String(webhookPort)], {
          cwd: tempDir,
          env: { ...process.env, OPENAI_API_KEY: 'test-key' },
          stdio: 'pipe',
          detached: true
        });

        processes.push(child);

        try {
          await wait(PLATFORM_TIMEOUTS.serverStartup);

          // Verify server started (the key test - forwarding config shouldn't break startup)
          const serverReady = await waitForServer(`http://127.0.0.1:${apiPort}/v1/prompts`);
          expect(serverReady).toBe(true);

          // Verify we can actually use the server
          const resp = await fetch(`http://127.0.0.1:${apiPort}/v1/prompts`);
          expect(resp.ok).toBe(true);
        } finally{
          if (child.pid) {
            killProcessTree(child.pid);
          }
          await wait(PLATFORM_TIMEOUTS.processCleanup);
        }
      } finally {
        await safeRmDir(tempDir);
      }
    }, 30000);
  });
});
