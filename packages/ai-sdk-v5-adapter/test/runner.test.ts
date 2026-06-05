import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import type { EvalRegistry } from "@agentmark-ai/prompt-core";
import { FileLoader } from "@agentmark-ai/loader-file";
import { VercelAdapterWebhookHandler } from "../src/runner";
import type { Ast } from "@agentmark-ai/templatedx";
import type { PromptShape } from "@agentmark-ai/prompt-core";
import * as ai from "ai";
import { createAgentMarkClient, VercelAIModelRegistry } from "../src";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

vi.mock("ai", async () => {
  return {
    jsonSchema: (s: any) => s,
    Output: { object: (_opts: any) => ({ __experimental_output: true }) },
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

  it("threads AbortSignal through runPrompt into the executor call", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;
    const controller = new AbortController();

    await runner.runPrompt(ast, {
      shouldStream: false,
      signal: controller.signal,
    });

    expect((ai as any).generateText).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal })
    );
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
    expect(rows.every((r) => r.type === "dataset")).toBe(true);

    // Order-robust: experiments run in PARALLEL (completion order ≠ dataset
    // order), so look each row up by its own input rather than by position —
    // this also pins input↔output attribution (no cross-talk between rows).
    const byMsg = new Map<string, any>(
      rows.map((r) => [r.result.input.userMessage, r.result])
    );

    const q1 = byMsg.get("What is 2+2?");
    expect(q1).toBeTruthy();
    expect(q1.expectedOutput).toBe("4");
    expect(q1.actualOutput).toBe("TEXT");
    expect(q1.tokens).toBe(10);
    // Evals run UNCONDITIONALLY — the prompt declares
    // `test_settings.evals: [exact_match]` and the client wires the registry,
    // so a regression that drops eval execution must fail here (not be skipped).
    expect(q1.evals).toHaveLength(1);
    expect(q1.evals[0].name).toBe("exact_match");
    expect(q1.evals[0].score).toBe(0);
    expect(q1.evals[0].label).toBe("incorrect");

    const q2 = byMsg.get("Say hello");
    expect(q2).toBeTruthy();
    expect(q2.expectedOutput).toBe("Hello");
    expect(q2.actualOutput).toBe("TEXT");
    expect(q2.tokens).toBe(10);
    expect(q2.evals).toHaveLength(1);
    expect(q2.evals[0].name).toBe("exact_match");
    expect(q2.evals[0].score).toBe(0);
    expect(q2.evals[0].label).toBe("incorrect");
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
    const { stream } = await runner.runExperiment(ast, "run-sampling", { sampling: { rows: [0] } });
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

  // Regression: after Phase 3 (telemetry ownership), the adapter is the
  // single author of `experimental_telemetry` — runner-enriched telemetry
  // (trace_name + user metadata) flows in via `prompt.format()`, NOT via a
  // parallel `ctx.telemetry` merge in the executor. Assert every flavor
  // still reaches the SDK so tracing backends (Langfuse, Vercel
  // Observability, Braintrust) see prompt-level attrs intact.
  it("delivers full telemetry metadata to generateText (runner-enriched + adapter-enriched)", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

    await runner.runPrompt(ast, {
      shouldStream: false,
      telemetry: { isEnabled: true, metadata: { user_override: "x" } },
    });

    expect((ai as any).generateText).toHaveBeenCalled();
    const call = (ai as any).generateText.mock.calls[0][0];
    // Adapter contributed prompt_name (and props as JSON string).
    expect(call.experimental_telemetry.metadata.prompt_name).toBeDefined();
    expect(call.experimental_telemetry.metadata.props).toBeDefined();
    // Runner contributed trace_name + the user_override.
    expect(call.experimental_telemetry.metadata.trace_name).toBeDefined();
    expect(call.experimental_telemetry.metadata.user_override).toBe("x");
    expect(call.experimental_telemetry.isEnabled).toBe(true);
  });

  it("delivers full telemetry metadata to generateObject (runner-enriched + adapter-enriched)", async () => {
    const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;

    await runner.runPrompt(ast, {
      shouldStream: false,
      telemetry: { isEnabled: true, metadata: { user_override: "y" } },
    });

    expect((ai as any).generateObject).toHaveBeenCalled();
    const call = (ai as any).generateObject.mock.calls[0][0];
    expect(call.experimental_telemetry.metadata.prompt_name).toBeDefined();
    expect(call.experimental_telemetry.metadata.trace_name).toBeDefined();
    expect(call.experimental_telemetry.metadata.user_override).toBe("y");
  });

});

