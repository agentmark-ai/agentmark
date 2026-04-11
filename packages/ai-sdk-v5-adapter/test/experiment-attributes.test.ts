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

// Track setAttribute calls on experiment wrapper spans
const setAttributeCalls: Array<{ key: string; value: string | number | boolean }> = [];

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

vi.mock("@agentmark-ai/sdk", () => ({
  span: vi.fn(async (options: any, fn: any) => {
    const ctx = {
      traceId: "test-trace-id",
      spanId: "test-span-id",
      setAttribute: vi.fn((key: string, value: string | number | boolean) => {
        setAttributeCalls.push({ key, value });
      }),
      addEvent: vi.fn(),
      setInput: vi.fn(),
      setOutput: vi.fn(),
      span: vi.fn(),
    };
    const result = await fn(ctx);
    return { result: Promise.resolve(result), traceId: "test-trace-id" };
  }),
}));

describe("runExperiment sets agentmark.props and agentmark.output on wrapper span", () => {
  let runner: VercelAdapterWebhookHandler;
  let loader: FileLoader;

  beforeAll(async () => {
    await setupFixtures();
  });

  afterAll(() => {
    cleanupFixtures();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    setAttributeCalls.length = 0;

    const evals: EvalRegistry = {
      exact_match: async ({ output, expectedOutput }) => {
        const out = typeof output === 'string' ? output : JSON.stringify(output);
        const exp = typeof expectedOutput === 'string' ? expectedOutput : JSON.stringify(expectedOutput);
        const isMatch = out === exp;
        return { score: isMatch ? 1 : 0, label: isMatch ? 'correct' : 'incorrect', reason: '', passed: isMatch };
      },
    };

    const base = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
    loader = new FileLoader(base);
    const modelRegistry = new VercelAIModelRegistry();
    modelRegistry.registerModels("test-model", () => ({}) as any);
    const client = createAgentMarkClient({ loader, modelRegistry, evalRegistry: evals });
    runner = new VercelAdapterWebhookHandler(client);

    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "mock-uuid") } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets agentmark.props and agentmark.output for text_config experiments", async () => {
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

    expect(rows.length).toBeGreaterThan(0);

    const propsAttrs = setAttributeCalls.filter(c => c.key === "agentmark.props");
    expect(propsAttrs.length).toBeGreaterThan(0);
    const firstInput = rows[0].result.input;
    expect(propsAttrs[0].value).toBe(JSON.stringify(firstInput));

    const outputAttrs = setAttributeCalls.filter(c => c.key === "agentmark.output");
    expect(outputAttrs.length).toBeGreaterThan(0);
    expect(outputAttrs[0].value).toBe("TEXT");
  });

  it("sets agentmark.props and agentmark.output for object_config experiments", async () => {
    const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;

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

    expect(rows.length).toBeGreaterThan(0);

    const propsAttrs = setAttributeCalls.filter(c => c.key === "agentmark.props");
    expect(propsAttrs.length).toBeGreaterThan(0);
    const firstInput = rows[0].result.input;
    expect(propsAttrs[0].value).toBe(JSON.stringify(firstInput));

    const outputAttrs = setAttributeCalls.filter(c => c.key === "agentmark.output");
    expect(outputAttrs.length).toBeGreaterThan(0);
    expect(outputAttrs[0].value).toBe(JSON.stringify({ ok: true }));
  });
});
