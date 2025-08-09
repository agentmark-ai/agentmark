import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let runExperiment: any;

vi.mock('prompts', () => ({
  default: vi.fn().mockResolvedValue({ apiKey: 'test-key' })
}));

process.env.OPENAI_API_KEY = 'test-key';

// Mock templatedx
vi.mock('@agentmark/templatedx', () => ({
  getFrontMatter: vi.fn(() => ({})),
  load: vi.fn(async () => ({ children: [{ type: 'yaml', value: '' }] })),
}));

// Dataset stream helper
function makeDatasetStream(items: any[]) {
  return new ReadableStream({
    start(controller) {
      (async () => {
        for (const item of items) controller.enqueue(item);
        controller.close();
      })();
    }
  });
}

// Mock client for run-experiment
function mockClientWithDataset(items: any[]) {
  vi.doMock('@agentmark/vercel-ai-v4-adapter', () => ({
    VercelAIModelRegistry: class { registerModels() {} },
    createAgentMarkClient: () => ({
      loadTextPrompt: async () => ({ formatWithDataset: async () => makeDatasetStream(items) })
    })
  }));
}

// Mock AI to return predictable text
vi.mock('ai', () => ({
  generateText: vi.fn(async ({}) => ({ text: 'EXPECTED' })),
  streamText: vi.fn(),
  generateObject: vi.fn(),
  experimental_generateImage: vi.fn(),
  experimental_generateSpeech: vi.fn(),
}));

// Minimal fs/path mocks
vi.mock('path', async () => {
  const actual = await vi.importActual<any>('path');
  return { ...actual, resolve: vi.fn((...args:any[]) => args[args.length-1]), dirname: vi.fn(() => __dirname) };
});
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<any>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockImplementation((p: string) => typeof p === 'string' && p.endsWith('.mdx')),
  };
});
vi.mock('fs', async () => {
  const actual = await vi.importActual<any>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockImplementation((p: string) => typeof p === 'string' && p.endsWith('.mdx')),
  };
});

// Base core mock; per test we override compile outputs
vi.mock('@agentmark/agentmark-core', async () => {
  const actual = await vi.importActual<any>('@agentmark/agentmark-core');
  return {
    ...actual,
    TemplateDXTemplateEngine: class { async compile() { return { text_config: { model_name: 'gpt-4o' } }; } },
    FileLoader: class {},
  };
});

