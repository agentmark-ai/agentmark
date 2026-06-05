/**
 * Behavior tests for the shared Vercel executor paths the conformance suite
 * doesn't reach — written from the mutation-survivor report, each targeting
 * a named bug class (not a mutant count):
 *
 *   - capabilities() declaration
 *   - v5-style `input`/`output` keyed tool fields (`?? c.input` fallbacks)
 *   - provider finishReason pass-through (`?? "stop"` must not clobber)
 *   - absent steps / text-less results (the `?? []` and `if (text)` guards)
 *   - empty-tools object prompts routing to generateObject (NOT Output)
 *   - SDK param pass-through (spread + abortSignal threading)
 *   - image/speech execution (previously only covered via v4/v5 runners)
 *   - chunk-adapter usage guards (non-object usage, string totalTokens)
 */
import { describe, it, expect } from "vitest";
import type { AgentEvent, ExecCtx } from "@agentmark-ai/prompt-core";
import { createVercelExecutor, type VercelSDK } from "../src/executor-factory.js";
import { v4Chunks, v5Chunks } from "../src/chunk-adapter.js";

const STREAM_CTX: ExecCtx = { shouldStream: true };
const ONESHOT_CTX: ExecCtx = { shouldStream: false };

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of events) out.push(ev);
  return out;
}

function sdkStub(overrides: Partial<VercelSDK>): VercelSDK {
  const unstubbed = (name: string) => () => {
    throw new Error(`sdkStub: ${name} was called but not scripted`);
  };
  return {
    generateText: unstubbed("generateText"),
    streamText: unstubbed("streamText"),
    generateObject: unstubbed("generateObject"),
    streamObject: unstubbed("streamObject"),
    generateImage: unstubbed("generateImage"),
    generateSpeech: unstubbed("generateSpeech"),
    ...overrides,
  } as VercelSDK;
}

async function* gen(
  chunks: Array<import("../src/executor-factory.js").VercelStreamChunk>
) {
  for (const c of chunks) yield c;
}

const make = (sdk: Partial<VercelSDK>) =>
  createVercelExecutor({ name: "vercel-ai-v5", chunks: v5Chunks, sdk: sdkStub(sdk) });

describe("capabilities", () => {
  it("declares all four modalities", () => {
    expect(make({}).capabilities()).toEqual({
      text: true,
      object: true,
      image: true,
      speech: true,
    });
  });
});

describe("text — one-shot result-shape handling", () => {
  it("reads v5 `input`/`output` keyed tool fields when `args`/`result` are absent", async () => {
    const executor = make({
      generateText: async () => ({
        text: "",
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1 },
        steps: [
          {
            toolCalls: [{ toolCallId: "t1", toolName: "calc", input: { a: 1 } }],
            toolResults: [{ toolCallId: "t1", toolName: "calc", output: 2 }],
          },
        ],
      }),
    });
    const events = await collect(executor.executeText({}, ONESHOT_CTX));
    expect(events).toEqual([
      { type: "tool-call", id: "t1", name: "calc", args: { a: 1 } },
      { type: "tool-result", id: "t1", name: "calc", result: 2 },
      {
        type: "finish",
        reason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      },
    ]);
  });

  it("passes the provider finishReason through (no clobber to 'stop')", async () => {
    const executor = make({
      generateText: async () => ({
        text: "truncated",
        finishReason: "length",
        usage: { inputTokens: 1, outputTokens: 1 },
        steps: [],
      }),
    });
    const events = await collect(executor.executeText({}, ONESHOT_CTX));
    const finish = events.at(-1) as Extract<AgentEvent, { type: "finish" }>;
    expect(finish.reason).toBe("length");
  });

  it("tolerates steps missing toolCalls or toolResults keys", async () => {
    const executor = make({
      generateText: async () => ({
        text: "",
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1 },
        steps: [
          { toolCalls: [{ toolCallId: "t1", toolName: "a", input: 1 }] }, // no toolResults
          { toolResults: [{ toolCallId: "t1", toolName: "a", output: 2 }] }, // no toolCalls
        ],
      }),
    });
    const events = await collect(executor.executeText({}, ONESHOT_CTX));
    expect(events).toEqual([
      { type: "tool-call", id: "t1", name: "a", args: 1 },
      { type: "tool-result", id: "t1", name: "a", result: 2 },
      {
        type: "finish",
        reason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      },
    ]);
  });

  it("emits no tool events when steps are absent, no text-delta when text is empty", async () => {
    const executor = make({
      generateText: async () => ({
        // No steps key at all, empty text — exactly one finish should emerge.
        text: "",
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 0 },
      }),
    });
    const events = await collect(executor.executeText({}, ONESHOT_CTX));
    expect(events).toEqual([
      {
        type: "finish",
        reason: "stop",
        usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
      },
    ]);
  });
});

