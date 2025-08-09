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

// Mock adapter client so that loadTextPrompt returns a prompt with formatWithTestProps
vi.mock('@agentmark/vercel-ai-v4-adapter', async () => {
  return {
    VercelAIModelRegistry: class { registerModels() {} },
    createAgentMarkClient: () => ({
      loadTextPrompt: async () => ({
        formatWithTestProps: async () => ({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'hello' }],
        })
      })
    })
  };
});

// Mock ai streamText to avoid network
vi.mock('ai', () => ({
  streamText: () => ({ textStream: (async function*(){ yield 'ok'; })() })
}));

describe('run-prompt', () => {
  const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    warnSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(() => {
    warnSpy.mockReset();
    errorSpy.mockReset();
  });

  it('logs a warning when --eval is used with props input', async () => {
    const tempPath = path.join(__dirname, '..', 'dummy.mdx');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: gpt-4o\n---');
    // Import after mocks are in place
    if (!runPrompt) {
      runPrompt = (await import('../src/commands/run-prompt')).default;
    }
    await runPrompt(tempPath, { input: 'props', eval: true } as any);
    const warned = warnSpy.mock.calls.some(c => String(c[0]).includes('Warning') && String(c[0]).includes('--eval'));
    expect(warned).toBe(true);
    unlinkSync(tempPath);
  });
});
