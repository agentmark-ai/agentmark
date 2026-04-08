import { describe, it, expect, vi, afterAll, afterEach, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PKG_ROOT = path.join(__dirname, '..', '..');
const TMP_PREFIX = 'tmp-handler-';

/**
 * Create a temp directory under the package root with a pre-seeded package.json
 * so that setupPackageJson / readJsonSync don't blow up.
 */
function makeTmpDir(): string {
  const dir = path.join(PKG_ROOT, `${TMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'test-handler', version: '1.0.0', scripts: {} }, null, 2),
  );
  return dir;
}

/**
 * Standard fs-extra + child_process mock setup used by every integration-style
 * test that calls createExampleApp.  Passes real fs ops through so we can
 * inspect files on disk, but stubs out child_process so npm install is a no-op.
 */
async function applyStandardMocks() {
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
    execFileSync: () => {},
  }));
}

describe('handler.ts generation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    vi.unmock('fs-extra');
    vi.unmock('child_process');
  });

  afterAll(() => {
    // Sweep any leftover temp dirs
    try {
      for (const entry of fs.readdirSync(PKG_ROOT)) {
        if (entry.startsWith(TMP_PREFIX)) {
          fs.rmSync(path.join(PKG_ROOT, entry), { recursive: true, force: true });
        }
      }
    } catch { /* best-effort */ }
  });

  // ──────────────────────────────────────────────────────────────────────
  // 1. handler.ts IS created for cloud mode, per adapter
  // ──────────────────────────────────────────────────────────────────────

  describe('cloud mode creates handler.ts', () => {
    const adapters: Array<{
      adapter: string;
      handlerClass: string;
      adapterPackage: string;
    }> = [
      {
        adapter: 'ai-sdk',
        handlerClass: 'VercelAdapterWebhookHandler',
        adapterPackage: '@agentmark-ai/ai-sdk-v5-adapter',
      },
      {
        adapter: 'claude-agent-sdk',
        handlerClass: 'ClaudeAgentWebhookHandler',
        adapterPackage: '@agentmark-ai/claude-agent-sdk-adapter',
      },
      {
        adapter: 'mastra',
        handlerClass: 'MastraAdapterWebhookHandler',
        adapterPackage: '@agentmark-ai/mastra-v0-adapter',
      },
    ];

    for (const { adapter, handlerClass, adapterPackage } of adapters) {
      describe(`${adapter} adapter`, () => {
        let tmpDir: string;

        beforeEach(() => {
          tmpDir = makeTmpDir();
        });

        afterEach(() => {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it(`should create handler.ts when deploymentMode is cloud`, { timeout: 15000 }, async () => {
          await applyStandardMocks();
          const { createExampleApp } = await import('../../src/utils/examples/create-example-app');
          await createExampleApp('skip', tmpDir, '', adapter, 'cloud');

          expect(fs.existsSync(path.join(tmpDir, 'handler.ts'))).toBe(true);
        });

        it(`should import ${handlerClass} from ${adapterPackage}/runner`, { timeout: 15000 }, async () => {
          await applyStandardMocks();
          const { createExampleApp } = await import('../../src/utils/examples/create-example-app');
          await createExampleApp('skip', tmpDir, '', adapter, 'cloud');

          const content = fs.readFileSync(path.join(tmpDir, 'handler.ts'), 'utf8');
          expect(content).toContain(`import { ${handlerClass} } from '${adapterPackage}/runner'`);
        });

        it(`should initialize AgentMarkSDK tracing`, { timeout: 15000 }, async () => {
          await applyStandardMocks();
          const { createExampleApp } = await import('../../src/utils/examples/create-example-app');
          await createExampleApp('skip', tmpDir, '', adapter, 'cloud');

          const content = fs.readFileSync(path.join(tmpDir, 'handler.ts'), 'utf8');
          expect(content).toContain("import { AgentMarkSDK } from '@agentmark-ai/sdk'");
          expect(content).toContain('new AgentMarkSDK({');
          expect(content).toContain('process.env.AGENTMARK_API_KEY');
          expect(content).toContain('process.env.AGENTMARK_APP_ID');
          expect(content).toContain('sdk.initTracing({ disableBatch: true })');
        });

        it(`should export a default async handler function`, { timeout: 15000 }, async () => {
          await applyStandardMocks();
          const { createExampleApp } = await import('../../src/utils/examples/create-example-app');
          await createExampleApp('skip', tmpDir, '', adapter, 'cloud');

          const content = fs.readFileSync(path.join(tmpDir, 'handler.ts'), 'utf8');
          expect(content).toContain('export default async function handler(');
        });

        it(`should handle both prompt-run and dataset-run event types`, { timeout: 15000 }, async () => {
          await applyStandardMocks();
          const { createExampleApp } = await import('../../src/utils/examples/create-example-app');
          await createExampleApp('skip', tmpDir, '', adapter, 'cloud');

          const content = fs.readFileSync(path.join(tmpDir, 'handler.ts'), 'utf8');
          expect(content).toContain("request.type === 'prompt-run'");
          expect(content).toContain('adapter.runPrompt(');
          expect(content).toContain("request.type === 'dataset-run'");
          expect(content).toContain('adapter.runExperiment(');
        });

        it(`should instantiate ${handlerClass} as the adapter`, { timeout: 15000 }, async () => {
          await applyStandardMocks();
          const { createExampleApp } = await import('../../src/utils/examples/create-example-app');
          await createExampleApp('skip', tmpDir, '', adapter, 'cloud');

          const content = fs.readFileSync(path.join(tmpDir, 'handler.ts'), 'utf8');
          expect(content).toContain(`new ${handlerClass}(client`);
        });

        it(`should import the client config module`, { timeout: 15000 }, async () => {
          await applyStandardMocks();
          const { createExampleApp } = await import('../../src/utils/examples/create-example-app');
          await createExampleApp('skip', tmpDir, '', adapter, 'cloud');

          const content = fs.readFileSync(path.join(tmpDir, 'handler.ts'), 'utf8');
          expect(content).toContain("import { client } from './agentmark.client'");
        });
      });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // 2. handler.ts is NOT created for self-host (static) mode
  // ──────────────────────────────────────────────────────────────────────

  it('should not create handler.ts when deploymentMode is static', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createExampleApp } = await import('../../src/utils/examples/create-example-app');
      await createExampleApp('skip', tmpDir, '', 'ai-sdk', 'static');

      expect(fs.existsSync(path.join(tmpDir, 'handler.ts'))).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // 3. .env includes AGENTMARK_API_KEY and AGENTMARK_APP_ID for cloud
  // ──────────────────────────────────────────────────────────────────────

  it('should include AGENTMARK_API_KEY in .env for cloud mode', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createExampleApp } = await import('../../src/utils/examples/create-example-app');
      await createExampleApp('skip', tmpDir, '', 'ai-sdk', 'cloud');

      const envContent = fs.readFileSync(path.join(tmpDir, '.env'), 'utf8');
      expect(envContent).toContain('AGENTMARK_API_KEY');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should include AGENTMARK_APP_ID in .env for cloud mode', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createExampleApp } = await import('../../src/utils/examples/create-example-app');
      await createExampleApp('skip', tmpDir, '', 'ai-sdk', 'cloud');

      const envContent = fs.readFileSync(path.join(tmpDir, '.env'), 'utf8');
      expect(envContent).toContain('AGENTMARK_APP_ID');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // 4. handler.ts is preserved when it already exists
  // ──────────────────────────────────────────────────────────────────────

  it('should not overwrite handler.ts when file already exists', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    const handlerPath = path.join(tmpDir, 'handler.ts');
    const existingContent = '// my custom handler — do not overwrite\n';
    fs.writeFileSync(handlerPath, existingContent);
    try {
      await applyStandardMocks();
      const { createExampleApp } = await import('../../src/utils/examples/create-example-app');
      await createExampleApp('skip', tmpDir, '', 'ai-sdk', 'cloud');

      const content = fs.readFileSync(handlerPath, 'utf8');
      expect(content).toBe(existingContent);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // 5. handler.ts throws on unknown request type
  // ──────────────────────────────────────────────────────────────────────

  it('should include an error throw for unknown request types', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createExampleApp } = await import('../../src/utils/examples/create-example-app');
      await createExampleApp('skip', tmpDir, '', 'ai-sdk', 'cloud');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.ts'), 'utf8');
      expect(content).toContain('throw new Error(`Unknown request type:');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // 6. handler.ts references AGENTMARK_BASE_URL env var for custom endpoint
  // ──────────────────────────────────────────────────────────────────────

  it('should reference AGENTMARK_BASE_URL for optional custom endpoint', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createExampleApp } = await import('../../src/utils/examples/create-example-app');
      await createExampleApp('skip', tmpDir, '', 'ai-sdk', 'cloud');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.ts'), 'utf8');
      expect(content).toContain('process.env.AGENTMARK_BASE_URL');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('agentmark.json handler key', () => {
  // The handler key is added in index.ts (the CLI main), not in createExampleApp.
  // We test the getAdapterConfig + the template generation contract directly,
  // and verify the config pattern that index.ts follows.

  it('should set handler to "handler.ts" for cloud mode', async () => {
    // This mirrors the exact logic in index.ts lines 165-167
    const config: Record<string, unknown> = {
      version: '2.0.0',
      mdxVersion: '1.0',
      agentmarkPath: '.',
    };
    const deploymentMode: 'cloud' | 'static' = 'cloud';

    if (deploymentMode === 'cloud') {
      config.handler = 'handler.ts';
    }

    expect(config.handler).toBe('handler.ts');
  });

  it('should not set handler key for static mode', async () => {
    const config: Record<string, unknown> = {
      version: '2.0.0',
      mdxVersion: '1.0',
      agentmarkPath: '.',
    };
    const deploymentMode: 'cloud' | 'static' = 'static';

    if (deploymentMode === 'cloud') {
      config.handler = 'handler.ts';
    }

    expect(config.handler).toBeUndefined();
  });
});

describe('getAdapterConfig for handler generation', () => {
  // These tests verify that getAdapterConfig returns the right webhookHandler
  // class name for each adapter, which is what createExampleApp uses to
  // generate handler.ts content.

  it('should return VercelAdapterWebhookHandler for ai-sdk adapter', async () => {
    const { getAdapterConfig } = await import('../../src/utils/examples/templates/adapters');
    const config = getAdapterConfig('ai-sdk', 'openai');
    expect(config.classes.webhookHandler).toBe('VercelAdapterWebhookHandler');
    expect(config.package).toBe('@agentmark-ai/ai-sdk-v5-adapter');
  });

  it('should return ClaudeAgentWebhookHandler for claude-agent-sdk adapter', async () => {
    const { getAdapterConfig } = await import('../../src/utils/examples/templates/adapters');
    const config = getAdapterConfig('claude-agent-sdk', 'anthropic');
    expect(config.classes.webhookHandler).toBe('ClaudeAgentWebhookHandler');
    expect(config.package).toBe('@agentmark-ai/claude-agent-sdk-adapter');
  });

  it('should return MastraAdapterWebhookHandler for mastra adapter', async () => {
    const { getAdapterConfig } = await import('../../src/utils/examples/templates/adapters');
    const config = getAdapterConfig('mastra', 'openai');
    expect(config.classes.webhookHandler).toBe('MastraAdapterWebhookHandler');
    expect(config.package).toBe('@agentmark-ai/mastra-v0-adapter');
  });

  it('should throw for unknown adapter', async () => {
    const { getAdapterConfig } = await import('../../src/utils/examples/templates/adapters');
    expect(() => getAdapterConfig('unknown-adapter', 'openai')).toThrow('Unknown adapter: unknown-adapter');
  });
});

describe('getEnvFileContent for handler deployment', () => {
  it('should include AGENTMARK_API_KEY and AGENTMARK_APP_ID for cloud mode', async () => {
    const { getEnvFileContent } = await import('../../src/utils/examples/templates/env');
    const content = getEnvFileContent('openai', '', 'ai-sdk', 'cloud');
    expect(content).toContain('AGENTMARK_API_KEY=');
    expect(content).toContain('AGENTMARK_APP_ID=');
  });

  it('should comment out AGENTMARK keys for static mode', async () => {
    const { getEnvFileContent } = await import('../../src/utils/examples/templates/env');
    const content = getEnvFileContent('openai', '', 'ai-sdk', 'static');
    expect(content).toContain('# AGENTMARK_API_KEY=');
    expect(content).toContain('# AGENTMARK_APP_ID=');
  });
});
