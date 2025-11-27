import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { EvalRegistry, FileLoader } from "@agentmark/prompt-core";
import { MastraAdapterWebhookHandler } from "../src/runner";
import type { Ast } from "@agentmark/templatedx";
import type { MastraAgentMark } from "../src/mastra-agentmark";
import type { MastraAdapter } from "../src/adapter";
import { createAgentMarkClient, MastraModelRegistry } from "../src";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

// Mock Mastra Agent - must be hoisted
vi.mock("@mastra/core/agent", () => {
  const mockGenerate = vi.fn(async (_messages: any, _options?: any) => {
    // Check if output schema exists in options (object prompt)
    if (_options?.output) {
      return {
        object: { answer: "8" },
        usage: { totalTokens: 15 },
        finishReason: "stop",
      };
    }
    // Text prompt
    return {
      text: "TEXT",
      usage: { totalTokens: 10 },
      finishReason: "stop",
      toolCalls: [],
      toolResults: [],
    };
  });

  const mockStream = vi.fn(async (_messages: any, _options?: any) => {
    // Check if output schema exists in options (object prompt)
    if (_options?.output) {
      return {
        usage: Promise.resolve({ totalTokens: 15 }),
        fullStream: (async function* () {
          yield { type: "object", object: { answer: "8" } };
        })(),
      };
    }
    // Text prompt
    return {
      fullStream: (async function* () {
        yield { type: "text-delta", textDelta: "TEXT" };
        yield {
          type: "finish",
          finishReason: "stop",
          usage: { totalTokens: 10 },
        };
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

describe("MastraAdapterWebhookHandler", () => {
  let runner: MastraAdapterWebhookHandler;
  let client: MastraAgentMark<any, any, MastraAdapter<any, any>>;
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

    const evals = new EvalRegistry();
    // Simple eval: pass if TEXT equals expected_output when expected_output is a string
    evals.register("exact_match", async ({ output, expectedOutput }) => {
      const out =
        typeof output === "string" ? output : JSON.stringify(output);
      const exp =
        typeof expectedOutput === "string"
          ? expectedOutput
          : JSON.stringify(expectedOutput);
      const isMatch = out === exp;
      return {
        score: isMatch ? 1 : 0,
        label: isMatch ? "correct" : "incorrect",
        reason: isMatch
          ? "Output matches expected"
          : "Output does not match expected",
        passed: isMatch,
      };
    });

    const base = new URL("./fixtures/", import.meta.url).pathname;
    loader = new FileLoader(base);
    const modelRegistry = new MastraModelRegistry();
    modelRegistry.registerModels("test-model", () => ({
      name: "test-model",
      generate: vi.fn(),
    }) as any);
    client = createAgentMarkClient({ loader, modelRegistry, evalRegistry: evals });

    runner = new MastraAdapterWebhookHandler(client);

    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "mock-uuid") } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs text prompt", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

    const res = await runner.runPrompt(ast, { shouldStream: false });
    expect(res).toMatchObject({ type: "text", result: "TEXT" });
  });

  it("runs object prompt", async () => {
    const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;

    const res = await runner.runPrompt(ast, { shouldStream: false });
    expect(res).toMatchObject({ type: "object", result: { answer: "8" } });
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
      chunks.push(
        typeof value === "string" ? value : new TextDecoder().decode(value)
      );
    }
    expect(chunks.length).toBeGreaterThan(0);
    const first = JSON.parse(chunks[0].trim());
    expect(first.type).toBe("text");
    expect(
      typeof first.result === "string" || first.finishReason !== undefined
    ).toBe(true);
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
      chunks.push(
        typeof value === "string" ? value : new TextDecoder().decode(value)
      );
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
      const line =
        typeof value === "string" ? value : new TextDecoder().decode(value);
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
    if (
      Array.isArray(rows[0].result.evals) &&
      rows[0].result.evals.length > 0
    ) {
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
    if (
      Array.isArray(rows[1].result.evals) &&
      rows[1].result.evals.length > 0
    ) {
      expect(rows[1].result.evals[0].name).toBeDefined();
      expect(rows[1].result.evals[0].score).toBe(0);
      expect(rows[1].result.evals[0].label).toBe("incorrect");
    }
  });

  it("streams dataset for object prompts and verifies rows", async () => {
    const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;

    const { stream } = await runner.runExperiment(ast, "run-1");
    const reader = (stream as ReadableStream).getReader();
    const rows: any[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const line =
        typeof value === "string" ? value : new TextDecoder().decode(value);
      const trimmed = line.trim();
      if (trimmed) rows.push(JSON.parse(trimmed));
    }

    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.type).toBe("dataset");
    expect(row.result.input.userMessage).toBe("Provide ok:true");
    expect(row.result.expectedOutput).toEqual({ ok: true });
    expect(row.result.actualOutput).toEqual({ answer: "8" });
    expect(row.result.tokens).toBe(15);
  });

  it("throws error for image config", async () => {
    // Create a proper AST that getFrontMatter can parse
    const ast = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: "image_config:\n  model_name: test",
        },
      ],
      data: {
        frontmatter: {
          image_config: { model_name: "test" },
        },
      },
    } as any as Ast;

    await expect(runner.runPrompt(ast)).rejects.toThrow(
      "Image generation not implemented"
    );
  });

  it("throws error for speech config", async () => {
    const ast = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: "speech_config:\n  model_name: test",
        },
      ],
      data: {
        frontmatter: {
          speech_config: { model_name: "test" },
        },
      },
    } as any as Ast;

    await expect(runner.runPrompt(ast)).rejects.toThrow(
      "Speech generation not implemented"
    );
  });

  it("throws error for invalid prompt", async () => {
    // Use a real AST from a file that doesn't have valid config
    const ast = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: "name: test",
        },
      ],
      data: {
        frontmatter: {},
      },
    } as any as Ast;

    await expect(runner.runPrompt(ast)).rejects.toThrow("Invalid prompt");
  });

  it("uses custom props when provided", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

    const res = await runner.runPrompt(ast, {
      shouldStream: false,
      customProps: { userMessage: "Custom message" },
    });
    expect(res).toMatchObject({ type: "text", result: "TEXT" });
  });
});

