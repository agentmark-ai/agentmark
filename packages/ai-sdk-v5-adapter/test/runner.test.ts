import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import type { EvalRegistry } from "@agentmark-ai/prompt-core";
import { FileLoader } from "@agentmark-ai/loader-file";
import { VercelAdapterWebhookHandler } from "../src/runner";
import type { Ast } from "@agentmark-ai/templatedx";
import type { PromptShape } from "@agentmark-ai/prompt-core";
import type { VercelAIAdapter } from "../src/adapter";
import * as ai from "ai";
import { createAgentMarkClient, VercelAIModelRegistry } from "../src";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

vi.mock("ai", async () => {
  return {
    jsonSchema: (s: any) => s,
    generateText: vi.fn(async (_input: any) => ({ text: "TEXT", usage: { totalTokens: 10 }, finishReason: "stop", steps: [] })),
    generateObject: vi.fn(async (_input: any) => ({ object: { ok: true }, usage: { totalTokens: 15 }, finishReason: "stop" })),
    experimental_generateImage: vi.fn(async (_input: any) => ({ images: [{ mediaType: "image/png", base64: "iVBORw0KGgo=" }] })),
    experimental_generateSpeech: vi.fn(async (_input: any) => ({ audio: { mediaType: "audio/mpeg", base64: "base64audio", format: "mp3" } })),
    streamText: vi.fn((_input: any) => ({
      fullStream: (async function* () { yield { type: 'text-delta', text: 'TEXT' }; yield { type: 'finish', finishReason: 'stop', totalUsage: { totalTokens: 10 } }; })()
    })),
    streamObject: vi.fn((_input: any) => ({
      usage: Promise.resolve({ totalTokens: 15 }),
      fullStream: (async function* () { yield { type: 'object', object: { ok: true } }; })()
    })),
  } as any;
});

// ---------------------------------------------------------------------------
// Concurrency wire-threading (issue #2326)
//
// runner.ts imports `runDatasetPool` from @agentmark-ai/prompt-core and calls
// it with the `concurrency` arg it received in runExperiment(...). The pool's
// `concurrency` parameter is optional, so a dropped passthrough would not fail
// typecheck. We partial-mock prompt-core: `runDatasetPool` becomes a spy that
// still delegates to the real pool (via importActual), so the rest of the
// adapter behaves normally while the `concurrency` argument stays observable.
// ---------------------------------------------------------------------------
const poolMock = vi.hoisted(() => ({
  // The spy the runner actually calls.
  runDatasetPool: vi.fn(),
  // The real bounded pool, captured from the factory's importActual so we can
  // re-install the passthrough after beforeEach's vi.clearAllMocks() wipes it.
  realRunDatasetPool: undefined as
    | typeof import("@agentmark-ai/prompt-core")["runDatasetPool"]
    | undefined,
}));

vi.mock("@agentmark-ai/prompt-core", async (importActual) => {
  const actual = await importActual<typeof import("@agentmark-ai/prompt-core")>();
  poolMock.realRunDatasetPool = actual.runDatasetPool;
  return { ...actual, runDatasetPool: poolMock.runDatasetPool };
});

/**
 * Make the runDatasetPool spy delegate transparently to the real bounded pool.
 * Called from beforeEach because vi.clearAllMocks() strips the implementation.
 * With this in place the runner streams real dataset rows AND every call's
 * `concurrency` argument is recorded on poolMock.runDatasetPool.mock.calls.
 */
function installPassthroughPool(): void {
  poolMock.runDatasetPool.mockImplementation((...args: any[]) =>
    (poolMock.realRunDatasetPool as any)(...args),
  );
}

