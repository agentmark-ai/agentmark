/**
 * Executor-protocol conformance for the shared Vercel executor factory.
 *
 * This is the suite the architecture review flagged as missing: the factory
 * hand-rolls the `Executor` contract (it predates `createExecutor`), so
 * nothing guaranteed the protocol invariants — exactly one terminal `finish`
 * carrying usage, `error` as a terminal event (never a thrown exception),
 * tool-results following their tool-call — by construction. These tests pin
 * them with the same `assert*Stream` helpers the Mastra adapter uses, across
 * BOTH chunk adapters so v4/v5 field-shape differences stay covered.
 *
 * The SDK is scripted per test — the factory's job is pure event
 * translation, so no real model calls are needed.
 */
import { describe, it, expect } from "vitest";
import {
  assertTextStream,
  assertObjectStream,
  assertErrorStream,
  assertAbortStream,
  assertUsageShape,
  runExecutorConformance,
  type AgentEvent,
  type ExecCtx,
} from "@agentmark-ai/prompt-core";
import { createVercelExecutor, type VercelSDK } from "../src/executor-factory.js";
import { v4Chunks, v5Chunks, type ChunkAdapter } from "../src/chunk-adapter.js";

const STREAM_CTX: ExecCtx = { shouldStream: true };
const ONESHOT_CTX: ExecCtx = { shouldStream: false };

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of events) out.push(ev);
  return out;
}

function replay(events: AgentEvent[]): AsyncIterable<AgentEvent> {
  return (async function* () {
    for (const e of events) yield e;
  })();
}

/** A VercelSDK stub where every entry point fails loudly unless overridden. */
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

/** Version-specific chunk builders, so each adapter is fed ITS native shape. */
const shapes = {
  "vercel-ai-v4": {
    chunks: v4Chunks,
    textDelta: (text: string) => ({ type: "text-delta", textDelta: text }),
    finish: (usage?: Record<string, number>) => ({
      type: "finish",
      finishReason: "stop",
      usage,
    }),
  },
  "vercel-ai-v5": {
    chunks: v5Chunks,
    textDelta: (text: string) => ({ type: "text-delta", text }),
    finish: (usage?: Record<string, number>) => ({
      type: "finish",
      finishReason: "stop",
      totalUsage: usage,
    }),
  },
} satisfies Record<
  string,
  {
    chunks: ChunkAdapter;
    textDelta: (text: string) => Record<string, unknown>;
    finish: (usage?: Record<string, number>) => Record<string, unknown>;
  }
>;

