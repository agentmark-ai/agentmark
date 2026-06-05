/**
 * Tests for ClaudeAgentWebhookHandler — now a thin shim over the shared
 * WebhookRunner + ClaudeAgentExecutor.
 *
 * Style matches mastra-v0-adapter's runner tests: REAL fixtures via
 * FileLoader, REAL client/adapter/prompt-core/templatedx — only the Claude
 * Agent SDK `query()` is mocked. The pre-port suite hand-mocked the client,
 * templatedx, and prompt-core, which pinned the bespoke runner's wiring;
 * these tests pin externally observable behavior instead (canonical wire
 * chunks, rejection contracts, dataset rows, sampling).
 *
 * Contract changes from the port (deliberate, matching v5 + Mastra + the
 * Python claude adapter):
 *   - Streaming emits canonical WireChunks ({type:"text", result} deltas,
 *     finish chunk carrying full WireUsage) instead of {type, delta}.
 *   - Non-streaming failures REJECT instead of returning an error-shaped
 *     result payload.
 *   - Experiments resolve format-time failures (e.g. missing dataset) as
 *     rejections instead of error chunks.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import type { Ast } from "@agentmark-ai/templatedx";
import type { EvalRegistry } from "@agentmark-ai/prompt-core";
import { FileLoader } from "@agentmark-ai/loader-file";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

// Mock ONLY the Claude Agent SDK. `scripted.messages` is replayed per query
// call; `scripted.impl` overrides wholesale for multi-call scenarios.
const scripted: {
  messages: Array<Record<string, any>>;
  impl?: (params: any) => AsyncGenerator<any>;
  lastParams?: any;
} = { messages: [] };

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn((params: any) => {
    scripted.lastParams = params;
    if (scripted.impl) return scripted.impl(params);
    return (async function* () {
      for (const m of scripted.messages) yield m;
    })();
  }),
}));

import { ClaudeAgentWebhookHandler } from "../src/runner";
import { createAgentMarkClient } from "../src";
import { query } from "@anthropic-ai/claude-agent-sdk";

const assistant = (text: string) => ({
  type: "assistant",
  message: { content: [{ type: "text", text }] },
});
const success = (over?: Record<string, unknown>) => ({
  type: "result",
  subtype: "success",
  result: "Final answer",
  usage: { input_tokens: 10, output_tokens: 5 },
  ...over,
});

async function drainStream(stream: ReadableStream): Promise<any[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const lines: string[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // Prompt streams enqueue encoded bytes; the shared experiment stream
      // enqueues wireJson strings — accept both.
      const text = typeof value === "string" ? value : decoder.decode(value);
      lines.push(...text.split("\n").filter((s) => s.trim()));
    }
  } finally {
    reader.releaseLock();
  }
  return lines.map((l) => JSON.parse(l));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("ClaudeAgentWebhookHandler", () => {
  let handler: ClaudeAgentWebhookHandler;
  let loader: FileLoader;

  beforeAll(async () => {
    await setupFixtures();
  });
  afterAll(() => cleanupFixtures());

  beforeEach(() => {
    vi.clearAllMocks();
    scripted.messages = [];
    scripted.impl = undefined;
    scripted.lastParams = undefined;

    const evals: EvalRegistry = {
      exact_match: async ({ output, expectedOutput }) => {
        const out = typeof output === "string" ? output : JSON.stringify(output);
        const exp =
          typeof expectedOutput === "string"
            ? expectedOutput
            : JSON.stringify(expectedOutput);
        return { score: out === exp ? 1 : 0, passed: out === exp };
      },
    };

    const base = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
    loader = new FileLoader(base);
    const client = createAgentMarkClient({ loader, evals });
    handler = new ClaudeAgentWebhookHandler(client as any);
  });

  describe("runPrompt — text (non-streaming default)", () => {
    it("returns the result with canonical WireUsage and finishReason", async () => {
      scripted.messages = [assistant("thinking..."), success()];
      const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

      const res: any = await handler.runPrompt(ast, {
        customProps: { userMessage: "hi" },
      });

      expect(res.type).toBe("text");
      expect(res.result).toBe("Final answer");
      expect(res.finishReason).toBe("stop");
      expect(res.usage).toEqual({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        promptTokens: 10,
        completionTokens: 5,
      });
      expect(typeof res.traceId).toBe("string");
    });

    it("defaults to a non-streaming response when shouldStream is omitted", async () => {
      // The shared runner defaults to streaming; the shim must preserve the
      // claude handler's historical non-streaming default.
      scripted.messages = [success()];
      const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

      const res = await handler.runPrompt(ast, {
        customProps: { userMessage: "hi" },
      });
      expect(res.type).toBe("text");
    });

    it("compiles custom props into the SDK prompt", async () => {
      scripted.messages = [success()];
      const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

      await handler.runPrompt(ast, {
        customProps: { userMessage: "What is the capital of France?" },
      });

      // The adapter flattens compiled messages into the query prompt string.
      expect(JSON.stringify(scripted.lastParams)).toContain(
        "What is the capital of France?"
      );
    });

    it("rejects on SDK error subtypes (shared-runner contract)", async () => {
      // Pre-port the handler returned an error-shaped result; the shared
      // WebhookRunner throws on a terminal error event.
      scripted.messages = [
        {
          type: "result",
          subtype: "error_during_execution",
          errors: ["Something went wrong"],
        },
      ];
      const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

      await expect(
        handler.runPrompt(ast, { customProps: { userMessage: "hi" } })
      ).rejects.toThrow("Something went wrong");
    });

    it("rejects on error_max_turns", async () => {
      scripted.messages = [
        { type: "result", subtype: "error_max_turns", errors: ["Max turns exceeded"] },
      ];
      const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

      await expect(
        handler.runPrompt(ast, { customProps: { userMessage: "hi" } })
      ).rejects.toThrow("Max turns exceeded");
    });

    it("rejects when the SDK query throws", async () => {
      // eslint-disable-next-line require-yield -- error thrown before any yield
      scripted.impl = async function* () {
        throw new Error("Network error");
      };
      const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

      await expect(
        handler.runPrompt(ast, { customProps: { userMessage: "hi" } })
      ).rejects.toThrow("Network error");
    });

    it("throws the shared runner's invalid-prompt error for unknown configs", async () => {
      // A real (parseable) AST whose frontmatter has no recognized config.
      const ast = {
        type: "root",
        children: [{ type: "yaml", value: "name: mystery" }],
      } as unknown as Ast;

      await expect(handler.runPrompt(ast)).rejects.toThrow("Invalid prompt");
    });
  });

  describe("runPrompt — object (non-streaming default)", () => {
    it("returns structured output as the result", async () => {
      scripted.messages = [
        success({ structured_output: { answer: "8" }, result: "" }),
      ];
      const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;

      const res: any = await handler.runPrompt(ast, {
        customProps: { userMessage: "What is 4+4?" },
      });

      expect(res.type).toBe("object");
      expect(res.result).toEqual({ answer: "8" });
    });
  });

  describe("runPrompt — unsupported kinds (legacy payloads preserved)", () => {
    it("returns the legacy text-shaped error for image prompts", async () => {
      // Inline real AST — the shim intercepts on frontmatter before any
      // loading/SDK work happens, so no pre-built fixture is needed.
      const ast = {
        type: "root",
        children: [
          { type: "yaml", value: "name: img\nimage_config:\n  model_name: openai/dall-e-3" },
        ],
      } as unknown as Ast;

      const res: any = await handler.runPrompt(ast);

      expect(res.type).toBe("text");
      expect(res.result).toContain("Image generation is not supported");
      expect(res.finishReason).toBe("error");
      expect(res.usage?.totalTokens).toBe(0);
      expect(vi.mocked(query)).not.toHaveBeenCalled();
    });

    it("returns the legacy text-shaped error for speech prompts", async () => {
      const ast = {
        type: "root",
        children: [
          { type: "yaml", value: "name: spk\nspeech_config:\n  model_name: openai/tts-1" },
        ],
      } as unknown as Ast;

      const res: any = await handler.runPrompt(ast);

      expect(res.type).toBe("text");
      expect(res.result).toContain("Speech generation is not supported");
      expect(res.finishReason).toBe("error");
    });
  });

  describe("runPrompt — streaming (canonical wire)", () => {
    it("emits {type:'text', result} deltas and a finish chunk with full WireUsage", async () => {
      scripted.messages = [
        assistant("Hello "),
        assistant("World"),
        success({ usage: { input_tokens: 100, output_tokens: 50 } }),
      ];
      const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

      const res = await handler.runPrompt(ast, {
        shouldStream: true,
        customProps: { userMessage: "hi" },
      });
      expect(res.type).toBe("stream");
      expect(res.streamHeader).toEqual({ "AgentMark-Streaming": "true" });

      const parsed = await drainStream(res.stream!);
      const deltas = parsed.filter(
        (p) => p.type === "text" && typeof p.result === "string"
      );
      expect(deltas.map((d) => d.result)).toEqual(["Hello ", "World"]);

      const finish = parsed.find((p) => p.finishReason);
      expect(finish).toEqual({
        type: "text",
        finishReason: "stop",
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          promptTokens: 100,
          completionTokens: 50,
        },
      });
    });

    it("object streams emit fragment deltas, the resolved value, then a usage chunk", async () => {
      scripted.messages = [
        assistant('{"answer":'),
        success({
          structured_output: { answer: "8" },
          result: "",
          usage: { input_tokens: 20, output_tokens: 10 },
        }),
      ];
      const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;

      const res = await handler.runPrompt(ast, {
        shouldStream: true,
        customProps: { userMessage: "What is 4+4?" },
      });
      const parsed = await drainStream(res.stream!);

      const results = parsed.filter((p) => p.type === "object" && "result" in p);
      // JSON fragment delta first, canonical object-final last.
      expect(results.at(0)?.result).toBe('{"answer":');
      expect(results.at(-1)?.result).toEqual({ answer: "8" });

      const usageChunk = parsed.find((p) => p.type === "object" && "usage" in p);
      expect(usageChunk.usage).toEqual({
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
        promptTokens: 20,
        completionTokens: 10,
      });
    });

    it("emits a terminal error chunk on SDK error subtypes", async () => {
      scripted.messages = [
        assistant("partial"),
        {
          type: "result",
          subtype: "error_during_execution",
          errors: ["Execution failed"],
        },
      ];
      const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

      const res = await handler.runPrompt(ast, {
        shouldStream: true,
        customProps: { userMessage: "hi" },
      });
      const parsed = await drainStream(res.stream!);

      expect(parsed.at(-1)).toEqual({
        type: "error",
        error: "Execution failed",
      });
    });

    it("emits a terminal error chunk when the SDK throws mid-stream", async () => {
      scripted.impl = async function* () {
        yield assistant("Start");
        throw new Error("Stream interrupted");
      };
      const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

      const res = await handler.runPrompt(ast, {
        shouldStream: true,
        customProps: { userMessage: "hi" },
      });
      const parsed = await drainStream(res.stream!);

      expect(parsed.at(-1).type).toBe("error");
      expect(parsed.at(-1).error).toContain("Stream interrupted");
    });
  });

  describe("runExperiment", () => {
    it("emits a {type:'dataset'} row per item with tokens, evals, and a shared UUID runId", async () => {
      scripted.messages = [
        success({ result: "4", usage: { input_tokens: 10, output_tokens: 1 } }),
      ];
      const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

      const res = await handler.runExperiment(ast, "my-run");
      expect(res.streamHeaders).toEqual({ "AgentMark-Streaming": "true" });

      const parsed = await drainStream(res.stream);
      const rows = parsed.filter((p) => p.type === "dataset");
      expect(rows).toHaveLength(2); // text.dataset.jsonl has 2 rows

      expect(rows[0]).toEqual({
        type: "dataset",
        result: {
          input: { userMessage: "What is 2+2?" },
          expectedOutput: "4",
          actualOutput: "4",
          tokens: 11,
          evals: [{ name: "exact_match", score: 1, passed: true }],
        },
        traceId: expect.any(String),
        runId: expect.any(String),
        runName: "my-run",
      });

      // One UUID runId across all rows of a run.
      expect(rows[0].runId).toMatch(UUID_RE);
      for (const row of rows) expect(row.runId).toBe(rows[0].runId);
    });

    it("generates a fresh runId per experiment execution", async () => {
      scripted.messages = [success({ result: "4" })];
      const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

      const first = await drainStream((await handler.runExperiment(ast, "same-name")).stream);
      const second = await drainStream((await handler.runExperiment(ast, "same-name")).stream);

      const id1 = first.find((p) => p.type === "dataset")?.runId;
      const id2 = second.find((p) => p.type === "dataset")?.runId;
      expect(id1).toMatch(UUID_RE);
      expect(id2).toMatch(UUID_RE);
      expect(id1).not.toBe(id2);
    });

    it("surfaces a failed row as an error chunk and continues with the rest", async () => {
      let call = 0;
      scripted.impl = async function* () {
        call++;
        if (call === 1) throw new Error("First item failed");
        yield success({ result: "Hello" });
      };
      const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

      const parsed = await drainStream(
        (await handler.runExperiment(ast, "run-1")).stream
      );

      expect(parsed.filter((p) => p.type === "error")).toHaveLength(1);
      expect(parsed.find((p) => p.type === "error").error).toContain(
        "First item failed"
      );
      expect(parsed.filter((p) => p.type === "dataset")).toHaveLength(1);
    });

    it("runs object experiments against the object dataset", async () => {
      scripted.messages = [
        success({ structured_output: { answer: "8" }, result: "" }),
      ];
      const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;

      const parsed = await drainStream(
        (await handler.runExperiment(ast, "run-1")).stream
      );
      const row = parsed.find((p) => p.type === "dataset");

      expect(row.result.actualOutput).toEqual({ answer: "8" });
      expect(row.result.expectedOutput).toEqual({ answer: "8" });
    });

    it("applies sampling before running rows", async () => {
      scripted.messages = [success({ result: "4" })];
      const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;

      const parsed = await drainStream(
        (
          await handler.runExperiment(ast, "run-sampled", {
            sampling: { rows: [0] },
          })
        ).stream
      );

      // Real applySampling limits execution to the selected row.
      expect(parsed.filter((p) => p.type === "dataset")).toHaveLength(1);
      expect(
        parsed.find((p) => p.type === "dataset").result.input
      ).toEqual({ userMessage: "What is 2+2?" });
    });

    it("rejects when no dataset is configured (shared-runner contract)", async () => {
      // Real parseable AST: text_config but no test_settings.dataset.
      const ast = {
        type: "root",
        children: [
          {
            type: "yaml",
            value: "name: no-dataset\ntext_config:\n  model_name: anthropic/claude-sonnet-4-20250514",
          },
        ],
      } as unknown as Ast;

      await expect(handler.runExperiment(ast, "run-1")).rejects.toThrow(
        /dataset/i
      );
    });

    it("emits the legacy error chunk for image/speech experiments", async () => {
      const ast = {
        type: "root",
        children: [
          { type: "yaml", value: "name: img\nimage_config:\n  model_name: openai/dall-e-3" },
        ],
      } as unknown as Ast;

      const parsed = await drainStream(
        (await handler.runExperiment(ast, "run-1")).stream
      );

      expect(parsed[0].type).toBe("error");
      expect(parsed[0].error).toContain("not supported");
      expect(vi.mocked(query)).not.toHaveBeenCalled();
    });
  });
});