describe("text — streaming chunk handling", () => {
  it("reads v5 `input`/`output` keyed tool chunks and passes finishReason through", async () => {
    const executor = make({
      streamText: () => ({
        fullStream: gen([
          { type: "tool-call", toolCallId: "t1", toolName: "calc", input: { a: 1 } },
          { type: "tool-result", toolCallId: "t1", toolName: "calc", output: 2 },
          {
            type: "finish",
            finishReason: "length",
            totalUsage: { inputTokens: 1, outputTokens: 1 },
          },
        ]),
      }),
    });
    const events = await collect(executor.executeText({}, STREAM_CTX));
    expect(events).toEqual([
      { type: "tool-call", id: "t1", name: "calc", args: { a: 1 } },
      { type: "tool-result", id: "t1", name: "calc", result: 2 },
      {
        type: "finish",
        reason: "length",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      },
    ]);
  });

  it("ignores unknown chunk types — including AFTER the finish chunk", async () => {
    // Real v5 streams interleave step-start/step-finish chunks; an unknown
    // trailing chunk must not be mistaken for a finish and clobber the
    // captured reason/usage with stop/zeros.
    const executor = make({
      streamText: () => ({
        fullStream: gen([
          { type: "step-start" },
          { type: "text-delta", text: "hi" },
          {
            type: "finish",
            finishReason: "length",
            totalUsage: { inputTokens: 3, outputTokens: 4 },
          },
          { type: "step-finish", weird: true },
        ]),
      }),
    });
    const events = await collect(executor.executeText({}, STREAM_CTX));
    expect(events).toEqual([
      { type: "text-delta", text: "hi" },
      {
        type: "finish",
        reason: "length",
        usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
      },
    ]);
  });

  it("drops text-delta chunks whose payload field is missing (v5 reads `text` only)", async () => {
    const executor = make({
      streamText: () => ({
        fullStream: gen([
          // v4-shaped chunk fed to a v5 executor — readTextChunk returns
          // undefined and NO delta event may be emitted.
          { type: "text-delta", textDelta: "wrong-major" },
          {
            type: "finish",
            finishReason: "stop",
            totalUsage: { inputTokens: 1, outputTokens: 1 },
          },
        ]),
      }),
    });
    const events = await collect(executor.executeText({}, STREAM_CTX));
    expect(events.map((e) => e.type)).toEqual(["finish"]);
  });
});

