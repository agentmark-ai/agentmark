import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

let runExperiment: any;

vi.mock('prompts', () => ({
  default: vi.fn().mockResolvedValue({ apiKey: 'test-key' })
}));
process.env.OPENAI_API_KEY = 'test-key';

vi.mock('@agentmark/templatedx', () => ({
  getFrontMatter: vi.fn(() => ({})),
  load: vi.fn(async () => ({ children: [{ type: 'yaml', value: '' }] })),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(async ({}) => ({ text: 'EXPECTED' })),
}));

vi.mock('path', async () => {
  const actual = await vi.importActual<any>('path');
  return { ...actual, resolve: vi.fn((...args:any[]) => args[args.length-1]), dirname: vi.fn(() => __dirname) };
});
vi.mock('fs', async () => {
  const actual = await vi.importActual<any>('fs');
  return { ...actual, existsSync: vi.fn().mockImplementation((p: string) => typeof p === 'string' && p.endsWith('.mdx')) };
});

// Base core mock
vi.mock('@agentmark/agentmark-core', async () => {
  const actual = await vi.importActual<any>('@agentmark/agentmark-core');
  return {
    ...actual,
    TemplateDXTemplateEngine: class { async compile() { return { text_config: { model_name: 'gpt-4o' }, test_settings: { evals: ['exact_match'] } }; } },
    FileLoader: class {},
  };
});

// Client returns a trivial dataset
function makeDatasetStream(items: any[]) {
  return new ReadableStream({
    start(controller) { items.forEach(i => controller.enqueue(i)); controller.close(); }
  });
}
vi.doMock('@agentmark/vercel-ai-v4-adapter', () => ({
  VercelAIModelRegistry: class { registerModels() {} },
  createAgentMarkClient: () => ({
    loadTextPrompt: async () => ({
      formatWithDataset: async () => makeDatasetStream([{ dataset: { input: {}, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} }])
    })
  })
}));

describe('invalid threshold handling', () => {
  let dummyPath: string;
  beforeEach(async () => {
    dummyPath = path.join(__dirname, '..', 'tmp-exp-thresh.mdx');
    fs.writeFileSync(dummyPath, '---\ntext_config:\n  model_name: gpt-4o\n---');
    runExperiment = (await import('../src/commands/run-prompt')).runExperiment;
  });
  afterEach(() => {
    try { fs.unlinkSync(dummyPath); } catch {}
  });

  it('throws for threshold > 100', async () => {
    await expect(runExperiment(dummyPath, { thresholdPercent: 101 })).rejects.toThrow(/Invalid threshold/);
  });

  it('throws for threshold < 0', async () => {
    await expect(runExperiment(dummyPath, { thresholdPercent: -1 })).rejects.toThrow(/Invalid threshold/);
  });

  it('accepts 0 and 100', async () => {
    await expect(runExperiment(dummyPath, { thresholdPercent: 0 })).resolves.toBeUndefined();
    await expect(runExperiment(dummyPath, { thresholdPercent: 100 })).resolves.toBeUndefined();
  });
});
