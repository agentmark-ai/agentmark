import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'path';

// Test constants
const TEST_API_KEY = 'test-key';
const MOCK_MODEL_NAME = 'gpt-4o';
const MOCK_TEXT_RESULT = 'hello world';

// Test state
let runPrompt: any;
let currentRunner: any = null;
const originalEnv = { ...process.env };

// Mock global fetch to simulate server responses
// We respond to prompt-run with text/image/speech depending on currentRunner behavior
global.fetch = (async (url: any, init?: any) => {
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
  if (body?.type === 'prompt-run') {
    const options = { ...body.data.options, customProps: body.data.customProps };
    const resp = await currentRunner.runPrompt(body.data.ast, options);
    if (resp?.type === 'stream') {
      return new Response(resp.stream as any, { headers: { 'AgentMark-Streaming': 'true' } } as any) as any;
    }
    return new Response(JSON.stringify(resp), { status: 200, headers: { 'Content-Type': 'application/json' } } as any) as any;
  }
  return new Response('Not found', { status: 500 } as any) as any;
}) as any;

vi.mock('prompts', () => ({
  default: vi.fn().mockResolvedValue({ apiKey: TEST_API_KEY })
}));

// Mock model provider env var mapping by setting OPENAI key; the adapter will not actually be invoked
process.env.OPENAI_API_KEY = TEST_API_KEY;

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
vi.mock('@agentmark/prompt-core', async () => {
  const actual = await vi.importActual<any>('@agentmark/prompt-core');
  return {
    ...actual,
    TemplateDXTemplateEngine: class {
      async compile() {
        return { text_config: { model_name: MOCK_MODEL_NAME } };
      }
    },
    FileLoader: class {},
  };
});

// Adapter mocks not needed with HTTP-only runner stub

// Mock ai generateText to avoid network in non-stream fallback path
vi.mock('ai', () => ({
  generateText: vi.fn(async () => ({ text: 'ok' })),
  streamText: () => ({ textStream: (async function*(){ yield 'ok'; })() })
}));