describe("object — tools routing and param pass-through", () => {
  it("routes EMPTY tools objects to generateObject, not the Output path", async () => {
    let generateObjectParams: Record<string, unknown> | undefined;
    const executor = make({
      generateObject: async (p: Record<string, unknown>) => {
        generateObjectParams = p;
        return {
          object: { ok: true },
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
      // No Output stub: taking the tools path would emit an error event.
    });
    const events = await collect(
      executor.executeObject(
        { tools: {}, schema: { type: "object" }, model: "m" },
        ONESHOT_CTX
      )
    );
    expect(events.map((e) => e.type)).toEqual(["object-final", "finish"]);
    // Param spread: the formatted payload reaches the SDK intact.
    expect(generateObjectParams).toMatchObject({
      tools: {},
      schema: { type: "object" },
      model: "m",
    });
  });

  it("passes the object finishReason through in one-shot mode", async () => {
    const executor = make({
      generateObject: async () => ({
        object: { ok: true },
        finishReason: "content-filter",
        usage: { inputTokens: 1, outputTokens: 1 },
      }),
    });
    const events = await collect(executor.executeObject({}, ONESHOT_CTX));
    const finish = events.at(-1) as Extract<AgentEvent, { type: "finish" }>;
    expect(finish.reason).toBe("content-filter");
  });

  it("zero-defaults usage on the tools streaming path; schema + params reach the SDK", async () => {
    let outputArg: unknown;
    let streamParams: Record<string, unknown> | undefined;
    const executor = make({
      Output: {
        object: (opts: { schema: unknown }) => {
          outputArg = opts;
          return { kind: "output", schema: opts.schema };
        },
      },
      streamText: (p: Record<string, unknown>) => {
        streamParams = p;
        return {
          experimental_partialOutputStream: gen([{ a: 1 }]),
          usage: Promise.resolve(undefined),
        };
      },
    });
    const events = await collect(
      executor.executeObject(
        { tools: { search: {} }, schema: { type: "object" }, model: "m" },
        STREAM_CTX
      )
    );
    const finish = events.at(-1) as Extract<AgentEvent, { type: "finish" }>;
    expect(finish.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
    // Contract pins: the prompt's schema is handed to Output.object, and the
    // remaining formatted fields (schema stripped, output wired) reach the SDK.
    expect(outputArg).toEqual({ schema: { type: "object" } });
    expect(streamParams).toMatchObject({
      tools: { search: {} },
      model: "m",
      experimental_output: { kind: "output", schema: { type: "object" } },
    });
    expect(streamParams).not.toHaveProperty("schema");
  });

  it("passes the tools-path one-shot finishReason through", async () => {
    const executor = make({
      Output: { object: ({ schema }: { schema: unknown }) => ({ schema }) },
      generateText: async () => ({
        resolvedOutput: { done: true },
        finishReason: "length",
        usage: { inputTokens: 1, outputTokens: 1 },
      }),
    });
    const events = await collect(
      executor.executeObject(
        { tools: { search: {} }, schema: { type: "object" } },
        ONESHOT_CTX
      )
    );
    const finish = events.at(-1) as Extract<AgentEvent, { type: "finish" }>;
    expect(finish.reason).toBe("length");
  });

  it("turns per-branch object SDK failures into terminal error events", async () => {
    // One-shot, no tools: generateObject rejects.
    const oneShot = make({
      generateObject: async () => {
        throw new Error("oneshot boom");
      },
    });
    const a = await collect(oneShot.executeObject({}, ONESHOT_CTX));
    expect(a.at(-1)).toEqual({ type: "error", error: "oneshot boom" });

    // One-shot, tools: generateText rejects.
    const toolsOneShot = make({
      Output: { object: ({ schema }: { schema: unknown }) => ({ schema }) },
      generateText: async () => {
        throw new Error("tools oneshot boom");
      },
    });
    const b = await collect(
      toolsOneShot.executeObject(
        { tools: { t: {} }, schema: {} },
        ONESHOT_CTX
      )
    );
    expect(b.at(-1)).toEqual({ type: "error", error: "tools oneshot boom" });

    // Streaming, tools: the partial-output stream throws mid-iteration.
    const toolsStream = make({
      Output: { object: ({ schema }: { schema: unknown }) => ({ schema }) },
      streamText: () => ({
        experimental_partialOutputStream: (async function* () {
          yield { a: 1 };
          throw new Error("tools stream boom");
        })(),
        usage: Promise.resolve(undefined),
      }),
    });
    const c = await collect(
      toolsStream.executeObject({ tools: { t: {} }, schema: {} }, STREAM_CTX)
    );
    expect(c.at(-1)).toEqual({ type: "error", error: "tools stream boom" });
  });

  it("object streams: error chunks are terminal, unknown chunk types emit nothing", async () => {
    let streamObjectParams: Record<string, unknown> | undefined;
    const executor = make({
      streamObject: (p: Record<string, unknown>) => {
        streamObjectParams = p;
        return {
          fullStream: gen([
            { type: "object", object: { a: 1 } },
            { type: "step-marker" }, // unknown — must not become a delta
            { type: "error", error: { message: "mid-stream boom" } },
            { type: "object", object: { unreachable: true } },
          ]),
          usage: Promise.resolve(undefined),
        };
      },
    });
    const events = await collect(
      executor.executeObject({ schema: {}, model: "m" }, STREAM_CTX)
    );
    expect(events).toEqual([
      { type: "object-delta", partial: { a: 1 } },
      { type: "error", error: "mid-stream boom" },
    ]);
    expect(streamObjectParams).toMatchObject({ schema: {}, model: "m" });
  });
});

describe("image / speech execution", () => {
  it("maps generateImage results with mimeType-then-mediaType fallback", async () => {
    let imageParams: Record<string, unknown> | undefined;
    const executor = make({
      generateImage: async (p: Record<string, unknown>) => {
        imageParams = p;
        return {
          images: [
            { mimeType: "image/png", base64: "AAA" },
            { mediaType: "image/webp", base64: "BBB" },
          ],
        };
      },
    });
    const res = await executor.executeImage!({ prompt: "cat", n: 2 }, {});
    expect(res).toEqual({
      type: "image",
      result: [
        { mimeType: "image/png", base64: "AAA" },
        { mimeType: "image/webp", base64: "BBB" },
      ],
      traceId: "",
    });
    expect(imageParams).toMatchObject({ prompt: "cat", n: 2 });
  });

  it("maps generateSpeech results with mimeType-then-mediaType fallback", async () => {
    let speechParams: Record<string, unknown> | undefined;
    const executor = make({
      generateSpeech: async (p: Record<string, unknown>) => {
        speechParams = p;
        return {
          audio: { mediaType: "audio/mpeg", base64: "CCC", format: "mp3" },
        };
      },
    });
    const res = await executor.executeSpeech!({ text: "hi" }, {});
    expect(speechParams).toMatchObject({ text: "hi" });
    expect(res).toEqual({
      type: "speech",
      result: { mimeType: "audio/mpeg", base64: "CCC", format: "mp3" },
      traceId: "",
    });
  });
});

describe("chunk adapters — usage normalization guards", () => {
  it("rejects non-object usage payloads", () => {
    expect(v4Chunks.normalizeUsage(null)).toBeUndefined();
    expect(v4Chunks.normalizeUsage("tokens: lots")).toBeUndefined();
    expect(v5Chunks.normalizeUsage(42)).toBeUndefined();
  });

  it("ignores non-numeric totalTokens and derives the sum instead", () => {
    expect(
      v4Chunks.normalizeUsage({ usage: { inputTokens: 1, outputTokens: 2, totalTokens: "9" } })
    ).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
  });

  it("v5 prefers totalUsage but falls back to usage when absent", () => {
    expect(
      v5Chunks.normalizeUsage({ usage: { inputTokens: 5, outputTokens: 6 } })
    ).toEqual({ inputTokens: 5, outputTokens: 6, totalTokens: 11 });
    expect(
      v5Chunks.normalizeUsage({
        totalUsage: { inputTokens: 7, outputTokens: 8 },
        usage: { inputTokens: 1, outputTokens: 1 },
      })
    ).toEqual({ inputTokens: 7, outputTokens: 8, totalTokens: 15 });
  });
});
