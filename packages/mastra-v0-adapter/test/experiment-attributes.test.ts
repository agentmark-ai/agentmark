import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import type { EvalRegistry } from "@agentmark-ai/prompt-core";
import { FileLoader } from "@agentmark-ai/loader-file";
import { MastraAdapterWebhookHandler } from "../src/runner";
import type { Ast } from "@agentmark-ai/templatedx";
import type { MastraAgentMark } from "../src/mastra-agentmark";
import type { MastraAdapter } from "../src/adapter";
import type { PromptShape } from "@agentmark-ai/prompt-core";
import { createAgentMarkClient, MastraModelRegistry } from "../src";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

// Track setAttribute calls on experiment wrapper spans
const setAttributeCalls: Array<{ key: string; value: string | number | boolean }> = [];

// Mock Mastra Agent - must be hoisted
vi.mock("@mastra/core/agent", () => {
  const mockGenerate = vi.fn(async (_messages: any, _options?: any) => {
    if (_options?.output) {
      return {
        object: { answer: "8" },
        usage: { totalTokens: 15 },
        finishReason: "stop",
      };
    }
    return {
      text: "TEXT",
      usage: { totalTokens: 10 },
      finishReason: "stop",
      toolCalls: [],
      toolResults: [],
    };
  });

  const mockStream = vi.fn(async (_messages: any, _options?: any) => {
    if (_options?.output) {
      return {
        usage: Promise.resolve({ totalTokens: 15 }),
        fullStream: (async function* () {
          yield { type: "object", object: { answer: "8" } };
        })(),
      };
    }
    return {
      fullStream: (async function* () {
        yield { type: "text-delta", textDelta: "TEXT" };
        yield { type: "finish", finishReason: "stop", usage: { totalTokens: 10 } };
      })(),
    };
  });

  return {
    Agent: class MockAgent {
      generate = mockGenerate;
      stream = mockStream;
    },
  };
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
  let runner: MastraAdapterWebhookHandler;
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
    const modelRegistry = new MastraModelRegistry();
    modelRegistry.registerModels("test-model", () => ({
      name: "test-model",
      generate: vi.fn(),
    }) as any);
    const client = createAgentMarkClient({ loader, modelRegistry, evalRegistry: evals });
    runner = new MastraAdapterWebhookHandler(client);

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
    // Mastra returns { answer: "8" } for object prompts via mock
    expect(outputAttrs[0].value).toBe(JSON.stringify({ answer: "8" }));
  });
});
