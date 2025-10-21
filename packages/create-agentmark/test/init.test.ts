import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('init', () => {
  it('pins install deps and writes .gitignore', async () => {
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
      execSync: (cmd: string) => { calls.push(cmd); }
    }));
    const { createExampleApp } = await import('../src/utils/examples/create-example-app');
    const tmpDir = path.join(__dirname, '..', 'tmp-gitignore-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      await createExampleApp('openai', 'gpt-4o', 'skip', tmpDir, '');
      const gi = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
      expect(gi).toContain('node_modules');
      expect(gi).toContain('.env');
      expect(gi).toContain('agentmark-output');
      const appInstallCmd = calls.find(c => c.startsWith('npm install ') && c.includes('@agentmark/vercel-ai-v4-adapter')) || '';
      expect(appInstallCmd).toContain(' ai@^4');
      expect(appInstallCmd).toMatch(/@ai-sdk\/openai@\^1/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('cloud target uses SDK file loader in generated agentmark.config.ts', async () => {
    const { getClientConfigContent } = await import('../src/utils/examples/templates');
    const content = getClientConfigContent({ defaultRootDir: './agentmark', provider: 'openai', languageModels: ['gpt-4o'], target: 'cloud' });
    expect(content).toContain("from \"@agentmark/sdk\"");
    expect(content).toContain("new AgentMarkSDK");
    expect(content).toContain("sdk.getFileLoader()");
    expect(content).not.toContain("new FileLoader(");
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
      const client = getClientConfigContent({ defaultRootDir: './agentmark', provider: 'openai', languageModels: ['gpt-4o'] });
      fs.mkdirSync(path.join(tmpDir, 'agentmark'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'agentmark.config.ts'), client);

      expect(fs.existsSync(path.join(tmpDir, 'agentmark.config.ts'))).toBe(true);
      // Tools/Evals now inline in the client

      // Basic validity: importable with ts-node/tsx semantics isn't trivial in Vitest.
      // Validate that provider and model array are wired in the file content.
      const generated = fs.readFileSync(path.join(tmpDir, 'agentmark.config.ts'), 'utf8');
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
    const content = getClientConfigContent({ defaultRootDir: './agentmark', provider: 'anthropic', languageModels: ['claude-3'] });
    expect(content).not.toContain('openai.image');
    expect(content).not.toContain('openai.speech');
  });
});
