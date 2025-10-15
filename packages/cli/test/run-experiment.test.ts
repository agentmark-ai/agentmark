import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

let runExperiment: any;
let currentRunner: any = null;

// Mock global fetch to simulate server dataset streaming
global.fetch = (async (url: any, init?: any) => {
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
  if (body?.type === 'dataset-run') {
    const resp = await currentRunner.runExperiment(body.data.ast, body.data.experimentId);
    // Expect resp.stream
    return new Response(resp.stream as any, { status: 200 } as any) as any;
  }
  if (body?.type === 'prompt-run') {
    const resp = await (currentRunner.runPrompt?.(body.data.ast, body.data.options) ?? { type: 'text', result: 'ok' });
    return new Response(JSON.stringify(resp), { status: 200, headers: { 'Content-Type': 'application/json' } } as any) as any;
  }
  return new Response('Not found', { status: 500 } as any) as any;
}) as any;

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

// Mock client for run-experiment via runner using initialized client
function mockClientWithDataset(items: any[]) {
  currentRunner = {
    async runExperiment() {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          for (const it of items) {
            const expected = it.dataset?.expected_output ?? '';
            const actual = 'EXPECTED';
            const evals = (it.evals ?? []).map((name: string) => ({
              name,
              score: String(expected) === String(actual) ? 1 : 0,
              label: String(expected) === String(actual) ? 'correct' : 'incorrect',
              verdict: String(expected) === String(actual) ? 'pass' : 'fail'
            }));
            const chunk = JSON.stringify({ type: 'dataset', result: { input: it.dataset?.input ?? {}, expectedOutput: expected, actualOutput: actual, evals } }) + '\n';
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        }
      });
      return { stream };
    },
    async runPrompt() { return { type: 'text', result: 'ok' }; }
  };
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
    existsSync: vi.fn().mockImplementation((p: string) => actual.existsSync(p) || (typeof p === 'string' && (p.endsWith('.mdx') || p.includes('tmp-runner-ds.mjs') || p.includes('tmp-runner-error.mjs')))),
  };
});
vi.mock('fs', async () => {
  const actual = await vi.importActual<any>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockImplementation((p: string) => actual.existsSync(p) || (typeof p === 'string' && (p.endsWith('.mdx') || p.includes('tmp-runner-ds.mjs') || p.includes('tmp-runner-error.mjs')))),
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
    currentRunner = null;
    process.env.AGENTMARK_SERVER = 'http://localhost:9417';
  });

  afterEach(() => {
    logSpy.mockReset();
    // Cleanup temp files created in tests
    try { const { unlinkSync } = require('node:fs'); const { join } = require('node:path'); unlinkSync(join(__dirname, '..', 'tmp-experiment.mdx')); } catch {}
    try { const { unlinkSync } = require('node:fs'); const { join } = require('node:path'); unlinkSync(join(__dirname, '..', 'dummy-dataset.mdx')); } catch {}
  });

  it('passes threshold when all evals PASS', async () => {
    mockClientWithDataset([{ dataset: { input: {}, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} }]);
    runExperiment = (await import('../src/commands/run-experiment')).default;
    await runExperiment(dummyPath, { thresholdPercent: 100 });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).toMatch(/Experiment passed threshold/);
  });

  it('fails threshold when evals FAIL', async () => {
    mockClientWithDataset([{ dataset: { input: {}, expected_output: 'NOT_IN_OUTPUT' }, evals: ['contains'], formatted: {} }]);
    runExperiment = (await import('../src/commands/run-experiment')).default;
    await expect(runExperiment(dummyPath, { thresholdPercent: 100 })).rejects.toThrow(/Experiment failed/);
  });

  it('honors --skip-eval and does not enforce threshold', async () => {
    mockClientWithDataset([{ dataset: { input: {}, expected_output: 'NOT_IN_OUTPUT' }, evals: ['contains'], formatted: {} }]);
    runExperiment = (await import('../src/commands/run-experiment')).default;
    await runExperiment(dummyPath, { skipEval: true, thresholdPercent: 100 });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).not.toMatch(/Experiment failed/);
  });

  it('renders eval results with PASS and reasons', async () => {
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const { join } = await import('node:path');
    const tempPath = join(__dirname, '..', 'dummy-dataset.mdx');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: gpt-4o\n---');

    // Provide runner that streams a dataset row with two evals scoring 1.0
    // Include reasons in evals emitted by runner
    currentRunner = {
      async runExperiment(){
        const stream = new ReadableStream({
          async start(controller){
            const enc = new TextEncoder();
            const evals = [
              { name: 'exact_match', score: 1, label: 'correct', reason: 'Exact match', verdict: 'pass' },
              { name: 'length_check', score: 1, label: 'pass', reason: 'Length ok', verdict: 'pass' }
            ];
            const chunk = JSON.stringify({ type: 'dataset', result: { input: { a:1 }, expectedOutput: 'EXPECTED', actualOutput: 'EXPECTED', evals } })+'\n';
            controller.enqueue(enc.encode(chunk));
            controller.close();
          }
        });
        return { stream };
      }
    } as any;

    const runExperimentCmd = (await import('../src/commands/run-experiment')).default;
    await runExperimentCmd(tempPath, { skipEval: false });

    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    // Check PASS labels and reasons rendered (table may wrap across lines)
    expect(out).toMatch(/PASS\s*\(1\.00/);
    expect(out).toMatch(/Exact match\)/);
    expect(out).toMatch(/PASS\s*\(1\.00/);
    // length ok text may be split; assert pieces exist
    expect(out).toMatch(/Length/);
    expect(out).toMatch(/ok\)/);
    unlinkSync(tempPath);
  });

  it('errors when dataset is not present', async () => {
    // Provide runner that throws a dataset error
    currentRunner = { async runExperiment(){ throw new Error('Loader or dataset is not defined for this prompt. Please provide valid loader and dataset.'); } } as any;
    runExperiment = (await import('../src/commands/run-experiment')).default;
    await expect(runExperiment(dummyPath, {})).rejects.toThrow(/Loader or dataset is not defined/);
  });

  it('validates threshold values (0-100 inclusive)', async () => {
    mockClientWithDataset([{ dataset: { input: {}, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} }]);
    runExperiment = (await import('../src/commands/run-experiment')).default;
    await expect(runExperiment(dummyPath, { thresholdPercent: 101 })).rejects.toThrow(/Invalid threshold/);
    await expect(runExperiment(dummyPath, { thresholdPercent: -1 })).rejects.toThrow(/Invalid threshold/);
    await expect(runExperiment(dummyPath, { thresholdPercent: 0 })).resolves.toBeUndefined();
    await expect(runExperiment(dummyPath, { thresholdPercent: 100 })).resolves.toBeUndefined();
  });
  afterEach(async () => { const { unlinkSync } = await import('node:fs'); try { unlinkSync(dummyPath); } catch {} });
});
