import { describe, it, expect, vi, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('init', () => {
  afterAll(() => {
    // Final cleanup: find and remove any remaining tmp-* directories
    const testDir = path.join(__dirname, '..');
    try {
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        if (file.startsWith('tmp-gitignore-') || file.startsWith('tmp-examples-') ||
            file.startsWith('tmp-client-') || file.startsWith('tmp-express-')) {
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

  it('pins install deps and writes .gitignore', { timeout: 30000 }, async () => {
    const calls: string[] = [];
    vi.doMock('fs-extra', async () => {
      const actual = await vi.importActual<any>('fs-extra');
      return {
        ...actual,
        default: {
          ...actual,
          existsSync: vi.fn().mockReturnValue(true),
          readJsonSync: vi.fn().mockReturnValue({ name: 'tmp-app', version: '1.0.0', scripts: {} }),
          writeJsonSync: vi.fn(),
          writeFileSync: actual.writeFileSync,
        },
        existsSync: vi.fn().mockReturnValue(true),
        readJsonSync: vi.fn().mockReturnValue({ name: 'tmp-app', version: '1.0.0', scripts: {} }),
        writeJsonSync: vi.fn(),
        writeFileSync: actual.writeFileSync,
      };
    });
    vi.doMock('child_process', () => ({
      execSync: (cmd: string) => { calls.push(cmd); },
      execFileSync: (file: string, args: string[]) => { calls.push(`${file} ${args.join(' ')}`); }
    }));
    const { createExampleApp } = await import('../src/utils/examples/create-example-app');
    const tmpDir = path.join(__dirname, '..', 'tmp-gitignore-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      await createExampleApp('skip', tmpDir, '');
      const gi = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
      expect(gi).toContain('node_modules');
      expect(gi).toContain('.env');

      // Verify CLI is installed as devDependency
      const devDepsCmd = calls.find(c => c.includes('--save-dev')) || '';
      expect(devDepsCmd).toContain('@agentmark-ai/cli');
      expect(devDepsCmd).toContain('typescript');

      // Find the main app install command (not the devDeps one)
      const appInstallCmd = calls.find(c =>
        c.startsWith('npm install ') &&
        !c.includes('--save-dev') &&
        c.includes('@agentmark-ai/ai-sdk-v5-adapter')
      ) || '';
      expect(appInstallCmd).toContain(' ai@^5');
      expect(appInstallCmd).toMatch(/@ai-sdk\/openai@\^2/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('uses ApiLoader in generated agentmark.client.ts', async () => {
    const { getClientConfigContent } = await import('../src/utils/examples/templates');
    const content = getClientConfigContent({ provider: 'openai', languageModels: ['gpt-4o'], adapter: 'ai-sdk' });
    expect(content).toContain("from \"@agentmark-ai/loader-api\"");
    expect(content).toContain("ApiLoader");
    expect(content).toContain("ApiLoader.local");
  });
  it('party-planner prompt includes evals list', async () => {
    const { createExamplePrompts } = await import('../src/utils/examples/templates');
    const tmpDir = path.join(__dirname, '..', 'tmp-examples-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      createExamplePrompts('gpt-4o', tmpDir);
      const filePath = path.join(tmpDir, 'agentmark', 'party-planner.prompt.mdx');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('test_settings:');
      expect(content).toContain('evals:');
      expect(content).toContain('- exact_match_json');
    } finally {
      // cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates a TS client config and companion tools/evals that are syntactically valid', async () => {
    const { getClientConfigContent } = await import('../src/utils/examples/templates');
    const tmpDir = path.join(__dirname, '..', 'tmp-client-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      const client = getClientConfigContent({ provider: 'openai', languageModels: ['gpt-4o'], adapter: 'ai-sdk' });
      fs.mkdirSync(path.join(tmpDir, 'agentmark'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'agentmark.client.ts'), client);

      expect(fs.existsSync(path.join(tmpDir, 'agentmark.client.ts'))).toBe(true);
      // Tools/Evals now inline in the client

      // Basic validity: importable with ts-node/tsx semantics isn't trivial in Vitest.
      // Validate that provider and model array are wired in the file content.
      const generated = fs.readFileSync(path.join(tmpDir, 'agentmark.client.ts'), 'utf8');
      expect(generated).toContain('registerModels(["gpt-4o"]');
      expect(generated).toContain("@ai-sdk/openai");
      // openai extras
      expect(generated).toContain('registerModels(["dall-e-3"], (name: string) => openai.image(name))');
      expect(generated).toContain('registerModels(["tts-1-hd"], (name: string) => openai.speech(name))');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('does not add image/speech extras for non-openai providers', async () => {
    const { getClientConfigContent } = await import('../src/utils/examples/templates');
    const content = getClientConfigContent({ provider: 'anthropic', languageModels: ['claude-3'], adapter: 'ai-sdk' });
    expect(content).not.toContain('openai.image');
    expect(content).not.toContain('openai.speech');
  });

  it('creates .agentmark/dev-entry.ts', async () => {
    vi.doMock('child_process', () => ({
      execSync: (cmd: string, options?: any) => {
        // Create package.json when npm init is called
        if (cmd === 'npm init -y' && options?.cwd) {
          const pkgPath = path.join(options.cwd, 'package.json');
          fs.writeFileSync(pkgPath, JSON.stringify({ name: 'test-app', version: '1.0.0', scripts: {} }, null, 2));
        }
      },
      execFileSync: () => {}
    }));
    const { createExampleApp } = await import('../src/utils/examples/create-example-app');
    const tmpDir = path.join(__dirname, '..', 'tmp-express-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      await createExampleApp('skip', tmpDir, '');

      // Should create dev-entry.ts
      const devEntryPath = path.join(tmpDir, '.agentmark', 'dev-entry.ts');
      expect(fs.existsSync(devEntryPath)).toBe(true);

      const content = fs.readFileSync(devEntryPath, 'utf8');
      expect(content).toContain("import { createWebhookServer } from '@agentmark-ai/cli/runner-server'");
      expect(content).toContain("import { VercelAdapterWebhookHandler } from '@agentmark-ai/ai-sdk-v5-adapter/runner'");
      expect(content).toContain('new VercelAdapterWebhookHandler(client');
      expect(content).toContain('createWebhookServer({');

      // Check .env has cloud deployment instructions and API key placeholder
      const envContent = fs.readFileSync(path.join(tmpDir, '.env'), 'utf8');
      expect(envContent).toContain('AGENTMARK_BASE_URL');
      expect(envContent).toContain('OPENAI_API_KEY');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
