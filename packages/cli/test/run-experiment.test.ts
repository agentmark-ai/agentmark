import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Test constants
const MOCK_TEXT_TOKENS = 10;
const MOCK_OBJECT_TOKENS = 15;
const TEST_API_KEY = 'test-key';
const MOCK_EXPECTED_OUTPUT = 'EXPECTED';
const MOCK_MODEL_NAME = 'openai/gpt-4o';

// Test state
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
  default: vi.fn().mockResolvedValue({ apiKey: TEST_API_KEY })
}));

process.env.OPENAI_API_KEY = TEST_API_KEY;

// Mock templatedx
vi.mock('@agentmark-ai/templatedx', () => ({
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

/**
 * Creates a mock client that streams dataset results for testing.
 * Each item is processed and compared against expected output using eval functions.
 */
function mockClientWithDataset(items: any[]) {
  currentRunner = {
    async runExperiment() {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          for (const it of items) {
            const expected = it.dataset?.expected_output ?? '';
            const actual = MOCK_EXPECTED_OUTPUT;
            const evals = (it.scores ?? it.evals ?? []).map((name: string) => ({
              name,
              score: String(expected) === String(actual) ? 1 : 0,
              label: String(expected) === String(actual) ? 'correct' : 'incorrect',
              passed: String(expected) === String(actual)
            }));
            const chunk = JSON.stringify({
              type: 'dataset',
              result: {
                input: it.dataset?.input ?? {},
                expectedOutput: expected,
                actualOutput: actual,
                evals
              }
            }) + '\n';
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

// Mock AI SDK to return predictable responses
vi.mock('ai', () => ({
  generateText: vi.fn(async () => ({ text: MOCK_EXPECTED_OUTPUT })),
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
vi.mock('@agentmark-ai/prompt-core', async () => {
  const actual = await vi.importActual<any>('@agentmark-ai/prompt-core');
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

describe('run-experiment', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  let dummyPath: string;

  beforeEach(async () => {
    vi.resetModules();
    logSpy.mockClear();
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    dummyPath = join(__dirname, '..', 'tmp-experiment.mdx');
    writeFileSync(dummyPath, `---\ntext_config:\n  model_name: ${MOCK_MODEL_NAME}\n---`);
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
    try { rmSync(join(base, '.agentmark-outputs'), { recursive: true, force: true }); } catch {}
  });

  it('passes threshold when all evals PASS', async () => {
    mockClientWithDataset([{ dataset: { input: {}, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} }]);
    runExperiment = (await import('../cli-src/commands/run-experiment')).default;
    await runExperiment(dummyPath, { thresholdPercent: 100, server: 'http://127.0.0.1:9417' });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).toMatch(/Experiment passed threshold/);
  }, 15000);

  it('fails threshold when evals FAIL', async () => {
    mockClientWithDataset([{ dataset: { input: {}, expected_output: 'NOT_IN_OUTPUT' }, evals: ['contains'], formatted: {} }]);
    runExperiment = (await import('../cli-src/commands/run-experiment')).default;
    await expect(runExperiment(dummyPath, { thresholdPercent: 100 })).rejects.toThrow(/Experiment failed/);
  });

  it('honors --skip-eval and does not enforce threshold', async () => {
    mockClientWithDataset([{ dataset: { input: {}, expected_output: 'NOT_IN_OUTPUT' }, evals: ['contains'], formatted: {} }]);
    runExperiment = (await import('../cli-src/commands/run-experiment')).default;
    await runExperiment(dummyPath, { skipEval: true, thresholdPercent: 100, server: 'http://127.0.0.1:9417' });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).not.toMatch(/Experiment failed/);
  });

  it('renders eval results with PASS and reasons', async () => {
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const { join } = await import('node:path');
    const tempPath = join(__dirname, '..', 'dummy-dataset.mdx');
    writeFileSync(tempPath, '---\ntext_config:\n  model_name: openai/gpt-4o\n---');

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

    const runExperimentCmd = (await import('../cli-src/commands/run-experiment')).default;
    await runExperimentCmd(tempPath, { skipEval: false, server: 'http://127.0.0.1:9417' });

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
    runExperiment = (await import('../cli-src/commands/run-experiment')).default;
    await expect(runExperiment(dummyPath, {})).rejects.toThrow(/Loader or dataset is not defined/);
  });

  // Four sequential runExperiment calls (two of which run the full experiment);
  // the default 5s timeout is too tight on slower CI runners (notably Windows),
  // so give it the same generous budget as the other experiment-running tests.
  it('validates threshold values (0-100 inclusive)', async () => {
    mockClientWithDataset([{ dataset: { input: {}, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} }]);
    runExperiment = (await import('../cli-src/commands/run-experiment')).default;
    await expect(runExperiment(dummyPath, { thresholdPercent: 101 })).rejects.toThrow(/Invalid threshold/);
    await expect(runExperiment(dummyPath, { thresholdPercent: -1 })).rejects.toThrow(/Invalid threshold/);
    await expect(runExperiment(dummyPath, { thresholdPercent: 0 })).resolves.toBeUndefined();
    await expect(runExperiment(dummyPath, { thresholdPercent: 100 })).resolves.toBeUndefined();
  }, 30000);
  it('outputs CSV format when --format=csv is specified', async () => {
    mockClientWithDataset([
      { dataset: { input: { a: 1 }, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} },
      { dataset: { input: { b: 2 }, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} }
    ]);
    runExperiment = (await import('../cli-src/commands/run-experiment')).default;
    await runExperiment(dummyPath, { format: 'csv', server: 'http://127.0.0.1:9417' });
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
    runExperiment = (await import('../cli-src/commands/run-experiment')).default;
    await runExperiment(dummyPath, { format: 'json', server: 'http://127.0.0.1:9417' });
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

  it('outputs JUnit XML when --format=junit is specified', async () => {
    mockClientWithDataset([
      { dataset: { input: { a: 1 }, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} },
      { dataset: { input: { b: 2 }, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} },
    ]);
    runExperiment = (await import('../cli-src/commands/run-experiment')).default;
    await runExperiment(dummyPath, { format: 'junit', server: 'http://127.0.0.1:9417' });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');

    // Status messages must not contaminate the XML stream.
    expect(out).not.toContain('Running prompt with dataset');
    expect(out).not.toContain('Evaluations enabled');

    // The XML document itself.
    expect(out).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(out).toContain('<testsuites');
    expect(out).toContain('<testsuite');

    // Two rows × one scorer = two testcases.
    expect(out).toMatch(/tests="2"/);
    // Both pass against the mock (actual === expected === 'EXPECTED').
    expect(out).toMatch(/failures="0"/);

    // Each testcase has the scorer property.
    const propertyMatches = out.match(/<property name="scorer" value="exact_match"\/>/g);
    expect(propertyMatches).not.toBeNull();
    expect(propertyMatches!.length).toBe(2);
  });

  it('emits <failure> elements for failing evals in JUnit format', async () => {
    // Row 1 passes (expected === EXPECTED matches the mock).
    // Row 2 fails (expected !== mock output, so passed=false).
    mockClientWithDataset([
      { dataset: { input: { a: 1 }, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} },
      { dataset: { input: { b: 2 }, expected_output: 'something-else' }, evals: ['exact_match'], formatted: {} },
    ]);
    runExperiment = (await import('../cli-src/commands/run-experiment')).default;
    await runExperiment(dummyPath, { format: 'junit', server: 'http://127.0.0.1:9417' });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');

    expect(out).toMatch(/tests="2"/);
    expect(out).toMatch(/failures="1"/);
    expect(out).toContain('<failure message=');
    expect(out).toContain('<![CDATA[');
    // The failure CDATA must contain the I/O context for debugging.
    expect(out).toMatch(/Input:\s+\{"b":2\}/);
    expect(out).toMatch(/Expected:\s+something-else/);
    expect(out).toMatch(/Actual:\s+EXPECTED/);
  });

  it('still applies --threshold gate alongside --format=junit', async () => {
    // 2 rows: 1 pass, 1 fail → 50% pass rate, fails threshold of 80%.
    mockClientWithDataset([
      { dataset: { input: { a: 1 }, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} },
      { dataset: { input: { b: 2 }, expected_output: 'something-else' }, evals: ['exact_match'], formatted: {} },
    ]);
    runExperiment = (await import('../cli-src/commands/run-experiment')).default;
    await expect(
      runExperiment(dummyPath, { format: 'junit', thresholdPercent: 80, server: 'http://127.0.0.1:9417' })
    ).rejects.toThrow(/pass rate 50% is below threshold 80%/);

    // The XML still got emitted before the throw — the parser action in CI
    // will surface per-row failures even though the build also fails on the
    // threshold gate.
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).toContain('<testsuites');
    expect(out).toContain('<failure');
  });

  it('does not print the threshold success banner under --format=junit', async () => {
    mockClientWithDataset([
      { dataset: { input: { a: 1 }, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} },
    ]);
    runExperiment = (await import('../cli-src/commands/run-experiment')).default;
    await runExperiment(dummyPath, { format: 'junit', thresholdPercent: 100, server: 'http://127.0.0.1:9417' });
    const out = logSpy.mock.calls.map(c => String(c[0])).join('\n');

    // Success banner would corrupt the XML output if piped to a file.
    expect(out).not.toMatch(/Experiment passed threshold/);
    expect(out).not.toContain('✅');
    // XML is still emitted.
    expect(out).toContain('<testsuites');
  });

  it('rejects --format=junit_xml as an invalid format', async () => {
    // The CLI validates format before reaching the runner; this test pins
    // that we list `junit` (lowercase) and reject typos.
    mockClientWithDataset([
      { dataset: { input: {}, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} },
    ]);
    runExperiment = (await import('../cli-src/commands/run-experiment')).default;
    // The runner accepts any format string; the CLI layer is what validates.
    // Verify by importing the index module's format whitelist instead.
    const indexSource = await import('node:fs').then(({ readFileSync }) =>
      readFileSync(__dirname + '/../cli-src/index.ts', 'utf8')
    );
    expect(indexSource).toContain("'junit'");
    expect(indexSource).toMatch(/'table',\s*'csv',\s*'json',\s*'jsonl',\s*'junit'/);
  });

  it('defaults to table format when no format is specified', async () => {
    mockClientWithDataset([{ dataset: { input: {}, expected_output: 'EXPECTED' }, evals: ['exact_match'], formatted: {} }]);
    runExperiment = (await import('../cli-src/commands/run-experiment')).default;
    await runExperiment(dummyPath, { server: 'http://127.0.0.1:9417' });
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
  model_name: openai/gpt-4o
test_settings:
  dataset: ${datasetRelativePath}`;
    writeFileSync(promptPath, `---
${yamlContent}
---`);

    // Track what dataset path was captured from fetch body
    let capturedDatasetPath: string | undefined;

    // Mock templatedx to return the YAML content for this specific prompt
    const { load: originalLoad } = await import('@agentmark-ai/templatedx');
    const templatedx = await import('@agentmark-ai/templatedx');
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
    runExperiment = (await import('../cli-src/commands/run-experiment')).default;

    try {
      await runExperiment(promptPath, { server: 'http://127.0.0.1:9417', skipEval: true });

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

// ---------------------------------------------------------------------------
// Concurrency wire-threading (issue #2326)
//
// `agentmark run-experiment --concurrency <n>` must surface the value in the
// `dataset-run` webhook request body as `data.concurrency`. run-experiment.ts
// spreads it conditionally: `...(options.concurrency !== undefined ? { concurrency } : {})`.
// The runner-server then forwards it into the adapter's `runExperiment`, which
// hands it to `runDatasetPool`. The pool's `concurrency` arg is optional, so a
// dropped passthrough would not fail typecheck — this suite is the guard.
// ---------------------------------------------------------------------------
describe('run-experiment --concurrency threading', () => {
  // Spy created inside beforeEach (not at describe-body eval time) and fully
  // restored in afterEach — a module-level vi.spyOn would replace console.log
  // for the whole file and break the sibling describe's stdout assertions.
  let logSpy: ReturnType<typeof vi.spyOn>;
  let dummyPath: string;

  beforeEach(async () => {
    vi.resetModules();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    dummyPath = join(__dirname, '..', 'tmp-concurrency.mdx');
    writeFileSync(dummyPath, `---\ntext_config:\n  model_name: ${MOCK_MODEL_NAME}\n---`);
  });

  afterEach(async () => {
    logSpy.mockRestore();
    const { unlinkSync } = await import('node:fs');
    try { unlinkSync(dummyPath); } catch {}
  });

  /**
   * Override global.fetch to capture the parsed `dataset-run` request body,
   * returning a minimal one-row stream so runExperiment completes cleanly.
   * Returns a getter for the captured body.
   */
  function captureDatasetRunBody(): { get: () => any } {
    const captured: { body: any } = { body: undefined };
    const originalFetch = global.fetch;
    global.fetch = (async (_url: any, init?: any) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      if (body?.type === 'dataset-run') {
        captured.body = body;
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'dataset',
              result: { input: {}, expectedOutput: 'EXPECTED', actualOutput: 'EXPECTED', evals: [] },
            }) + '\n'));
            controller.close();
          },
        });
        return new Response(stream as any, { status: 200 } as any) as any;
      }
      return new Response('Not found', { status: 500 } as any) as any;
    }) as any;
    return {
      get: () => {
        global.fetch = originalFetch;
        return captured.body;
      },
    };
  }

  it('should put data.concurrency in the dataset-run body when a concurrency option is given', async () => {
    const capture = captureDatasetRunBody();
    const runExperiment = (await import('../cli-src/commands/run-experiment')).default;

    await runExperiment(dummyPath, { server: 'http://127.0.0.1:9417', skipEval: true, concurrency: 5 });

    const body = capture.get();
    expect(body).toBeDefined();
    expect(body.data.concurrency).toBe(5);
  });

  it('should omit data.concurrency from the dataset-run body when no concurrency option is given', async () => {
    const capture = captureDatasetRunBody();
    const runExperiment = (await import('../cli-src/commands/run-experiment')).default;

    await runExperiment(dummyPath, { server: 'http://127.0.0.1:9417', skipEval: true });

    const body = capture.get();
    expect(body).toBeDefined();
    // run-experiment.ts spreads concurrency conditionally — when absent the key
    // must NOT appear, so the runner-server falls back to the pool default (20).
    expect(body.data.concurrency).toBeUndefined();
    expect('concurrency' in body.data).toBe(false);
  });

  it('should forward an explicit concurrency of 1 verbatim into the dataset-run body', async () => {
    // A boundary value distinct from the default (20): proves the field is the
    // caller's literal value, not a default substituted somewhere downstream.
    const capture = captureDatasetRunBody();
    const runExperiment = (await import('../cli-src/commands/run-experiment')).default;

    await runExperiment(dummyPath, { server: 'http://127.0.0.1:9417', skipEval: true, concurrency: 1 });

    const body = capture.get();
    expect(body.data.concurrency).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Commander --concurrency option validator (cli-src/index.ts)
//
// cli-src/index.ts is a CLI entrypoint: importing it runs program.parseAsync
// at module load, so the --concurrency validator cannot be exercised as a unit
// without a source change. Rather than reimplement the validator here (which
// would be mirrored production logic), we run the REAL CLI as a child process
// with a bad --concurrency value and assert it exits non-zero with the
// documented error — the actual validator, end to end.
// ---------------------------------------------------------------------------
describe('--concurrency CLI flag validator', () => {
  const cliEntry = path.join(__dirname, '..', 'cli-src', 'index.ts');

  /**
   * Run the real CLI via `tsx` with
   * `run-experiment <dummy> --concurrency <value>` and capture exit code +
   * stderr. The validator runs during Commander option coercion, before
   * runExperiment is invoked, so a rejected value never touches the network.
   */
  async function runCliWithConcurrency(value: string): Promise<{ code: number | null; stderr: string }> {
    const { spawn } = await import('node:child_process');
    const tsxCli = require.resolve('tsx/cli');
    return new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [tsxCli, cliEntry, 'run-experiment', 'nonexistent-prompt.mdx', '--concurrency', value],
        { cwd: path.join(__dirname, '..'), env: { ...process.env } },
      );
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += String(d); });
      child.stdout.on('data', () => {});
      child.on('close', (code) => resolve({ code, stderr }));
    });
  }

  it('should reject a concurrency value of zero with a positive-integer error', async () => {
    const { code, stderr } = await runCliWithConcurrency('0');
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/Concurrency must be a positive integer/);
  }, 30000);

  it('should reject a negative concurrency value with a positive-integer error', async () => {
    const { code, stderr } = await runCliWithConcurrency('-3');
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/Concurrency must be a positive integer/);
  }, 30000);

  it('should reject a non-numeric concurrency value with a positive-integer error', async () => {
    const { code, stderr } = await runCliWithConcurrency('abc');
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/Concurrency must be a positive integer/);
  }, 30000);
});