describe.each(Object.entries(shapes))("%s executor", (name, shape) => {
  const make = (sdk: Partial<VercelSDK>) =>
    createVercelExecutor({ name, chunks: shape.chunks, sdk: sdkStub(sdk) });

  describe("text — streaming", () => {
    it("translates deltas/tools and ends with one usage-carrying finish", async () => {
      const executor = make({
        streamText: () => ({
          fullStream: gen([
            shape.textDelta("hel"),
            shape.textDelta("lo"),
            { type: "tool-call", toolCallId: "t1", toolName: "search", args: { q: "x" } },
            { type: "tool-result", toolCallId: "t1", toolName: "search", result: "hit" },
            shape.finish({ inputTokens: 2, outputTokens: 4 }),
          ]),
        }),
      });
      const events = await collect(executor.executeText({}, STREAM_CTX));
      await assertTextStream(replay(events));
      expect(events.map((e) => e.type)).toEqual([
        "text-delta",
        "text-delta",
        "tool-call",
        "tool-result",
        "finish",
      ]);
      const finish = events.at(-1) as Extract<AgentEvent, { type: "finish" }>;
      expect(finish.usage).toEqual({
        inputTokens: 2,
        outputTokens: 4,
        totalTokens: 6,
      });
      assertUsageShape(finish.usage!);
    });

    it("synthesizes the terminal finish when the SDK stream omits it", async () => {
      // Regression: the factory previously ended the stream with NO finish
      // event if fullStream completed without a finish chunk.
      const executor = make({
        streamText: () => ({ fullStream: gen([shape.textDelta("hi")]) }),
      });
      const events = await collect(executor.executeText({}, STREAM_CTX));
      await assertTextStream(replay(events));
      expect(events.map((e) => e.type)).toEqual(["text-delta", "finish"]);
      const finish = events.at(-1) as Extract<AgentEvent, { type: "finish" }>;
      expect(finish.usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
    });

    it("collapses duplicate SDK finish chunks into exactly one", async () => {
      const executor = make({
        streamText: () => ({
          fullStream: gen([
            shape.textDelta("x"),
            shape.finish({ inputTokens: 1, outputTokens: 1 }),
            shape.finish({ inputTokens: 9, outputTokens: 9 }),
          ]),
        }),
      });
      const events = await collect(executor.executeText({}, STREAM_CTX));
      await assertTextStream(replay(events));
      expect(events.filter((e) => e.type === "finish")).toHaveLength(1);
      // Last capture wins — mirrors "the SDK's final word is authoritative".
      const finish = events.at(-1) as Extract<AgentEvent, { type: "finish" }>;
      expect(finish.usage).toEqual({
        inputTokens: 9,
        outputTokens: 9,
        totalTokens: 18,
      });
    });

    it("turns a synchronous streamText throw into a terminal error event", async () => {
      // Regression: streamText was invoked OUTSIDE the try, so a sync throw
      // escaped the AsyncIterable instead of becoming a terminal error.
      const executor = make({
        streamText: () => {
          throw new Error("registry misconfigured");
        },
      });
      const events = await assertErrorStream(executor.executeText({}, STREAM_CTX));
      expect((events.at(-1) as { error: string }).error).toBe(
        "registry misconfigured"
      );
    });

    it("emits a mid-stream SDK error chunk as the terminal event", async () => {
      const executor = make({
        streamText: () => ({
          fullStream: gen([
            shape.textDelta("partial"),
            { type: "error", error: { message: "boom" } },
            shape.textDelta("unreachable"),
          ]),
        }),
      });
      const events = await assertErrorStream(executor.executeText({}, STREAM_CTX));
      expect(events.map((e) => e.type)).toEqual(["text-delta", "error"]);
      expect((events.at(-1) as { error: string }).error).toBe("boom");
    });
  });

  describe("text — one-shot", () => {
    it("orders tool-call before tool-result and carries usage on finish", async () => {
      const executor = make({
        generateText: async () => ({
          text: "answer",
          finishReason: "stop",
          usage: { inputTokens: 3, outputTokens: 7 },
          steps: [
            {
              toolCalls: [{ toolCallId: "t1", toolName: "calc", args: { a: 1 } }],
              toolResults: [{ toolCallId: "t1", toolName: "calc", result: 2 }],
            },
          ],
        }),
      });
      const events = await collect(executor.executeText({}, ONESHOT_CTX));
      await assertTextStream(replay(events));
      expect(events.map((e) => e.type)).toEqual([
        "tool-call",
        "tool-result",
        "text-delta",
        "finish",
      ]);
    });

    it("turns a generateText rejection into a terminal error event", async () => {
      const executor = make({
        generateText: async () => {
          throw new Error("rate limited");
        },
      });
      const events = await assertErrorStream(executor.executeText({}, ONESHOT_CTX));
      expect((events.at(-1) as { error: string }).error).toBe("rate limited");
    });
  });

  describe("object — streaming (no tools)", () => {
    it("emits object-deltas and a finish fed by the side-channel usage promise", async () => {
      const executor = make({
        streamObject: () => ({
          fullStream: gen([
            { type: "object", object: { a: 1 } },
            { type: "object", object: { a: 1, b: 2 } },
          ]),
          usage: Promise.resolve({ inputTokens: 5, outputTokens: 11 }),
        }),
      });
      const events = await collect(executor.executeObject({}, STREAM_CTX));
      await assertObjectStream(replay(events));
      expect(events.map((e) => e.type)).toEqual([
        "object-delta",
        "object-delta",
        "finish",
      ]);
      const finish = events.at(-1) as Extract<AgentEvent, { type: "finish" }>;
      expect(finish.usage).toEqual({
        inputTokens: 5,
        outputTokens: 11,
        totalTokens: 16,
      });
    });

    it("zero-defaults usage when the side channel reports nothing", async () => {
      const executor = make({
        streamObject: () => ({
          fullStream: gen([{ type: "object", object: { a: 1 } }]),
          usage: Promise.resolve(undefined),
        }),
      });
      const events = await collect(executor.executeObject({}, STREAM_CTX));
      await assertObjectStream(replay(events));
      const finish = events.at(-1) as Extract<AgentEvent, { type: "finish" }>;
      expect(finish.usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
    });

    it("turns a synchronous streamObject throw into a terminal error event", async () => {
      // Regression: streamObject was invoked OUTSIDE the try.
      const executor = make({
        streamObject: () => {
          throw new Error("bad schema");
        },
      });
      const events = await assertErrorStream(executor.executeObject({}, STREAM_CTX));
      expect((events.at(-1) as { error: string }).error).toBe("bad schema");
    });
  });

  describe("object — one-shot (no tools)", () => {
    it("emits object-final then finish with usage", async () => {
      const executor = make({
        generateObject: async () => ({
          object: { answer: 42 },
          finishReason: "stop",
          usage: { inputTokens: 4, outputTokens: 6 },
        }),
      });
      const events = await collect(executor.executeObject({}, ONESHOT_CTX));
      await assertObjectStream(replay(events));
      expect(events.map((e) => e.type)).toEqual(["object-final", "finish"]);
      expect(
        (events[0] as Extract<AgentEvent, { type: "object-final" }>).value
      ).toEqual({ answer: 42 });
    });
  });

  describe("object — with tools (Output.object path)", () => {
    const tools = { search: { description: "find things" } };

    it("streams partial output and funnels side-channel usage onto finish", async () => {
      const executor = make({
        Output: { object: ({ schema }: { schema: unknown }) => ({ kind: "output", schema }) },
        streamText: () => ({
          experimental_partialOutputStream: gen([{ a: 1 }, { a: 1, b: 2 }]),
          usage: Promise.resolve({ inputTokens: 8, outputTokens: 2 }),
        }),
      });
      const events = await collect(
        executor.executeObject({ tools, schema: { type: "object" } }, STREAM_CTX)
      );
      await assertObjectStream(replay(events));
      expect(events.map((e) => e.type)).toEqual([
        "object-delta",
        "object-delta",
        "finish",
      ]);
    });

    it("resolves the final object via generateText in one-shot mode", async () => {
      const executor = make({
        Output: { object: ({ schema }: { schema: unknown }) => ({ kind: "output", schema }) },
        generateText: async () => ({
          resolvedOutput: { done: true },
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      });
      const events = await collect(
        executor.executeObject({ tools, schema: { type: "object" } }, ONESHOT_CTX)
      );
      await assertObjectStream(replay(events));
      expect(events.map((e) => e.type)).toEqual(["object-final", "finish"]);
      expect(
        (events[0] as Extract<AgentEvent, { type: "object-final" }>).value
      ).toEqual({ done: true });
    });

    it("emits a terminal error when the SDK lacks Output.object", async () => {
      const executor = make({});
      const events = await assertErrorStream(
        executor.executeObject({ tools, schema: { type: "object" } }, STREAM_CTX)
      );
      expect((events.at(-1) as { error: string }).error).toMatch(
        /Output\.object/
      );
    });
  });

  describe("abort", () => {
    it("stops emitting at the abort boundary and forwards ctx.signal to the SDK", async () => {
      const controller = new AbortController();
      let seenSignal: AbortSignal | undefined;
      let yielded = 0;
      const executor = make({
        streamText: (p: Record<string, unknown>) => {
          seenSignal = p.abortSignal as AbortSignal | undefined;
          return {
            fullStream: (async function* () {
              // Endless stream — only the abort can end this run. A real SDK
              // stops yielding once its abortSignal fires; mirror that here.
              while (!controller.signal.aborted) {
                yielded++;
                yield shape.textDelta("tick");
              }
            })(),
          };
        },
      });

      const observed = await assertAbortStream(
        executor.executeText({}, { shouldStream: true, signal: controller.signal }),
        controller,
        { abortAfterEvents: 3 }
      );

      // ctx.signal must reach the SDK call as `abortSignal` — that's the
      // mechanism a real provider uses to cancel the network request.
      expect(seenSignal).toBe(controller.signal);
      // Exactly the pre-abort events, nothing after the boundary.
      expect(observed.map((e) => e.type)).toEqual([
        "text-delta",
        "text-delta",
        "text-delta",
      ]);
      // The infinite source must not have been drained past the abort
      // boundary (one chunk of read-ahead is tolerated).
      expect(yielded).toBeLessThanOrEqual(4);
    });
  });

  it("passes the full runExecutorConformance suite in both stream modes", async () => {
    // One scripted SDK that services every path runExecutorConformance hits:
    // text + object, streaming + one-shot, and an error fixture that makes
    // the SDK throw. `errorInput` carries a marker the stubs check.
    const isBad = (p: Record<string, unknown>) => p.__explode === true;
    const executor = make({
      generateText: async (p: Record<string, unknown>) => {
        if (isBad(p)) throw new Error("scripted failure");
        return {
          text: "ok",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
      streamText: (p: Record<string, unknown>) => {
        if (isBad(p)) throw new Error("scripted failure");
        return {
          fullStream: gen([
            shape.textDelta("ok"),
            shape.finish({ inputTokens: 1, outputTokens: 1 }),
          ]),
        };
      },
      generateObject: async () => ({
        object: { ok: true },
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1 },
      }),
      streamObject: () => ({
        fullStream: gen([{ type: "object", object: { ok: true } }]),
        usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      }),
    });

    await runExecutorConformance(executor, {
      text: {},
      object: {},
      errorInput: { __explode: true },
    });
  });
});
