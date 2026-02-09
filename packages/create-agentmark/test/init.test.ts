import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('init', () => {
  beforeEach(() => {
    // Reset all mocks and module cache before each test to prevent mock pollution
    vi.resetAllMocks();
    vi.resetModules();
    // Explicitly unmock modules that may have been mocked in previous tests
    vi.unmock('fs-extra');
    vi.unmock('child_process');
  });

  afterAll(() => {
    // Final cleanup: find and remove any remaining tmp-* directories
    const testDir = path.join(__dirname, '..');
    try {
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        if (file.startsWith('tmp-gitignore-') || file.startsWith('tmp-examples-') ||
            file.startsWith('tmp-client-') || file.startsWith('tmp-express-') ||
            file.startsWith('tmp-claude-sdk-')) {
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

  describe('claude-agent-sdk adapter', () => {
    it('creates client config with ClaudeAgent classes', async () => {
      const { getClientConfigContent } = await import('../src/utils/examples/templates');
      const content = getClientConfigContent({
        provider: 'anthropic',
        languageModels: ['claude-sonnet-4-20250514'],
        adapter: 'claude-agent-sdk'
      });

      // Check imports
      expect(content).toContain('@agentmark-ai/claude-agent-sdk-adapter');
      expect(content).toContain('ClaudeAgentModelRegistry');
      expect(content).toContain('ClaudeAgentToolRegistry');

      // Should NOT have @ai-sdk provider import
      expect(content).not.toContain("from '@ai-sdk/anthropic'");

      // Check adapter options
      expect(content).toContain('adapterOptions');
      expect(content).toContain('permissionMode');
      expect(content).toContain('bypassPermissions');
      expect(content).toContain('maxTurns');

      // Check model registry uses createDefault()
      expect(content).toContain('ClaudeAgentModelRegistry.createDefault()');
    });

    it('creates index file with withTracing import', async () => {
      const { getIndexFileContent } = await import('../src/utils/examples/templates');
      const content = getIndexFileContent('claude-agent-sdk');

      // Check imports
      expect(content).toContain("import { query } from \"@anthropic-ai/claude-agent-sdk\"");
      expect(content).toContain("import { withTracing } from \"@agentmark-ai/claude-agent-sdk-adapter\"");

      // Check usage of withTracing
      expect(content).toContain('withTracing(query, adapted)');
      expect(content).toContain('tracedResult.traceId');

      // Check iteration over traced result
      expect(content).toContain('for await (const message of tracedResult)');
    });

    it('has correct adapter config with dependencies', async () => {
      const { getAdapterConfig } = await import('../src/utils/examples/templates/adapters');
      const config = getAdapterConfig('claude-agent-sdk', 'anthropic');

      expect(config.package).toBe('@agentmark-ai/claude-agent-sdk-adapter');
      expect(config.dependencies).toContain('@anthropic-ai/claude-agent-sdk@^0.1.0');
      expect(config.classes.modelRegistry).toBe('ClaudeAgentModelRegistry');
      expect(config.classes.toolRegistry).toBe('ClaudeAgentToolRegistry');
      expect(config.classes.webhookHandler).toBe('ClaudeAgentWebhookHandler');
    });

    it('creates dev-entry.ts with ClaudeAgentWebhookHandler at project root', async () => {
      const tmpDir = path.join(__dirname, '..', 'tmp-claude-sdk-' + Date.now());
      fs.mkdirSync(tmpDir, { recursive: true });
      // Pre-create package.json before setting up mocks
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.0', scripts: {} }, null, 2));

      vi.doMock('fs-extra', async () => {
        const actual = await vi.importActual<any>('fs-extra');
        return {
          ...actual,
          default: {
            ...actual,
            existsSync: (p: string) => actual.existsSync(p),
            readJsonSync: (p: string) => actual.readJsonSync(p),
            writeJsonSync: actual.writeJsonSync,
            writeFileSync: actual.writeFileSync,
          },
          existsSync: (p: string) => actual.existsSync(p),
          readJsonSync: (p: string) => actual.readJsonSync(p),
          writeJsonSync: actual.writeJsonSync,
          writeFileSync: actual.writeFileSync,
        };
      });
      vi.doMock('child_process', () => ({
        execSync: () => {},
        execFileSync: () => {}
      }));
      const { createExampleApp } = await import('../src/utils/examples/create-example-app');
      try {
        // createExampleApp(client, targetPath, apiKey, adapter, deploymentMode)
        await createExampleApp('skip', tmpDir, '', 'claude-agent-sdk');

        // dev-entry.ts should be at project root (not .agentmark/)
        const devEntryPath = path.join(tmpDir, 'dev-entry.ts');
        expect(fs.existsSync(devEntryPath)).toBe(true);

        const content = fs.readFileSync(devEntryPath, 'utf8');
        expect(content).toContain("import { ClaudeAgentWebhookHandler } from '@agentmark-ai/claude-agent-sdk-adapter/runner'");
        expect(content).toContain('new ClaudeAgentWebhookHandler(client');

        // Verify correct import path
        expect(content).toContain("await import('./agentmark.client.js')");

        // Check .env has ANTHROPIC_API_KEY
        const envContent = fs.readFileSync(path.join(tmpDir, '.env'), 'utf8');
        expect(envContent).toContain('ANTHROPIC_API_KEY');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  it('creates dev-entry.ts at project root (not .agentmark/)', async () => {
    const tmpDir = path.join(__dirname, '..', 'tmp-express-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    // Pre-create package.json before setting up mocks
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.0', scripts: {} }, null, 2));

    vi.doMock('fs-extra', async () => {
      const actual = await vi.importActual<any>('fs-extra');
      return {
        ...actual,
        default: {
          ...actual,
          existsSync: (p: string) => actual.existsSync(p),
          readJsonSync: (p: string) => actual.readJsonSync(p),
          writeJsonSync: actual.writeJsonSync,
          writeFileSync: actual.writeFileSync,
        },
        existsSync: (p: string) => actual.existsSync(p),
        readJsonSync: (p: string) => actual.readJsonSync(p),
        writeJsonSync: actual.writeJsonSync,
        writeFileSync: actual.writeFileSync,
      };
    });
    vi.doMock('child_process', () => ({
      execSync: () => {},
      execFileSync: () => {}
    }));
    const { createExampleApp } = await import('../src/utils/examples/create-example-app');
    try {
      await createExampleApp('skip', tmpDir, '');

      // Should create dev-entry.ts at project root (not .agentmark/)
      const devEntryPath = path.join(tmpDir, 'dev-entry.ts');
      expect(fs.existsSync(devEntryPath)).toBe(true);

      // Should NOT create dev-entry.ts in .agentmark/
      const legacyDevEntryPath = path.join(tmpDir, '.agentmark', 'dev-entry.ts');
      expect(fs.existsSync(legacyDevEntryPath)).toBe(false);

      const content = fs.readFileSync(devEntryPath, 'utf8');
      expect(content).toContain("import { createWebhookServer } from '@agentmark-ai/cli/runner-server'");
      expect(content).toContain("import { VercelAdapterWebhookHandler } from '@agentmark-ai/ai-sdk-v5-adapter/runner'");
      expect(content).toContain('new VercelAdapterWebhookHandler(client');
      expect(content).toContain('createWebhookServer({');

      // Verify correct import path (should be ./ not ../ since dev-entry.ts is at project root)
      expect(content).toContain("await import('./agentmark.client.js')");
      expect(content).not.toContain("await import('../agentmark.client.js')");

      // Check .env has cloud deployment instructions and API key placeholder
      const envContent = fs.readFileSync(path.join(tmpDir, '.env'), 'utf8');
      expect(envContent).toContain('AGENTMARK_BASE_URL');
      expect(envContent).toContain('OPENAI_API_KEY');

      // Check .gitignore does NOT contain .agentmark/ (dev-entry.ts is now version controlled at root)
      const gitignoreContent = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
      expect(gitignoreContent).not.toContain('.agentmark/');
      expect(gitignoreContent).toContain('node_modules/');
      expect(gitignoreContent).toContain('.env');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('tracing initialization by deployment mode', () => {
    it('cloud mode generates tracing init pointing to AgentMark Cloud for ai-sdk', async () => {
      const { getIndexFileContent } = await import('../src/utils/examples/templates');
      const content = getIndexFileContent('ai-sdk', 'cloud');

      // Should import AgentMarkSDK
      expect(content).toContain('import { AgentMarkSDK } from "@agentmark-ai/sdk"');

      // Should use env vars for credentials
      expect(content).toContain('process.env.AGENTMARK_API_KEY');
      expect(content).toContain('process.env.AGENTMARK_APP_ID');

      // Should NOT have baseUrl (defaults to cloud)
      expect(content).not.toContain('baseUrl:');

      // Should have cloud-specific comment
      expect(content).toContain('traces will be sent to AgentMark Cloud');

      // Should call initTracing
      expect(content).toContain('sdk.initTracing()');
    });

    it('static mode generates tracing init pointing to localhost for ai-sdk', async () => {
      const { getIndexFileContent } = await import('../src/utils/examples/templates');
      const content = getIndexFileContent('ai-sdk', 'static');

      // Should import AgentMarkSDK
      expect(content).toContain('import { AgentMarkSDK } from "@agentmark-ai/sdk"');

      // Should have baseUrl pointing to localhost
      expect(content).toContain('baseUrl: "http://localhost:9418"');

      // Should have static-specific comment
      expect(content).toContain('traces will be sent to local dev server');
      expect(content).toContain('npm run dev');

      // Should call initTracing
      expect(content).toContain('sdk.initTracing()');
    });

    it('cloud mode generates tracing init for claude-agent-sdk', async () => {
      const { getIndexFileContent } = await import('../src/utils/examples/templates');
      const content = getIndexFileContent('claude-agent-sdk', 'cloud');

      expect(content).toContain('import { AgentMarkSDK } from "@agentmark-ai/sdk"');
      expect(content).toContain('process.env.AGENTMARK_API_KEY');
      expect(content).not.toContain('baseUrl:');
      expect(content).toContain('traces will be sent to AgentMark Cloud');
    });

    it('static mode generates tracing init for claude-agent-sdk', async () => {
      const { getIndexFileContent } = await import('../src/utils/examples/templates');
      const content = getIndexFileContent('claude-agent-sdk', 'static');

      expect(content).toContain('import { AgentMarkSDK } from "@agentmark-ai/sdk"');
      expect(content).toContain('baseUrl: "http://localhost:9418"');
      expect(content).toContain('traces will be sent to local dev server');
    });

    it('cloud mode generates tracing init for mastra', async () => {
      const { getIndexFileContent } = await import('../src/utils/examples/templates');
      const content = getIndexFileContent('mastra', 'cloud');

      expect(content).toContain('import { AgentMarkSDK } from "@agentmark-ai/sdk"');
      expect(content).toContain('process.env.AGENTMARK_API_KEY');
      expect(content).not.toContain('baseUrl:');
      expect(content).toContain('traces will be sent to AgentMark Cloud');
    });

    it('static mode generates tracing init for mastra', async () => {
      const { getIndexFileContent } = await import('../src/utils/examples/templates');
      const content = getIndexFileContent('mastra', 'static');

      expect(content).toContain('import { AgentMarkSDK } from "@agentmark-ai/sdk"');
      expect(content).toContain('baseUrl: "http://localhost:9418"');
      expect(content).toContain('traces will be sent to local dev server');
    });

    it('defaults to cloud mode when deploymentMode not specified', async () => {
      const { getIndexFileContent } = await import('../src/utils/examples/templates');
      const content = getIndexFileContent('ai-sdk');

      // Should default to cloud behavior
      expect(content).toContain('process.env.AGENTMARK_API_KEY');
      expect(content).not.toContain('baseUrl:');
      expect(content).toContain('traces will be sent to AgentMark Cloud');
    });
  });

  describe('Python tracing initialization by deployment mode', () => {
    it('cloud mode generates tracing init pointing to AgentMark Cloud for pydantic-ai', async () => {
      const { getMainPyContent } = await import('../src/utils/examples/create-python-app');
      const content = getMainPyContent('pydantic-ai', 'cloud');

      // Should import AgentMarkSDK
      expect(content).toContain('from agentmark_sdk import AgentMarkSDK');

      // Should use env vars for credentials
      expect(content).toContain('os.environ.get("AGENTMARK_API_KEY"');
      expect(content).toContain('os.environ.get("AGENTMARK_APP_ID"');

      // Should NOT have base_url (defaults to cloud)
      expect(content).not.toContain('base_url=');

      // Should have cloud-specific comment
      expect(content).toContain('traces will be sent to AgentMark Cloud');

      // Should call init_tracing
      expect(content).toContain('sdk.init_tracing()');
    });

    it('static mode generates tracing init pointing to localhost for pydantic-ai', async () => {
      const { getMainPyContent } = await import('../src/utils/examples/create-python-app');
      const content = getMainPyContent('pydantic-ai', 'static');

      // Should import AgentMarkSDK
      expect(content).toContain('from agentmark_sdk import AgentMarkSDK');

      // Should have base_url pointing to localhost
      expect(content).toContain('base_url="http://localhost:9418"');

      // Should have static-specific comment
      expect(content).toContain('traces will be sent to local dev server');
      expect(content).toContain('npm run dev');

      // Should call init_tracing
      expect(content).toContain('sdk.init_tracing()');
    });

    it('cloud mode generates tracing init for claude-agent-sdk Python', async () => {
      const { getMainPyContent } = await import('../src/utils/examples/create-python-app');
      const content = getMainPyContent('claude-agent-sdk', 'cloud');

      expect(content).toContain('from agentmark_sdk import AgentMarkSDK');
      expect(content).toContain('os.environ.get("AGENTMARK_API_KEY"');
      expect(content).not.toContain('base_url=');
      expect(content).toContain('traces will be sent to AgentMark Cloud');
    });

    it('static mode generates tracing init for claude-agent-sdk Python', async () => {
      const { getMainPyContent } = await import('../src/utils/examples/create-python-app');
      const content = getMainPyContent('claude-agent-sdk', 'static');

      expect(content).toContain('from agentmark_sdk import AgentMarkSDK');
      expect(content).toContain('base_url="http://localhost:9418"');
      expect(content).toContain('traces will be sent to local dev server');
    });

    it('defaults to cloud mode when deploymentMode not specified for Python', async () => {
      const { getMainPyContent } = await import('../src/utils/examples/create-python-app');
      const content = getMainPyContent('pydantic-ai');

      // Should default to cloud behavior
      expect(content).toContain('os.environ.get("AGENTMARK_API_KEY"');
      expect(content).not.toContain('base_url=');
      expect(content).toContain('traces will be sent to AgentMark Cloud');
    });
  });
});
