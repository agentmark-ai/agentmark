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
              passed: String(expected) === String(actual)
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
  });

  afterEach(() => {
    logSpy.mockReset();
    // Cleanup temp files created in tests
    const { unlinkSync, rmSync } = require('node:fs');
    const { join } = require('node:path');
    const base = join(__dirname, '..');
    try { unlinkSync(join(base, 'tmp-experiment.mdx')); } catch {}
    try { unlinkSync(join(base, 'dummy-dataset.mdx')); } catch {}
    // Remove generated output directories
    try { rmSync(join(process.cwd(), '.agentmark-outputs'), { recursive: true, force: true }); } catch {}
    try { rmSync(join(process.cwd(), 'agentmark-output'), { recursive: true, force: true }); } catch {}
    try { rmSync(join(base, '.agentmark-outputs'), { recursive: true, force: true }); } catch {}
    try { rmSync(join(base, 'agentmark-output'), { recursive: true, force: true }); } catch {}
  });

  it('passes threshold when all evals PASS', async () => {
    mockClientWithDataset([{ dataset: { input: {}, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} }]);
    runExperiment = (await import('../src/commands/run-experiment')).default;
    await runExperiment(dummyPath, { thresholdPercent: 100, server: 'http://localhost:9417' });
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
    await runExperiment(dummyPath, { skipEval: true, thresholdPercent: 100, server: 'http://localhost:9417' });
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
              { name: 'exact_match', score: 1, label: 'correct', reason: 'Exact match', passed: true },
              { name: 'length_check', score: 1, label: 'pass', reason: 'Length ok', passed: true }
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
    await runExperimentCmd(tempPath, { skipEval: false, server: 'http://localhost:9417' });

    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    // Verify we have a table with two eval columns
    expect(out).toContain('exact_match');
    // Check that both evals have PASS with scores (scores may appear on separate wrapped lines)
    expect(out).toMatch(/PASS/);
    expect(out).toMatch(/1\.00/);
    // Check for the key reason texts (case-insensitive as they may be truncated/wrapped)
    expect(out.toLowerCase()).toMatch(/exact/);
    expect(out.toLowerCase()).toMatch(/match/);
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
  it('outputs CSV format when --format=csv is specified', async () => {
    mockClientWithDataset([
      { dataset: { input: { a: 1 }, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} },
      { dataset: { input: { b: 2 }, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} }
    ]);
    runExperiment = (await import('../src/commands/run-experiment')).default;
    await runExperiment(dummyPath, { format: 'csv', server: 'http://localhost:9417' });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');

    // Should not contain status messages
    expect(out).not.toContain('Running prompt with dataset');
    expect(out).not.toContain('Evaluations enabled');
    // Check CSV header
    expect(out).toMatch(/#,Input,AI Result,Expected Output,exact_match/);
    // Check CSV rows with escaped quotes
    expect(out).toMatch(/1,"\{""a"":1\}",EXPECTED,EXPECTED,/);
    expect(out).toMatch(/2,"\{""b"":2\}",EXPECTED,EXPECTED,/);
  });

  it('outputs JSON format when --format=json is specified', async () => {
    mockClientWithDataset([
      { dataset: { input: { a: 1 }, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} },
      { dataset: { input: { b: 2 }, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} }
    ]);
    runExperiment = (await import('../src/commands/run-experiment')).default;
    await runExperiment(dummyPath, { format: 'json', server: 'http://localhost:9417' });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');

    // Should not contain status messages
    expect(out).not.toContain('Running prompt with dataset');
    expect(out).not.toContain('Evaluations enabled');
    // Parse JSON output
    const jsonMatch = out.match(/^\[[\s\S]*\]$/m);
    expect(jsonMatch).toBeTruthy();
    const parsed = JSON.parse(jsonMatch![0]);

    // Verify JSON structure
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toHaveProperty('#', '1');
    expect(parsed[0]).toHaveProperty('Input');
    expect(parsed[0]).toHaveProperty('AI Result', 'EXPECTED');
    expect(parsed[0]).toHaveProperty('Expected Output', 'EXPECTED');
    expect(parsed[0]).toHaveProperty('exact_match');
  });

  it('defaults to table format when no format is specified', async () => {
    mockClientWithDataset([{ dataset: { input: {}, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} }]);
    runExperiment = (await import('../src/commands/run-experiment')).default;
    await runExperiment(dummyPath, { server: 'http://localhost:9417' });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');

    // Table format should contain status messages
    expect(out).toContain('Running prompt with dataset');
    expect(out).toContain('Evaluations enabled');
    // Table format contains box-drawing characters
    expect(out).toMatch(/[┌│└]/);
  });

  it('resolves dataset path relative to prompt file location', async () => {
    const actualPath = await vi.importActual<any>('node:path');
    const { writeFileSync, mkdirSync, unlinkSync, rmdirSync } = await import('node:fs');

    // Use actual path functions for test setup
    const subdir = actualPath.join(__dirname, '..', 'test-prompts');
    try { mkdirSync(subdir, { recursive: true }); } catch {}

    const promptPath = actualPath.join(subdir, 'test-prompt.mdx');
    const datasetRelativePath = 'test-dataset.jsonl';

    // Write prompt with relative dataset path
    const yamlContent = `text_config:
  model_name: gpt-4o
test_settings:
  dataset: ${datasetRelativePath}`;
    writeFileSync(promptPath, `---
${yamlContent}
---`);

    // Track what dataset path was captured from fetch body
    let capturedDatasetPath: string | undefined;

    // Mock templatedx to return the YAML content for this specific prompt
    const { load: originalLoad } = await import('@agentmark/templatedx');
    const templatedx = await import('@agentmark/templatedx');
    vi.mocked(templatedx.load).mockImplementation(async (filepath: string) => {
      if (filepath === promptPath) {
        return { children: [{ type: 'yaml', value: yamlContent }] } as any;
      }
      return { children: [{ type: 'yaml', value: '' }] } as any;
    });

    // Temporarily override the path mock to use actual implementations
    const pathMod = await import('path');
    const originalResolve = pathMod.resolve;
    const originalDirname = pathMod.dirname;
    vi.mocked(pathMod.resolve).mockImplementation((...args: any[]) => actualPath.resolve(...args));
    vi.mocked(pathMod.dirname).mockImplementation((p: string) => actualPath.dirname(p));

    // Override global fetch to capture datasetPath from body BEFORE vi.resetModules
    const originalFetch = global.fetch;
    global.fetch = (async (url: any, init?: any) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      if (body?.type === 'dataset-run') {
        // Capture the datasetPath from the request body
        capturedDatasetPath = body.data.datasetPath;

        // Return mock response
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            const chunk = JSON.stringify({
              type: 'dataset',
              result: {
                input: {},
                expectedOutput: 'EXPECTED',
                actualOutput: 'EXPECTED',
                evals: []
              }
            }) + '\n';
            controller.enqueue(encoder.encode(chunk));
            controller.close();
          }
        });
        return new Response(stream as any, { status: 200 } as any) as any;
      }
      return new Response('Not found', { status: 500 } as any) as any;
    }) as any;

    // Force module reload to get the updated implementation
    vi.resetModules();
    runExperiment = (await import('../src/commands/run-experiment')).default;

    try {
      await runExperiment(promptPath, { server: 'http://localhost:9417', skipEval: true });

      // Verify dataset path remains relative (not resolved to absolute)
      expect(capturedDatasetPath).toBeDefined();
      expect(capturedDatasetPath).toBe(datasetRelativePath);
      // Should be a relative path
      expect(actualPath.isAbsolute(capturedDatasetPath!)).toBe(false);
    } finally {
      // Cleanup
      global.fetch = originalFetch;
      vi.mocked(pathMod.resolve).mockImplementation(originalResolve as any);
      vi.mocked(pathMod.dirname).mockImplementation(originalDirname as any);
      try { unlinkSync(promptPath); } catch {}
      try { rmdirSync(subdir); } catch {}
    }
  });

  afterEach(async () => { const { unlinkSync } = await import('node:fs'); try { unlinkSync(dummyPath); } catch {} });
});
