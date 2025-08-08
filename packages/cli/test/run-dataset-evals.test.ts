import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let runPrompt: any;

vi.mock('prompts', () => ({
  default: vi.fn().mockResolvedValue({ apiKey: 'test-key' })
}));

process.env.OPENAI_API_KEY = 'test-key';

// Simplify fs path resolution only (we'll create a temp file)
vi.mock('path', async () => {
  const actual = await vi.importActual<any>('path');
  return {
    ...actual,
    resolve: vi.fn((...args: any[]) => args[args.length - 1])
  };
});

// Mock templatedx
vi.mock('@agentmark/templatedx', () => ({
  getFrontMatter: vi.fn(() => ({})),
  load: vi.fn(async () => ({ children: [{ type: 'yaml', value: '' }] })),
}));

// By default, mock core template engine; individual tests will override via vi.doMock
vi.mock('@agentmark/agentmark-core', async () => {
  const actual = await vi.importActual<any>('@agentmark/agentmark-core');
  return {
    ...actual,
    TemplateDXTemplateEngine: class { async compile() { return { text_config: { model_name: 'gpt-4o' } }; } },
    FileLoader: class {},
  };
});

// Helper to build a ReadableStream for dataset entries
function makeDatasetStream(items: any[]) {
  return new ReadableStream({
    start(controller) {
      (async () => {
        for (const item of items) {
          controller.enqueue(item);
        }
        controller.close();
      })();
    }
  });
}

// Mock adapter client
function mockClientWithDataset(items: any[]) {
  vi.doMock('@agentmark/vercel-ai-v4-adapter', () => ({
    VercelAIModelRegistry: class { registerModels() {} },
    createAgentMarkClient: () => ({
      loadTextPrompt: async () => ({
        formatWithDataset: async () => makeDatasetStream(items)
      })
    })
  }));
}

// Mock ai.generateText
vi.mock('ai', () => ({
  generateText: vi.fn(async () => ({ text: 'EXPECTED' })),
  streamText: vi.fn(),
  generateObject: vi.fn(),
  experimental_generateImage: vi.fn(),
  experimental_generateSpeech: vi.fn(),
}));

describe('run-dataset with evals', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.resetModules();
    // Ensure compile returns evals so columns are present from the start
    vi.doMock('@agentmark/agentmark-core', async () => {
      const actual = await vi.importActual<any>('@agentmark/agentmark-core');
      return {
        ...actual,
        TemplateDXTemplateEngine: class { async compile() { return { text_config: { model_name: 'gpt-4o' }, test_settings: { evals: ['exact_match','length_check'] } }; } },
        FileLoader: class {},
      };
    });
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(() => {
    logSpy.mockReset();
    errorSpy.mockReset();
  });

  it('executes provided evals and prints their results', async () => {
    // Create a temporary mdx file path
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const { join } = await import('node:path');
    const tempPath = join(__dirname, '..', 'dummy-dataset.mdx');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: gpt-4o\n---');

    vi.resetModules();
    mockClientWithDataset([
      {
        dataset: { input: { a: 1 }, expected_output: 'EXPECTED' },
        evals: ['exact_match', 'length_check'],
        formatted: { any: 'config' },
      },
    ]);

    runPrompt = (await import('../src/commands/run-prompt')).default;

    await runPrompt(tempPath, { input: 'dataset', eval: true } as any);

    // Header should include eval names
    const logged = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    // Header should contain eval names without truncation
    expect(logged).toContain('exact_match');
    expect(logged).toContain('length_check');
    // Row should include scores and labels (allow table spacing)
    expect(logged).toContain('1.00');
    expect(/\(correc/.test(logged)).toBe(true);
    expect(/\(reasonab|\(unreasonab/.test(logged)).toBe(true);
    unlinkSync(tempPath);
  });

  it('logs error and shows not_found when eval is not registered', async () => {
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const { join } = await import('node:path');
    const tempPath = join(__dirname, '..', 'dummy-dataset2.mdx');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: gpt-4o\n---');

    vi.resetModules();
    vi.doMock('@agentmark/agentmark-core', async () => {
      const actual = await vi.importActual<any>('@agentmark/agentmark-core');
      return {
        ...actual,
        TemplateDXTemplateEngine: class { async compile() { return { text_config: { model_name: 'gpt-4o' }, test_settings: { evals: ['missing_eval'] } }; } },
        FileLoader: class {},
      };
    });
    mockClientWithDataset([
      {
        dataset: { input: { a: 1 }, expected_output: 'EXPECTED' },
        evals: ['missing_eval'],
        formatted: { any: 'config' },
      },
    ]);

    runPrompt = (await import('../src/commands/run-prompt')).default;

    await runPrompt(tempPath, { input: 'dataset', eval: true } as any);

    const logs = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    // Should render not_found label somewhere in the table output
    expect(logs).toContain('(not_found)');
    unlinkSync(tempPath);
  });
});