describe('run-prompt', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.resetModules();
    logSpy.mockClear();
    errorSpy.mockClear();
    currentRunner = null;
  });

  afterEach(() => {
    logSpy.mockReset();
    errorSpy.mockReset();
    // Restore environment variables
    process.env = { ...originalEnv };
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
    // Remove generated output directories from both cwd and base test directory
    try { require('node:fs').rmSync(path.join(process.cwd(), '.agentmark-outputs'), { recursive: true, force: true }); } catch {}
    try { require('node:fs').rmSync(path.join(base, '.agentmark-outputs'), { recursive: true, force: true }); } catch {}
  });

  it('uses a project runner and prints final text', async () => {
    const tempPath = path.join(__dirname, '..', 'dummy.mdx');
    writeFileSync(tempPath, `---\ntext_config:\n  model_name: ${MOCK_MODEL_NAME}\n---`);
    currentRunner = { async runPrompt(){ return { type: 'text', result: MOCK_TEXT_RESULT }; } } as any;
    // Import after mocks are in place
    if (!runPrompt) {
      runPrompt = (await import('../cli-src/commands/run-prompt')).default;
    }
    await runPrompt(tempPath as any, { server: 'http://localhost:9417' });
    // Ensure the header printed
    const headerPrinted = logSpy.mock.calls.some(c => String(c[0]).includes('=== Text Prompt Results ==='));
    expect(headerPrinted).toBe(true);
    // Ensure streamed tokens were printed to stdout
    // We can't capture stdout easily via spy here, but absence of errors and presence of header proves path
    // files cleaned up in afterEach
  });

  it('saves image outputs to files', async () => {
    const tempPath = path.join(__dirname, '..', 'dummy.mdx');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: gpt-4o\n---');
    currentRunner = { async runPrompt(){ return { type: 'image', result: [{ mimeType: 'image/png', base64: Buffer.from('png').toString('base64') }] }; } } as any;
    runPrompt = (await import('../cli-src/commands/run-prompt')).default;
    await runPrompt(tempPath as any, { server: 'http://localhost:9417' });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).toMatch(/Saved 1 image/);
  });

  it('saves speech outputs to files', async () => {
    const tempPath = path.join(__dirname, '..', 'dummy.mdx');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: gpt-4o\n---');
    currentRunner = { async runPrompt(){ return { type: 'speech', result: { mimeType: 'audio/mpeg', base64: Buffer.from('mp3').toString('base64'), format: 'mp3' } }; } } as any;
    runPrompt = (await import('../cli-src/commands/run-prompt')).default;
    await runPrompt(tempPath as any, { server: 'http://localhost:9417' });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).toMatch(/Saved audio to:/);
  });

  it('accepts custom props via --props JSON string', async () => {
    const tempPath = path.join(__dirname, '..', 'dummy.mdx');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: gpt-4o\n---');
    let receivedCustomProps: any = null;
    currentRunner = {
      async runPrompt(ast: any, options: any) {
        receivedCustomProps = options?.customProps;
        return { type: 'text', result: 'custom props test' };
      }
    } as any;
    runPrompt = (await import('../cli-src/commands/run-prompt')).default;
    await runPrompt(tempPath, { props: '{"name": "test", "value": 123}', server: 'http://localhost:9417' });
    expect(receivedCustomProps).toEqual({ name: 'test', value: 123 });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).toMatch(/Running prompt with custom props/);
  });

  it('accepts custom props via --props-file JSON', async () => {
    const tempPath = path.join(__dirname, '..', 'dummy.mdx');
    const propsPath = path.join(__dirname, '..', 'test-props.json');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: gpt-4o\n---');
    writeFileSync(propsPath, JSON.stringify({ foo: 'bar', num: 42 }));
    let receivedCustomProps: any = null;
    currentRunner = {
      async runPrompt(ast: any, options: any) {
        receivedCustomProps = options?.customProps;
        return { type: 'text', result: 'props file test' };
      }
    } as any;
    runPrompt = (await import('../cli-src/commands/run-prompt')).default;
    await runPrompt(tempPath, { propsFile: propsPath, server: 'http://localhost:9417' });
    expect(receivedCustomProps).toEqual({ foo: 'bar', num: 42 });
    try { unlinkSync(propsPath); } catch {}
  });

  it('accepts custom props via --props-file YAML', async () => {
    const tempPath = path.join(__dirname, '..', 'dummy.mdx');
    const propsPath = path.join(__dirname, '..', 'test-props.yaml');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: gpt-4o\n---');
    writeFileSync(propsPath, 'key: value\ncount: 10\n');
    let receivedCustomProps: any = null;
    currentRunner = {
      async runPrompt(ast: any, options: any) {
        receivedCustomProps = options?.customProps;
        return { type: 'text', result: 'yaml props test' };
      }
    } as any;
    runPrompt = (await import('../cli-src/commands/run-prompt')).default;
    await runPrompt(tempPath, { propsFile: propsPath, server: 'http://localhost:9417' });
    expect(receivedCustomProps).toEqual({ key: 'value', count: 10 });
    try { unlinkSync(propsPath); } catch {}
  });

  it('throws error for invalid --props JSON', async () => {
    const tempPath = path.join(__dirname, '..', 'dummy.mdx');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: gpt-4o\n---');
    currentRunner = { async runPrompt(){ return { type: 'text', result: 'ok' }; } } as any;
    runPrompt = (await import('../cli-src/commands/run-prompt')).default;
    await expect(runPrompt(tempPath, { props: '{invalid json}', server: 'http://localhost:9417' })).rejects.toThrow('Invalid JSON');
  });

  it('throws error for unsupported file extension', async () => {
    const tempPath = path.join(__dirname, '..', 'dummy.txt');
    writeFileSync(tempPath, 'not a valid file');
    currentRunner = { async runPrompt(){ return { type: 'text', result: 'ok' }; } } as any;
    runPrompt = (await import('../cli-src/commands/run-prompt')).default;
    await expect(runPrompt(tempPath, { server: 'http://localhost:9417' })).rejects.toThrow('File must be an .mdx or .json file');
    try { unlinkSync(tempPath); } catch {}
  });

  it('loads pre-built JSON prompt file', async () => {
    const tempPath = path.join(__dirname, '..', 'dummy.prompt.json');
    const builtPrompt = {
      ast: { children: [{ type: 'yaml', value: 'text_config:\n  model_name: gpt-4o' }] },
      metadata: { name: 'test-prompt', kind: 'text', path: 'dummy.prompt.mdx', builtAt: new Date().toISOString() }
    };
    writeFileSync(tempPath, JSON.stringify(builtPrompt));
    currentRunner = { async runPrompt(){ return { type: 'text', result: 'from json' }; } } as any;
    runPrompt = (await import('../cli-src/commands/run-prompt')).default;
    await runPrompt(tempPath, { server: 'http://localhost:9417' });
    const headerPrinted = logSpy.mock.calls.some(c => String(c[0]).includes('=== Text Prompt Results ==='));
    expect(headerPrinted).toBe(true);
    try { unlinkSync(tempPath); } catch {}
  });

  it('throws error for invalid JSON prompt file (missing ast)', async () => {
    const tempPath = path.join(__dirname, '..', 'invalid.prompt.json');
    writeFileSync(tempPath, JSON.stringify({ metadata: { name: 'test' } }));
    currentRunner = { async runPrompt(){ return { type: 'text', result: 'ok' }; } } as any;
    runPrompt = (await import('../cli-src/commands/run-prompt')).default;
    await expect(runPrompt(tempPath, { server: 'http://localhost:9417' })).rejects.toThrow('missing "ast" field');
    try { unlinkSync(tempPath); } catch {}
  });
});
