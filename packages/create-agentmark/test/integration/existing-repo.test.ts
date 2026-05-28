import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

/**
 * Integration: running `npm create agentmark` inside an existing
 * non-AgentMark project (e.g. a Next.js / FastAPI repo) writes ONLY
 * the AgentMark-specific files and leaves the host project alone.
 *
 * This is the "wire AgentMark into my existing repo" scenario — the
 * minimal CLI must not touch package.json, tsconfig.json, .gitignore,
 * or any source files that already exist. Integration-side wiring
 * happens later via the setup-and-integration skill workflow.
 */

describe('Existing repo integration', () => {
  let tempDir: string;
  let originalArgv: string[];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmark-existing-'));
    originalArgv = process.argv;
    vi.resetModules();
    vi.doMock('child_process', () => ({
      execSync: () => {},
      execFileSync: () => {},
    }));
  });

  afterEach(() => {
    process.argv = originalArgv;
    fs.removeSync(tempDir);
    vi.resetModules();
    vi.doUnmock('child_process');
  });

  const runMain = async (argv: string[]): Promise<void> => {
    process.argv = ['node', 'create-agentmark', ...argv];
    const mod = await import('../../src/index.js');
    await mod.main();
  };

  /**
   * Simulate a typical Next.js project layout with the files the old
   * scaffolder used to merge/append into. The new minimal CLI must
   * not touch any of these.
   */
  const seedNextJsProject = (): {
    packageJson: Record<string, unknown>;
    tsConfig: Record<string, unknown>;
    gitignore: string;
    envFile: string;
  } => {
    const packageJson = {
      name: 'my-nextjs-app',
      version: '1.0.0',
      scripts: { dev: 'next dev', build: 'next build' },
      dependencies: { next: '^14.0.0', react: '^18.0.0' },
      devDependencies: { typescript: '^5.0.0' },
    };
    const tsConfig = { compilerOptions: { strict: true } };
    const gitignore = '# Custom\nnode_modules/\n.next/\n';
    const envFile = 'DATABASE_URL=postgres://localhost\n';

    fs.writeJsonSync(path.join(tempDir, 'package.json'), packageJson);
    fs.writeJsonSync(path.join(tempDir, 'tsconfig.json'), tsConfig);
    fs.writeFileSync(path.join(tempDir, '.gitignore'), gitignore);
    fs.writeFileSync(path.join(tempDir, '.env'), envFile);

    return { packageJson, tsConfig, gitignore, envFile };
  };

  it('writes AgentMark files alongside an existing Next.js project', async () => {
    seedNextJsProject();

    await runMain(['--path', tempDir, '--client', 'all', '--overwrite']);

    expect(fs.existsSync(path.join(tempDir, 'agentmark.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'agentmark', '.gitkeep'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.cursor', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.vscode', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.zed', 'settings.json'))).toBe(true);
  });

  it('does NOT modify existing package.json, tsconfig.json, .gitignore, or .env', async () => {
    const seeded = seedNextJsProject();

    await runMain(['--path', tempDir, '--client', 'all', '--overwrite']);

    // Each file is byte-identical to what we seeded.
    expect(fs.readJsonSync(path.join(tempDir, 'package.json'))).toEqual(seeded.packageJson);
    expect(fs.readJsonSync(path.join(tempDir, 'tsconfig.json'))).toEqual(seeded.tsConfig);
    expect(fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf-8')).toBe(seeded.gitignore);
    expect(fs.readFileSync(path.join(tempDir, '.env'), 'utf-8')).toBe(seeded.envFile);
  });

  it('does NOT scaffold legacy adapter / template files into an existing project', async () => {
    seedNextJsProject();

    await runMain(['--path', tempDir, '--client', 'all', '--overwrite']);

    // These were all part of the old scaffolder's output and are explicitly
    // out-of-scope for the minimal CLI. The setup-and-integration skill
    // workflow places these per-framework, querying the docs MCP.
    expect(fs.existsSync(path.join(tempDir, 'agentmark.client.ts'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'handler.ts'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'dev-entry.ts'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'index.ts'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'agentmark', 'party-planner.prompt.mdx'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'agentmark', 'customer-support.prompt.mdx'))).toBe(false);
  });

  it('does NOT init git in an existing project (existing git, or no git, either way)', async () => {
    seedNextJsProject();

    await runMain(['--path', tempDir, '--client', 'claude-code', '--overwrite']);

    // initGitRepo is gated by isExistingProject === false. With package.json
    // present, isExistingProject is true, so no .git directory should be
    // created by the CLI. (child_process is mocked so even if it tried, no
    // real `git init` would have run — but the gate prevents the call entirely.)
    expect(fs.existsSync(path.join(tempDir, '.git'))).toBe(false);
  });

  it('preserves an existing agentmark.json when --overwrite is absent and user picks "skip"', async () => {
    seedNextJsProject();
    const custom = { version: '2.0.0', mdxVersion: '1.0', agentmarkPath: '.', custom: 'value' };
    fs.writeJsonSync(path.join(tempDir, 'agentmark.json'), custom);

    // Without --overwrite, shouldWriteAgentmarkJson fires the conflict
    // prompt. Mock the `prompts` library to return the "skip" action so
    // the test runs non-interactively. (Without this mock, prompts blocks
    // waiting for stdin and the test times out.)
    vi.doMock('prompts', () => ({
      default: vi.fn().mockResolvedValue({ action: 'skip' }),
    }));

    await runMain(['--path', tempDir, '--client', 'claude-code']);

    // agentmark.json is byte-identical to the seeded custom version —
    // the CLI did not overwrite it.
    expect(fs.readJsonSync(path.join(tempDir, 'agentmark.json'))).toEqual(custom);
    // ...but the other files (MCP config, agentmark/) were still written.
    expect(fs.existsSync(path.join(tempDir, '.mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'agentmark', '.gitkeep'))).toBe(true);

    vi.doUnmock('prompts');
  });
});
