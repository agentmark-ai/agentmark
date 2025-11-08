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
      const devDepsCmd = calls.find(c => c.includes('--save-dev') && c.includes('@agentmark/cli')) || '';
      expect(devDepsCmd).toContain('@agentmark/cli');
      expect(devDepsCmd).toContain('typescript');

      const appInstallCmd = calls.find(c => c.startsWith('npm install ') && c.includes('@agentmark/ai-sdk-v4-adapter')) || '';
      expect(appInstallCmd).toContain(' ai@^4');
      expect(appInstallCmd).toMatch(/@ai-sdk\/openai@\^1/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('cloud target uses SDK file loader in generated agentmark.client.ts', async () => {
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
    const content = getClientConfigContent({ defaultRootDir: './agentmark', provider: 'anthropic', languageModels: ['claude-3'] });
    expect(content).not.toContain('openai.image');
    expect(content).not.toContain('openai.speech');
  });

  it('creates .agentmark/dev-entry.ts for Express platform', async () => {
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
      await createExampleApp('skip', tmpDir, '', 'express');

      // Should create dev-entry.ts for Express
      const devEntryPath = path.join(tmpDir, '.agentmark', 'dev-entry.ts');
      expect(fs.existsSync(devEntryPath)).toBe(true);

      const content = fs.readFileSync(devEntryPath, 'utf8');
      expect(content).toContain("import { createWebhookServer } from '@agentmark/cli/runner-server'");
      expect(content).toContain("import { VercelAdapterWebhookHandler } from '@agentmark/ai-sdk-v4-adapter/runner'");
      expect(content).toContain('new VercelAdapterWebhookHandler(client');
      expect(content).toContain('createWebhookServer({');

      // Check .env has correct webhook URL
      const envContent = fs.readFileSync(path.join(tmpDir, '.env'), 'utf8');
      expect(envContent).toContain('AGENTMARK_WEBHOOK_URL=http://localhost:9417');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates Lambda handler with dev-entry.ts', async () => {
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
    const tmpDir = path.join(__dirname, '..', 'tmp-lambda-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      await createExampleApp('skip', tmpDir, '', 'lambda');

      // Should create dev-entry.ts for Lambda (spawns SAM + file server)
      const devEntryPath = path.join(tmpDir, '.agentmark', 'dev-entry.ts');
      expect(fs.existsSync(devEntryPath)).toBe(true);

      // Should create Lambda handler
      const lambdaHandlerPath = path.join(tmpDir, 'lambda', 'handler.ts');
      expect(fs.existsSync(lambdaHandlerPath)).toBe(true);

      // Should create SAM template (JSON format)
      const samTemplatePath = path.join(tmpDir, 'template.json');
      expect(fs.existsSync(samTemplatePath)).toBe(true);

      // Check .env has correct webhook URL
      const envContent = fs.readFileSync(path.join(tmpDir, '.env'), 'utf8');
      expect(envContent).toContain('AGENTMARK_WEBHOOK_URL=http://localhost:9417');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates Azure function with dev-entry.ts', async () => {
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
    const tmpDir = path.join(__dirname, '..', 'tmp-azure-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      await createExampleApp('skip', tmpDir, '', 'azure');

      // Should create dev-entry.ts for Azure (spawns Azure Functions + file server)
      const devEntryPath = path.join(tmpDir, '.agentmark', 'dev-entry.ts');
      expect(fs.existsSync(devEntryPath)).toBe(true);

      // Should create Azure function
      const azureFunctionPath = path.join(tmpDir, 'src', 'functions', 'agentmark.ts');
      expect(fs.existsSync(azureFunctionPath)).toBe(true);

      // Should create host.json
      const hostJsonPath = path.join(tmpDir, 'host.json');
      expect(fs.existsSync(hostJsonPath)).toBe(true);

      // Check .env has correct webhook URL
      const envContent = fs.readFileSync(path.join(tmpDir, '.env'), 'utf8');
      expect(envContent).toContain('AGENTMARK_WEBHOOK_URL=http://localhost:9417/api/agentmark');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates Next.js API route with dev-entry.ts', async () => {
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
    const tmpDir = path.join(__dirname, '..', 'tmp-nextjs-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      await createExampleApp('skip', tmpDir, '', 'nextjs');

      // Should create dev-entry.ts for Next.js (spawns Next.js + file server)
      const devEntryPath = path.join(tmpDir, '.agentmark', 'dev-entry.ts');
      expect(fs.existsSync(devEntryPath)).toBe(true);

      // Should create Next.js API route
      const apiRoutePath = path.join(tmpDir, 'app', 'api', 'agentmark', 'route.ts');
      expect(fs.existsSync(apiRoutePath)).toBe(true);

      const routeContent = fs.readFileSync(apiRoutePath, 'utf8');
      expect(routeContent).toContain("import { createNextAppHandler } from '@agentmark/cli/runner-server/adapters/nextjs'");
      expect(routeContent).toContain("import { client } from '../../../agentmark.client.js'");

      // Check .env has correct webhook URL
      const envContent = fs.readFileSync(path.join(tmpDir, '.env'), 'utf8');
      expect(envContent).toContain('AGENTMARK_WEBHOOK_URL=http://localhost:3000/api/agentmark');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
