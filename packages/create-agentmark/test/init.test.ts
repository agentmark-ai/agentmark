import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

/**
 * End-to-end smoke tests for `npm create agentmark` against the new
 * minimal flow. We patch `process.argv` to pass all flags so prompts
 * never fire, run `main()` against a real tmp directory, and assert
 * which files appear.
 *
 * `installAgentmarkSkill` self-skips when `VITEST=true` (set by vitest
 * automatically), so the test doesn't shell out to `npx skills add`.
 * `child_process` is mocked so `initGitRepo` doesn't actually run git.
 */

describe('main() — minimal init', () => {
  let tempDir: string;
  let originalArgv: string[];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmark-init-'));
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
    const mod = await import('../src/index.js');
    await mod.main();
  };

  it('writes agentmark.json with the canonical default shape', async () => {
    await runMain(['--path', tempDir, '--client', 'claude-code', '--overwrite']);

    const config = fs.readJsonSync(path.join(tempDir, 'agentmark.json'));
    expect(config).toEqual({
      $schema:
        'https://raw.githubusercontent.com/agentmark-ai/agentmark/refs/heads/main/packages/cli/agentmark.schema.json',
      version: '2.0.0',
      mdxVersion: '1.0',
      agentmarkPath: '.',
    });
  });

  it('creates an empty agentmark/ directory with a .gitkeep', async () => {
    await runMain(['--path', tempDir, '--client', 'claude-code', '--overwrite']);

    const agentmarkDir = path.join(tempDir, 'agentmark');
    expect(fs.existsSync(agentmarkDir)).toBe(true);
    expect(fs.statSync(agentmarkDir).isDirectory()).toBe(true);
    expect(fs.existsSync(path.join(agentmarkDir, '.gitkeep'))).toBe(true);
    // The folder is empty except for the .gitkeep — no scaffolded prompts.
    expect(fs.readdirSync(agentmarkDir)).toEqual(['.gitkeep']);
  });

  it('writes one MCP config per selected client (using "all")', async () => {
    await runMain(['--path', tempDir, '--client', 'all', '--overwrite']);

    expect(fs.existsSync(path.join(tempDir, '.mcp.json'))).toBe(true);            // claude-code
    expect(fs.existsSync(path.join(tempDir, '.cursor/mcp.json'))).toBe(true);     // cursor
    expect(fs.existsSync(path.join(tempDir, '.vscode/mcp.json'))).toBe(true);     // vscode
    expect(fs.existsSync(path.join(tempDir, '.zed/settings.json'))).toBe(true);   // zed
  });

  it('writes only the MCP config for the single client passed', async () => {
    await runMain(['--path', tempDir, '--client', 'cursor', '--overwrite']);

    expect(fs.existsSync(path.join(tempDir, '.cursor/mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.mcp.json'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, '.vscode'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, '.zed'))).toBe(false);
  });

  it('does NOT scaffold the legacy template files (agentmark.client.ts, handler.ts, .env, etc.)', async () => {
    await runMain(['--path', tempDir, '--client', 'all', '--overwrite']);

    // Anything the old scaffolder used to write that we explicitly stopped writing:
    expect(fs.existsSync(path.join(tempDir, 'agentmark.client.ts'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'handler.ts'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'handler.py'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'index.ts'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'dev-entry.ts'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'main.py'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'agentmark_client.py'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'pyproject.toml'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, '.env'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'agentmark/party-planner.prompt.mdx'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'agentmark/customer-support.prompt.mdx'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'agentmark/story-teller.prompt.mdx'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'agentmark/animal-drawing.prompt.mdx'))).toBe(false);
  });

  it('respects --overwrite when agentmark.json already exists', async () => {
    fs.writeJsonSync(path.join(tempDir, 'agentmark.json'), { custom: 'pre-existing' });

    await runMain(['--path', tempDir, '--client', 'claude-code', '--overwrite']);

    const config = fs.readJsonSync(path.join(tempDir, 'agentmark.json'));
    expect(config.version).toBe('2.0.0');
    expect(config).not.toHaveProperty('custom');
  });

  it('preserves an existing agentmark/ directory and its contents', async () => {
    const existingPromptPath = path.join(tempDir, 'agentmark', 'my-existing.prompt.mdx');
    fs.ensureDirSync(path.join(tempDir, 'agentmark'));
    fs.writeFileSync(existingPromptPath, '---\nname: existing\n---\n');

    await runMain(['--path', tempDir, '--client', 'claude-code', '--overwrite']);

    // Existing file untouched
    expect(fs.readFileSync(existingPromptPath, 'utf-8')).toBe('---\nname: existing\n---\n');
    // .gitkeep NOT added — folder isn't empty
    expect(fs.existsSync(path.join(tempDir, 'agentmark', '.gitkeep'))).toBe(false);
  });
});