describe("VercelAdapterWebhookHandler", () => {
  let runner: VercelAdapterWebhookHandler;
  let client: ReturnType<typeof createAgentMarkClient<PromptShape<Record<string, never>>>>;
  let loader: FileLoader;

  // Build pre-compiled fixtures before tests run
  beforeAll(async () => {
    await setupFixtures();
  });

  // Clean up generated fixtures after tests
  afterAll(() => {
    cleanupFixtures();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // vi.clearAllMocks() also wiped the runDatasetPool spy's implementation —
    // re-install the passthrough so the pool runs for real this test.
    installPassthroughPool();

    const evals: EvalRegistry = {
      exact_match: async ({ output, expectedOutput }) => {
        const out = typeof output === 'string' ? output : JSON.stringify(output);
        const exp = typeof expectedOutput === 'string' ? expectedOutput : JSON.stringify(expectedOutput);
        const isMatch = out === exp;
        return {
          score: isMatch ? 1 : 0,
          label: isMatch ? 'correct' : 'incorrect',
          reason: isMatch ? 'Output matches expected' : 'Output does not match expected',
          passed: isMatch
        };
      },
    };

    // Use fileURLToPath for cross-platform path resolution (Windows URL pathname has leading slash)
    const base = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
    loader = new FileLoader(base);
    const modelRegistry = new VercelAIModelRegistry();
    modelRegistry.registerModels("test-model", () => ({}) as any);
    client = createAgentMarkClient({ loader, modelRegistry, evalRegistry: evals });

    runner = new VercelAdapterWebhookHandler(client);

    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "mock-uuid") } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs text prompt", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

    const res = await runner.runPrompt(ast, { shouldStream: false });
    expect((ai as any).generateText).toHaveBeenCalled();
    expect(res).toMatchObject({ type: "text", result: "TEXT" });
  });

  it("runs object prompt", async () => {
    const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;

    const res = await runner.runPrompt(ast, { shouldStream: false });
    expect((ai as any).generateObject).toHaveBeenCalled();
    expect(res).toMatchObject({ type: "object", result: { ok: true } });
  });

  it("runs image prompt", async () => {
    const ast = (await loader.load("image.prompt.mdx", "image")) as Ast;

    const res = await runner.runPrompt(ast);
    expect((ai as any).experimental_generateImage).toHaveBeenCalled();
    expect(res).toMatchObject({ type: "image" });
  });

  it("runs speech prompt", async () => {
    const ast = (await loader.load("speech.prompt.mdx", "speech")) as Ast;
    const res = await runner.runPrompt(ast);
    expect((ai as any).experimental_generateSpeech).toHaveBeenCalled();
    expect(res).toMatchObject({ type: "speech" });
  });

  it("runs text prompt with streaming", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;
    const res = await runner.runPrompt(ast, { shouldStream: true });
    expect(res.type).toBe("stream");
    const reader = (res as any).stream.getReader();
    const chunks: string[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(typeof value === "string" ? value : new TextDecoder().decode(value));
    }
    expect(chunks.length).toBeGreaterThan(0);
    const first = JSON.parse(chunks[0].trim());
    expect(first.type).toBe("text");
    expect(typeof first.result === "string" || first.finishReason !== undefined).toBe(true);
  });

  it("runs object prompt with streaming", async () => {
    const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;
    const res = await runner.runPrompt(ast, { shouldStream: true });
    expect(res.type).toBe("stream");
    const reader = (res as any).stream.getReader();
    const chunks: string[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(typeof value === "string" ? value : new TextDecoder().decode(value));
    }
    expect(chunks.length).toBeGreaterThan(0);
    const first = JSON.parse(chunks[0].trim());
    expect(first.type).toBe("object");
    expect(first.result).toBeDefined();
  });

  it("streams dataset for text prompts and verifies rows & evals", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

    const { stream } = await runner.runExperiment(ast, "run-1");
    const reader = (stream as ReadableStream).getReader();
    const rows: any[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const line = typeof value === "string" ? value : new TextDecoder().decode(value);
      const trimmed = line.trim();
      if (trimmed) rows.push(JSON.parse(trimmed));
    }

    expect(rows.length).toBe(2);

    // Row 0
    expect(rows[0].type).toBe("dataset");
    expect(rows[0].result.input.userMessage).toBe("What is 2+2?");
    expect(rows[0].result.expectedOutput).toBe("4");
    expect(rows[0].result.actualOutput).toBe("TEXT");
    expect(rows[0].result.tokens).toBe(10);
    if (Array.isArray(rows[0].result.evals) && rows[0].result.evals.length > 0) {
      expect(rows[0].result.evals[0].name).toBeDefined();
      expect(rows[0].result.evals[0].score).toBe(0);
      expect(rows[0].result.evals[0].label).toBe("incorrect");
    }

    // Row 1
    expect(rows[1].type).toBe("dataset");
    expect(rows[1].result.input.userMessage).toBe("Say hello");
    expect(rows[1].result.expectedOutput).toBe("Hello");
    expect(rows[1].result.actualOutput).toBe("TEXT");
    expect(rows[1].result.tokens).toBe(10);
    if (Array.isArray(rows[1].result.evals) && rows[1].result.evals.length > 0) {
      expect(rows[1].result.evals[0].name).toBeDefined();
      expect(rows[1].result.evals[0].score).toBe(0);
      expect(rows[1].result.evals[0].label).toBe("incorrect");
    }
  });

  it("streams all JSONL rows when using SDK loader (dataset over HTTP)", async () => {
    // Simulate SDK loader behavior by returning a ReadableStream-like object whose getReader yields parsed objects per line
    const lines = [
      { input: { q: "A" } },
      { input: { q: "B" } },
      { input: { q: "C" } },
    ];
    const fakeStream: any = {
      getReader() {
        let i = 0;
        return {
          async read() {
            if (i >= lines.length) return { done: true, value: undefined };
            const v = lines[i++];
            return { done: false, value: v };
          }
        };
      }
    };
    (loader as any).loadDataset = vi.fn(async () => fakeStream);

    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;
    const { stream } = await runner.runExperiment(ast, "run-sdk");
    const reader = (stream as ReadableStream).getReader();
    const rows: any[] = [];
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = typeof value === 'string' ? value : decoder.decode(value);
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        rows.push(JSON.parse(line));
      }
    }

    // Expect three dataset rows
    const dsRows = rows.filter(r => r.type === 'dataset');
    expect(dsRows.length).toBe(3);
    expect(dsRows[0].result.input.q).toBe('A');
    expect(dsRows[1].result.input.q).toBe('B');
    expect(dsRows[2].result.input.q).toBe('C');
  });

  it("surfaces a dataset-row error as an error chunk instead of silently dropping it", async () => {
    // A row that fails to format (here a null row, so `value.input` throws)
    // must NOT vanish: otherwise an all-invalid dataset streams zero rows and
    // run-experiment exits 0, reading as a pass. The runner now emits an error
    // chunk for it. Regression guard for the silent-skip fix.
    const lines: any[] = [{ input: { q: "ok" } }, null];
    const fakeStream: any = {
      getReader() {
        let i = 0;
        return {
          async read() {
            if (i >= lines.length) return { done: true, value: undefined };
            return { done: false, value: lines[i++] };
          }
        };
      }
    };
    (loader as any).loadDataset = vi.fn(async () => fakeStream);

    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;
    const { stream } = await runner.runExperiment(ast, "run-err");
    const reader = (stream as ReadableStream).getReader();
    const rows: any[] = [];
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = typeof value === "string" ? value : decoder.decode(value);
      for (const line of chunk.split("\n")) { if (line.trim()) rows.push(JSON.parse(line)); }
    }

    const errors = rows.filter((r) => r.type === "error");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("streams dataset for object prompts and verifies rows", async () => {
    const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;

    // Ensure object path is exercised
    (ai as any).generateObject = vi.fn(async () => ({ object: { ok: true }, usage: { totalTokens: 1 }, finishReason: "stop" }));

    const { stream } = await runner.runExperiment(ast, "run-1");
    const reader = (stream as ReadableStream).getReader();
    const rows: any[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const line = typeof value === "string" ? value : new TextDecoder().decode(value);
      const trimmed = line.trim();
      if (trimmed) rows.push(JSON.parse(trimmed));
    }

    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.type).toBe("dataset");
    expect(row.result.input.userMessage).toBe("Provide ok:true");
    expect(row.result.expectedOutput).toEqual({ ok: true });
    expect(row.result.actualOutput).toEqual({ ok: true });
    expect(row.result.tokens).toBe(1);
  });

  it("streams dataset for image prompts and verifies rows", async () => {
    const ast = (await loader.load("image.prompt.mdx", "image")) as Ast;

    const { stream } = await runner.runExperiment(ast, "run-1");
    const reader = (stream as ReadableStream).getReader();
    const rows: any[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const line = typeof value === "string" ? value : new TextDecoder().decode(value);
      const trimmed = line.trim();
      if (trimmed) rows.push(JSON.parse(trimmed));
    }

    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.type).toBe("dataset");
    expect(row.result.input.userMessage).toBe("Draw a triangle");
    expect(Array.isArray(row.result.expectedOutput)).toBe(true);
    expect(row.result.expectedOutput[0].mimeType).toBe("image/png");
    expect(Array.isArray(row.result.actualOutput)).toBe(true);
    expect(row.result.actualOutput[0].mimeType).toBe("image/png");
  });

  it("streams dataset for speech prompts and verifies rows", async () => {
    const ast = (await loader.load("speech.prompt.mdx", "speech")) as Ast;

    const { stream } = await runner.runExperiment(ast, "run-1");
    const reader = (stream as ReadableStream).getReader();
    const rows: any[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const line = typeof value === "string" ? value : new TextDecoder().decode(value);
      const trimmed = line.trim();
      if (trimmed) rows.push(JSON.parse(trimmed));
    }

    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.type).toBe("dataset");
    expect(row.result.input.text).toBe("Hello");
    expect(row.result.expectedOutput.mimeType).toBe("audio/mpeg");
    expect(row.result.actualOutput.mimeType).toBe("audio/mpeg");
  });

  it("passes sampling options through runExperiment and returns only sampled rows", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;
    // Dataset has 2 rows; { rows: [0] } should return only row 0
    const { stream } = await runner.runExperiment(ast, "run-sampling", undefined, { rows: [0] });
    const reader = (stream as ReadableStream).getReader();
    const rows: any[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const line = typeof value === "string" ? value : new TextDecoder().decode(value);
      const trimmed = line.trim();
      if (trimmed) rows.push(JSON.parse(trimmed));
    }
    expect(rows.length).toBe(1);
    expect(rows[0].result.input.userMessage).toBe("What is 2+2?");
  });

  // -------------------------------------------------------------------------
  // concurrency threading: runExperiment(..., concurrency) → runDatasetPool
  // -------------------------------------------------------------------------

  /** Drain a dataset stream so the runner's runDatasetPool call actually runs. */
  async function drainStream(stream: ReadableStream): Promise<void> {
    const reader = stream.getReader();
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
  }

  it("should forward the concurrency argument to runDatasetPool when runExperiment is given one", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

    // runExperiment(promptAst, datasetRunName, datasetPath, sampling, concurrency)
    const { stream } = await runner.runExperiment(ast, "run-concurrency", undefined, undefined, 3);
    await drainStream(stream as ReadableStream);

    expect(poolMock.runDatasetPool).toHaveBeenCalledTimes(1);
    // Signature: runDatasetPool(reader, processItem, concurrency) — concurrency
    // is the 3rd positional argument.
    expect(poolMock.runDatasetPool.mock.calls[0][2]).toBe(3);
  });

  it("should pass concurrency=1 verbatim to runDatasetPool, not the pool default", async () => {
    // 1 is a boundary value distinct from DEFAULT_EXPERIMENT_CONCURRENCY (20).
    // If the passthrough were dropped, the 3rd arg would be undefined and the
    // pool would silently fall back to 20 — this pins the literal value.
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

    const { stream } = await runner.runExperiment(ast, "run-concurrency-1", undefined, undefined, 1);
    await drainStream(stream as ReadableStream);

    expect(poolMock.runDatasetPool.mock.calls[0][2]).toBe(1);
  });

  it("should call runDatasetPool with an undefined concurrency when runExperiment is given none", async () => {
    // No concurrency arg → runner forwards undefined → pool applies its own
    // default. The assertion proves the runner does not substitute a value.
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

    const { stream } = await runner.runExperiment(ast, "run-no-concurrency");
    await drainStream(stream as ReadableStream);

    expect(poolMock.runDatasetPool).toHaveBeenCalledTimes(1);
    expect(poolMock.runDatasetPool.mock.calls[0][2]).toBeUndefined();
  });

});

