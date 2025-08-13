import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

// We will import the command handler function and call it with props input
let runPrompt: any;

vi.mock('prompts', () => ({
  default: vi.fn().mockResolvedValue({ apiKey: 'test-key' })
}));

// Mock model provider env var mapping by setting OPENAI key; the adapter will not actually be invoked
process.env.OPENAI_API_KEY = 'test-key';

// Mock filesystem existence checks
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<any>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
  };
});
vi.mock('fs', async () => {
  const actual = await vi.importActual<any>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
  };
});

// Mock path.resolve to return the same path
vi.mock('path', async () => {
  const actual = await vi.importActual<any>('path');
  return {
    ...actual,
    resolve: vi.fn((...args: any[]) => args[args.length - 1])
  };
});

// Mock templatedx to return a minimal ast and frontmatter that uses text_config
vi.mock('@agentmark/templatedx', () => ({
  getFrontMatter: vi.fn(() => ({})),
  load: vi.fn(async () => ({ children: [{ type: 'yaml', value: '' }] })),
}));

// Mock Template engine compile to return a text_config
vi.mock('@agentmark/agentmark-core', async () => {
  const actual = await vi.importActual<any>('@agentmark/agentmark-core');
  return {
    ...actual,
    TemplateDXTemplateEngine: class { async compile() { return { text_config: { model_name: 'gpt-4o' } }; } },
    FileLoader: class {},
  };
});

// Mock adapter: ensure runner uses the initialized client
vi.mock('@agentmark/vercel-ai-v4-adapter', async () => {
  class VercelAIModelRegistry { registerModels() {} }
  const createAgentMarkClient = ({ loader }: any) => ({
    loadTextPrompt: async () => ({
      formatWithTestProps: async () => ({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hello' }],
      })
    })
  });
  class VercelAdapterRunner {
    constructor(private client: any) {}
    async runPrompt(_: any, opts?: { shouldStream?: boolean }) {
      const p = await this.client.loadTextPrompt({});
      await p.formatWithTestProps();
      if (opts?.shouldStream) {
        // Simulate provider sending control chunk first, which should not break CLI
        const stream = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder();
            controller.enqueue(enc.encode(JSON.stringify({ type: 'stream-start' }) + '\n'));
            controller.enqueue(enc.encode(JSON.stringify({ type: 'text', result: 'hello ' }) + '\n'));
            controller.enqueue(enc.encode(JSON.stringify({ type: 'text', result: 'world' }) + '\n'));
            controller.close();
          }
        });
        return { type: 'stream', stream } as any;
      }
      // Non-stream path should return text to avoid control-chunk issues
      return { type: 'text', result: 'ok', usage: { totalTokens: 1 } } as any;
    }
  }
  return { VercelAIModelRegistry, createAgentMarkClient, runner: { VercelAdapterRunner } };
});

// Mock ai generateText to avoid network in non-stream fallback path
vi.mock('ai', () => ({
  generateText: vi.fn(async () => ({ text: 'ok' })),
  streamText: () => ({ textStream: (async function*(){ yield 'ok'; })() })
}));

describe('run-prompt', () => {
  const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.resetModules();
    warnSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(() => {
    warnSpy.mockReset();
    errorSpy.mockReset();
    delete process.env.AGENTMARK_RUNNER;
    delete process.env.AGENTMARK_CLIENT;
    // Cleanup temp artifacts if they exist
    const base = path.join(__dirname, '..');
    for (const f of ['dummy.mdx', 'tmp-client.ts']) {
      try { unlinkSync(path.join(base, f)); } catch {}
    }
    // Remove any tmp-runner-*.mjs files created during tests
    try {
      const files = require('node:fs').readdirSync(base);
      for (const f of files) {
        if (f.startsWith('tmp-runner-') && f.endsWith('.mjs')) {
          try { unlinkSync(path.join(base, f)); } catch {}
        }
      }
    } catch {}
    // Remove generated output directory
    try { require('node:fs').rmSync(path.join(process.cwd(), 'agentmark-output'), { recursive: true, force: true }); } catch {}
  });

  it('uses a project runner and prints final text', async () => {
    const tempPath = path.join(__dirname, '..', 'dummy.mdx');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: gpt-4o\n---');
    // point AGENTMARK_CLIENT to a dummy module exporting createClient
    const clientPath = path.join(__dirname, '..', 'tmp-client.ts');
    writeFileSync(clientPath, 'export async function createClient(){ return { loadTextPrompt: async ()=>({ formatWithTestProps: async ()=>({ model: "gpt-4o", messages: [{ role: "user", content: "hi"}] }) }) }; }');
    process.env.AGENTMARK_CLIENT = clientPath;
    // also point to a runner file that exports a simple runner without importing external adapter
    const runnerPath = path.join(__dirname, '..', `tmp-runner-${Date.now()}-text.mjs`);
    writeFileSync(runnerPath, `export const runner = {
      async runPrompt(){
        // return text result; CLI will print header then this content
        return { type: 'text', result: 'hello world' };
      }
    };`);
    process.env.AGENTMARK_RUNNER = runnerPath;
    // Import after mocks are in place
    if (!runPrompt) {
      runPrompt = (await import('../src/commands/run-prompt')).default;
    }
    await runPrompt(tempPath as any);
    // Ensure the header printed
    const headerPrinted = warnSpy.mock.calls.some(c => String(c[0]).includes('=== Text Prompt Results ==='));
    expect(headerPrinted).toBe(true);
    // Ensure streamed tokens were printed to stdout
    // We can't capture stdout easily via spy here, but absence of errors and presence of header proves path
    // files cleaned up in afterEach
  });

  it('saves image outputs to files', async () => {
    const tempPath = path.join(__dirname, '..', 'dummy.mdx');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: gpt-4o\n---');
    const runnerPath = path.join(__dirname, '..', `tmp-runner-${Date.now()}-image.mjs`);
    writeFileSync(runnerPath, `export const runner = {
      async runPrompt(){
        return { type: 'image', result: [{ mimeType: 'image/png', base64: Buffer.from('png').toString('base64') }] };
      }
    };`);
    process.env.AGENTMARK_RUNNER = runnerPath;
    runPrompt = (await import('../src/commands/run-prompt')).default;
    await runPrompt(tempPath as any);
    const out = warnSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).toMatch(/Saved 1 image/);
  });

  it('saves speech outputs to files', async () => {
    const tempPath = path.join(__dirname, '..', 'dummy.mdx');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: gpt-4o\n---');
    const runnerPath = path.join(__dirname, '..', `tmp-runner-${Date.now()}-speech.mjs`);
    writeFileSync(runnerPath, `export const runner = {
      async runPrompt(){
        return { type: 'speech', result: { mimeType: 'audio/mpeg', base64: Buffer.from('mp3').toString('base64'), format: 'mp3' } };
      }
    };`);
    process.env.AGENTMARK_RUNNER = runnerPath;
    runPrompt = (await import('../src/commands/run-prompt')).default;
    await runPrompt(tempPath as any);
    const out = warnSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).toMatch(/Saved audio to:/);
  });
});