describe('run-experiment', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  let dummyPath: string;

  beforeEach(async () => {
    vi.resetModules();
    logSpy.mockClear();
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    dummyPath = join(__dirname, '..', 'tmp-experiment.mdx');
    writeFileSync(dummyPath, '---\ntext_config:\n  model_name: gpt-4o\n---');
  });

  afterEach(() => {
    logSpy.mockReset();
  });

  it('runs evals by default and respects threshold', async () => {
    // Include exact_match so all pass
    vi.doMock('@agentmark/agentmark-core', async () => {
      const actual = await vi.importActual<any>('@agentmark/agentmark-core');
      return {
        ...actual,
        TemplateDXTemplateEngine: class { async compile() { return { text_config: { model_name: 'gpt-4o' }, test_settings: { evals: ['exact_match'] } }; } },
        FileLoader: class {},
      };
    });
    mockClientWithDataset([{ dataset: { input: {}, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} }]);
    runExperiment = (await import('../src/commands/run-prompt')).runExperiment;

    await runExperiment(dummyPath, { thresholdPercent: 100 });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).toMatch(/Experiment passed threshold/);
  });

  it('fails when threshold not met', async () => {
    // Include contains that will fail
    vi.doMock('@agentmark/agentmark-core', async () => {
      const actual = await vi.importActual<any>('@agentmark/agentmark-core');
      return {
        ...actual,
        TemplateDXTemplateEngine: class { async compile() { return { text_config: { model_name: 'gpt-4o' }, test_settings: { evals: ['contains'] } }; } },
        FileLoader: class {},
      };
    });
    mockClientWithDataset([{ dataset: { input: {}, expected_output: 'NOT_IN_OUTPUT' }, evals: ['contains'], formatted: {} }]);
    runExperiment = (await import('../src/commands/run-prompt')).runExperiment;

    await expect(runExperiment(dummyPath, { thresholdPercent: 100 })).rejects.toThrow(/Experiment failed/);
  });

  it('skips evals when --skip-eval used', async () => {
    vi.doMock('@agentmark/agentmark-core', async () => {
      const actual = await vi.importActual<any>('@agentmark/agentmark-core');
      return {
        ...actual,
        TemplateDXTemplateEngine: class { async compile() { return { text_config: { model_name: 'gpt-4o' }, test_settings: { evals: ['contains'] } }; } },
        FileLoader: class {},
      };
    });
    mockClientWithDataset([{ dataset: { input: {}, expected_output: 'NOT_IN_OUTPUT' }, evals: ['contains'], formatted: {} }]);
    runExperiment = (await import('../src/commands/run-prompt')).runExperiment;

    await runExperiment(dummyPath, { skipEval: true, thresholdPercent: 100 });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    // no throw; also no pass log since evals skipped
    expect(out).not.toMatch(/Experiment failed/);
  });

  it('prints eval results correctly via run-prompt dataset mode (legacy run-dataset)', async () => {
    // Merge of former run-dataset tests here for consolidation
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const { join } = await import('node:path');
    const tempPath = join(__dirname, '..', 'dummy-dataset.mdx');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: gpt-4o\n---');

    vi.resetModules();
    vi.doMock('@agentmark/agentmark-core', async () => {
      const actual = await vi.importActual<any>('@agentmark/agentmark-core');
      return {
        ...actual,
        TemplateDXTemplateEngine: class { async compile() { return { text_config: { model_name: 'gpt-4o' }, test_settings: { evals: ['exact_match','length_check'] } }; } },
        FileLoader: class {},
      };
    });
    // Adapter returns a single dataset row
    vi.doMock('@agentmark/vercel-ai-v4-adapter', () => ({
      VercelAIModelRegistry: class { registerModels() {} },
      createAgentMarkClient: () => ({
        loadTextPrompt: async () => ({
          formatWithDataset: async () => makeDatasetStream([
            { dataset: { input: { a: 1 }, expected_output: 'EXPECTED' }, evals: ['exact_match','length_check'], formatted: {} }
          ])
        })
      })
    }));

    const runPrompt = (await import('../src/commands/run-prompt')).default;
    await runPrompt(tempPath, { input: 'dataset', eval: true } as any);

    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).toContain('exact_match');
    expect(out).toContain('length_check');
    expect(out).toMatch(/1\.00/);
    unlinkSync(tempPath);
  });

  it('errors when dataset is not present', async () => {
    // Core returns config with no dataset; client throws on formatWithDataset
    vi.doMock('@agentmark/agentmark-core', async () => {
      const actual = await vi.importActual<any>('@agentmark/agentmark-core');
      return {
        ...actual,
        TemplateDXTemplateEngine: class { async compile() { return { text_config: { model_name: 'gpt-4o' }, test_settings: { evals: ['exact_match'] } }; } },
        FileLoader: class {},
      };
    });
    vi.doMock('@agentmark/vercel-ai-v4-adapter', () => ({
      VercelAIModelRegistry: class { registerModels() {} },
      createAgentMarkClient: () => ({
        loadTextPrompt: async () => ({
          formatWithDataset: async () => { throw new Error('Loader or dataset is not defined for this prompt. Please provide valid loader and dataset.'); }
        })
      })
    }));
    runExperiment = (await import('../src/commands/run-prompt')).runExperiment;
    await expect(runExperiment(dummyPath, {})).rejects.toThrow(/Loader or dataset is not defined/);
  });

  describe('invalid threshold handling', () => {
    it('throws for threshold > 100 and < 0', async () => {
      // Set simple passing dataset and exact_match evals
      vi.doMock('@agentmark/agentmark-core', async () => {
        const actual = await vi.importActual<any>('@agentmark/agentmark-core');
        return {
          ...actual,
          TemplateDXTemplateEngine: class { async compile() { return { text_config: { model_name: 'gpt-4o' }, test_settings: { evals: ['exact_match'] } }; } },
          FileLoader: class {},
        };
      });
      mockClientWithDataset([{ dataset: { input: {}, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} }]);
      runExperiment = (await import('../src/commands/run-prompt')).runExperiment;
      await expect(runExperiment(dummyPath, { thresholdPercent: 101 })).rejects.toThrow(/Invalid threshold/);
      await expect(runExperiment(dummyPath, { thresholdPercent: -1 })).rejects.toThrow(/Invalid threshold/);
    });

    it('accepts thresholds 0 and 100', async () => {
      vi.doMock('@agentmark/agentmark-core', async () => {
        const actual = await vi.importActual<any>('@agentmark/agentmark-core');
        return {
          ...actual,
          TemplateDXTemplateEngine: class { async compile() { return { text_config: { model_name: 'gpt-4o' }, test_settings: { evals: ['exact_match'] } }; } },
          FileLoader: class {},
        };
      });
      mockClientWithDataset([{ dataset: { input: {}, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} }]);
      runExperiment = (await import('../src/commands/run-prompt')).runExperiment;
      await expect(runExperiment(dummyPath, { thresholdPercent: 0 })).resolves.toBeUndefined();
      await expect(runExperiment(dummyPath, { thresholdPercent: 100 })).resolves.toBeUndefined();
    });
  });
  afterEach(async () => { const { unlinkSync } = await import('node:fs'); try { unlinkSync(dummyPath); } catch {} });
});
