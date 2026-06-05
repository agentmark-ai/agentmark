/**
 * Unit tests for MastraExecutor — translates Mastra agent.run/stream events
 * into the canonical AgentEvent stream consumed by WebhookRunner.
 *
 * The tests mock @mastra/core/agent so we don't need a real LLM — the
 * MastraExecutor's job is pure event translation, which is what this test
 * verifies end-to-end through the shared conformance assertions.
 *
 * This IS the production path: MastraAdapterWebhookHandler is a thin shim
 * over WebhookRunner + MastraExecutor (see runner.ts). The executor consumes
 * the runnable bundle ({agent, messages, generateOptions}) that
 * adaptText/adaptObject produce; the user-facing formatAgent flow never
 * reaches it.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { AgentEvent, Executor } from "@agentmark-ai/prompt-core";
import {
  assertTextStream,
  assertObjectStream,
  assertErrorStream,
} from "@agentmark-ai/prompt-core";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

// Mock @mastra/core/agent so MastraExecutor can run without the SDK.
vi.mock("@mastra/core/agent", async () => {
  type Chunk = { [k: string]: any; type: string };
  const scripted: { chunks: Chunk[]; generate: any } = {
    chunks: [],
    generate: undefined,
  };

  class MockAgent {
    constructor(_config: any) {}
    async generate(_messages: any, _options: any) {
      return scripted.generate ?? {};
    }
    async stream(_messages: any, _options: any) {
      async function* gen() {
        for (const c of scripted.chunks) yield c;
      }
      return { fullStream: gen(), usage: Promise.resolve(undefined) };
    }
  }

  return {
    Agent: MockAgent,
    // Expose the scripted object via a named export so the test can script
    // per-case behavior without re-mocking the module.
    __scripted: scripted,
  };
});

beforeAll(async () => {
  await setupFixtures();
});
afterAll(() => cleanupFixtures());

// Every test owns its scripted SDK state. Without this reset, tests inherit
// the previous test's generate/chunks — stable under vitest's fixed order,
// but Stryker's per-test coverage subsets reorder execution and the
// inherited state made mutation results nondeterministic.
beforeEach(async () => {
  const s = await script();
  s.chunks = [];
  s.generate = undefined;
});

async function script() {
  // Pull the scripted state out of the mocked module.
  const mod: any = await import("@mastra/core/agent");
  return mod.__scripted as {
    chunks: Array<Record<string, any>>;
    generate: any;
  };
}

// Build the runnable bundle adaptText/adaptObject produce for the executor.
function makeFormatted(extra?: Record<string, any>): any {
  return {
    agent: {
      name: "probe",
      instructions: "you are helpful",
      model: {} as any,
      tools: {},
    },
    messages: [{ role: "user", content: "hello" }],
    generateOptions: {},
    ...extra,
  };
}

async function collect(
  events: AsyncIterable<AgentEvent>
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of events) out.push(ev);
  return out;
}

describe("MastraExecutor — protocol conformance", () => {
  it("matches the Executor Protocol at runtime", async () => {
    const { MastraExecutor } = await import("../src/executor");
    const ex = new MastraExecutor();
    // Structural check against the exported Executor type — passes if the
    // class shape matches the protocol.
    const _asExecutor: Executor = ex;
    expect(ex.name).toBe("mastra-v0");
    expect(ex.capabilities()).toMatchObject({
      text: true,
      object: true,
      image: false,
      speech: false,
    });
    void _asExecutor;
  });

  it("emits a clear terminal error when given a non-bundle payload (e.g. formatAgent output)", async () => {
    const { MastraExecutor } = await import("../src/executor");
    const ex = new MastraExecutor();
    const ctx = { shouldStream: false } as any;
    // formatAgent output spreads AgentConfig at the top level — no `agent`
    // key — so the executor must reject it with an actionable message.
    const events = ex.executeText(
      { name: "bad", instructions: "x", model: {}, tools: {} } as any,
      ctx
    );
    // The error event path emits a terminal ErrorEvent carrying the
    // explanation instead of throwing out of the AsyncIterable.
    const observed = await collect(events);
    expect(observed[observed.length - 1].type).toBe("error");
    expect((observed[observed.length - 1] as any).error).toMatch(
      /runnable bundle/
    );
  });
});

describe("MastraExecutor — text flow", () => {
  it("non-streaming: emits tool-call, tool-result, text-delta, finish (with usage)", async () => {
    const s = await script();
    s.generate = {
      text: "hello world",
      usage: { inputTokens: 3, outputTokens: 7, totalTokens: 10 },
      finishReason: "stop",
      toolCalls: [{ toolCallId: "t1", toolName: "search", args: { q: "x" } }],
      toolResults: [{ toolCallId: "t1", toolName: "search", result: "hit" }],
    };
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: false,
      } as any)
    );

    // Conformance.
    async function* replay() {
      for (const e of events) yield e;
    }
    await assertTextStream(replay());

    const kinds = events.map((e) => e.type);
    expect(kinds).toEqual([
      "tool-call",
      "tool-result",
      "text-delta",
      "finish",
    ]);
    const finish = events[events.length - 1] as any;
    expect(finish.usage).toMatchObject({ inputTokens: 3, outputTokens: 7 });
  });

  it("streaming: translates fullStream chunks into AgentEvents", async () => {
    const s = await script();
    s.chunks = [
      { type: "text-delta", textDelta: "hel" },
      { type: "text-delta", textDelta: "lo" },
      { type: "tool-call", toolCallId: "t2", toolName: "calc", args: { a: 1 } },
      { type: "tool-result", toolCallId: "t2", toolName: "calc", result: 2 },
      {
        type: "finish",
        finishReason: "stop",
        usage: { inputTokens: 2, outputTokens: 4 },
      },
    ];
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: true,
      } as any)
    );

    async function* replay() {
      for (const e of events) yield e;
    }
    await assertTextStream(replay());

    expect(events.map((e) => e.type)).toEqual([
      "text-delta",
      "text-delta",
      "tool-call",
      "tool-result",
      "finish",
    ]);
  });

  it("streaming: error chunk becomes a terminal ErrorEvent", async () => {
    const s = await script();
    s.chunks = [
      { type: "text-delta", textDelta: "partial" },
      { type: "error", error: { message: "boom" } },
      { type: "text-delta", textDelta: "unreachable" },
    ];
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: true,
      } as any)
    );

    async function* replay() {
      for (const e of events) yield e;
    }
    await assertErrorStream(replay());
    expect(events[events.length - 1].type).toBe("error");
    expect((events[events.length - 1] as any).error).toBe("boom");
  });

  it("streaming: synthesizes the terminal finish when fullStream omits it", async () => {
    // Regression: the executor previously ended the stream with NO finish
    // event when the SDK stream completed without a finish chunk.
    const s = await script();
    s.chunks = [{ type: "text-delta", textDelta: "hi" }];
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: true,
      } as any)
    );
    async function* replay() {
      for (const e of events) yield e;
    }
    await assertTextStream(replay());
    expect(events.map((e) => e.type)).toEqual(["text-delta", "finish"]);
    expect((events.at(-1) as any).usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });
});

describe("MastraExecutor — object flow", () => {
  it("non-streaming: emits object-final + finish with usage", async () => {
    const s = await script();
    s.generate = {
      object: { answer: 42 },
      usage: { inputTokens: 5, outputTokens: 11, totalTokens: 16 },
      finishReason: "stop",
    };
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeObject(makeFormatted(), {
        shouldStream: false,
      } as any)
    );

    async function* replay() {
      for (const e of events) yield e;
    }
    await assertObjectStream(replay());

    expect(events.map((e) => e.type)).toEqual(["object-final", "finish"]);
    expect((events[0] as any).value).toEqual({ answer: 42 });
  });

  it("streaming: 'object' chunks become object-delta events", async () => {
    const s = await script();
    s.chunks = [
      { type: "object", object: { partial: 1 } },
      { type: "object", object: { partial: 2, done: true } },
    ];
    const { MastraExecutor } = await import("../src/executor");
    const ctx = { shouldStream: true } as any;
    const events = await collect(
      new MastraExecutor().executeObject(makeFormatted(), ctx)
    );

    // Each chunk becomes an object-delta, and the stream ends with a single
    // terminal `finish`. `finish` is the sole usage carrier and ALWAYS
    // carries usage — the mock's usage promise resolves undefined, so the
    // executor zero-defaults it (same contract as `createExecutor`'s builder).
    async function* replay() {
      for (const e of events) yield e;
    }
    await assertObjectStream(replay());
    expect(events.map((e) => e.type)).toEqual([
      "object-delta",
      "object-delta",
      "finish",
    ]);
    const finish = events.at(-1) as { type: "finish"; usage?: unknown };
    expect(finish.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });
});

describe("MastraExecutor — provider shape variance and error paths", () => {
  it("rejects null / non-object payloads with the runnable-bundle error", async () => {
    const { MastraExecutor } = await import("../src/executor");
    const ex = new MastraExecutor();
    for (const bad of [null, "formatted-as-string", 42]) {
      const events = await collect(
        ex.executeText(bad as any, { shouldStream: false } as any)
      );
      expect(events[events.length - 1].type).toBe("error");
      expect((events[events.length - 1] as any).error).toMatch(/runnable bundle/);
    }
  });

  it("one-shot: tolerates toolCalls without toolResults (no phantom events)", async () => {
    const s = await script();
    s.generate = {
      text: "done",
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      toolCalls: [{ toolCallId: "t1", toolName: "a", args: 1 }],
      // no toolResults key at all
    };
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: false,
      } as any)
    );
    expect(events.map((e) => e.type)).toEqual([
      "tool-call",
      "text-delta",
      "finish",
    ]);
  });

  it("one-shot: falls back to `content` when the provider omits `text`", async () => {
    const s = await script();
    s.generate = {
      content: "from-content",
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
    };
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: false,
      } as any)
    );
    expect(events[0]).toEqual({ type: "text-delta", text: "from-content" });
  });

  it("one-shot: empty text emits no delta (finish only)", async () => {
    const s = await script();
    s.generate = {
      text: "",
      usage: { inputTokens: 1, outputTokens: 0 },
      finishReason: "stop",
    };
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: false,
      } as any)
    );
    expect(events.map((e) => e.type)).toEqual(["finish"]);
  });

  it("object one-shot: unwraps `.object` but accepts a bare object result", async () => {
    const s = await script();
    s.generate = { answer: 42 }; // provider returned the object directly
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeObject(makeFormatted(), {
        shouldStream: false,
      } as any)
    );
    expect(events[0]).toEqual({
      type: "object-final",
      value: { answer: 42 },
    });
  });

  it("object paths surface thrown SDK errors as terminal error events", async () => {
    const mod: any = await import("@mastra/core/agent");
    const { MastraExecutor } = await import("../src/executor");

    // One-shot: generate throws.
    const genSpy = vi
      .spyOn(mod.Agent.prototype, "generate")
      .mockRejectedValueOnce(new Error("object oneshot boom"));
    const a = await collect(
      new MastraExecutor().executeObject(makeFormatted(), {
        shouldStream: false,
      } as any)
    );
    expect(a.at(-1)).toEqual({ type: "error", error: "object oneshot boom" });

    // Streaming: stream() itself rejects.
    const streamSpy = vi
      .spyOn(mod.Agent.prototype, "stream")
      .mockRejectedValueOnce(new Error("object stream boom"));
    const b = await collect(
      new MastraExecutor().executeObject(makeFormatted(), {
        shouldStream: true,
      } as any)
    );
    expect(b.at(-1)).toEqual({ type: "error", error: "object stream boom" });

    genSpy.mockRestore();
    streamSpy.mockRestore();
  });

  it("object streaming: falls back to generate() when fullStream is unavailable", async () => {
    const mod: any = await import("@mastra/core/agent");
    const { MastraExecutor } = await import("../src/executor");
    const s = await script();
    s.generate = {
      object: { fell: "back" },
      usage: { inputTokens: 2, outputTokens: 2 },
      finishReason: "stop",
    };
    const streamSpy = vi
      .spyOn(mod.Agent.prototype, "stream")
      .mockResolvedValueOnce({} as any); // no fullStream property
    const events = await collect(
      new MastraExecutor().executeObject(makeFormatted(), {
        shouldStream: true,
      } as any)
    );
    expect(events.map((e) => e.type)).toEqual(["object-final", "finish"]);
    expect((events[0] as any).value).toEqual({ fell: "back" });
    streamSpy.mockRestore();
  });

  it("object streaming: error chunks are terminal; object-delta chunks carry objectDelta", async () => {
    const s = await script();
    s.chunks = [
      { type: "object-delta", objectDelta: { partial: 1 } },
      { type: "error", error: { message: "object mid-stream boom" } },
      { type: "object", object: { unreachable: true } },
    ];
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeObject(makeFormatted(), {
        shouldStream: true,
      } as any)
    );
    expect(events).toEqual([
      { type: "object-delta", partial: { partial: 1 } },
      { type: "error", error: "object mid-stream boom" },
    ]);
  });

  it("object streaming: a non-thenable usage side channel is ignored (zero-default)", async () => {
    const mod: any = await import("@mastra/core/agent");
    const { MastraExecutor } = await import("../src/executor");
    const streamSpy = vi
      .spyOn(mod.Agent.prototype, "stream")
      .mockResolvedValueOnce({
        fullStream: (async function* () {
          yield { type: "object", object: { a: 1 } };
        })(),
        usage: { inputTokens: 9, outputTokens: 9 }, // plain object, not a promise
      } as any);
    const events = await collect(
      new MastraExecutor().executeObject(makeFormatted(), {
        shouldStream: true,
      } as any)
    );
    const finish = events.at(-1) as any;
    expect(finish.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
    streamSpy.mockRestore();
  });
});

describe("MastraExecutor — text-path variants", () => {
  it("text paths surface thrown SDK errors as terminal error events", async () => {
    const mod: any = await import("@mastra/core/agent");
    const { MastraExecutor } = await import("../src/executor");

    const genSpy = vi
      .spyOn(mod.Agent.prototype, "generate")
      .mockRejectedValueOnce(new Error("text oneshot boom"));
    const a = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: false,
      } as any)
    );
    expect(a.at(-1)).toEqual({ type: "error", error: "text oneshot boom" });

    const streamSpy = vi
      .spyOn(mod.Agent.prototype, "stream")
      .mockRejectedValueOnce(new Error("text stream boom"));
    const b = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: true,
      } as any)
    );
    expect(b.at(-1)).toEqual({ type: "error", error: "text stream boom" });

    genSpy.mockRestore();
    streamSpy.mockRestore();
  });

  it("one-shot: provider finishReason passes through unclobbered", async () => {
    const s = await script();
    s.generate = {
      text: "t",
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "length",
    };
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: false,
      } as any)
    );
    expect((events.at(-1) as any).reason).toBe("length");
  });

  it("streaming: reads `text`-keyed delta chunks (v5-style) too", async () => {
    const s = await script();
    s.chunks = [
      { type: "text-delta", text: "v5-shaped" },
      { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } },
    ];
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: true,
      } as any)
    );
    expect(events[0]).toEqual({ type: "text-delta", text: "v5-shaped" });
  });

  it("object streaming: a RESOLVING usage promise funnels onto the finish", async () => {
    const mod: any = await import("@mastra/core/agent");
    const { MastraExecutor } = await import("../src/executor");
    const streamSpy = vi
      .spyOn(mod.Agent.prototype, "stream")
      .mockResolvedValueOnce({
        fullStream: (async function* () {
          yield { type: "object", object: { a: 1 } };
        })(),
        usage: Promise.resolve({ inputTokens: 8, outputTokens: 2 }),
      } as any);
    const events = await collect(
      new MastraExecutor().executeObject(makeFormatted(), {
        shouldStream: true,
      } as any)
    );
    expect((events.at(-1) as any).usage).toEqual({
      inputTokens: 8,
      outputTokens: 2,
      totalTokens: 10,
    });
    streamSpy.mockRestore();
  });

  it("streaming: captured finish carries the chunk's reason and v5-style totalUsage", async () => {
    const s = await script();
    s.chunks = [
      { type: "text-delta", textDelta: "x" },
      {
        type: "finish",
        finishReason: "length",
        totalUsage: { inputTokens: 6, outputTokens: 4 }, // no `usage` key
      },
    ];
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: true,
      } as any)
    );
    expect(events.at(-1)).toEqual({
      type: "finish",
      reason: "length",
      usage: { inputTokens: 6, outputTokens: 4, totalTokens: 10 },
    });
  });

  it("streaming: falls back to generate() when fullStream is unavailable (content + reason preserved)", async () => {
    const mod: any = await import("@mastra/core/agent");
    const { MastraExecutor } = await import("../src/executor");
    const s = await script();
    s.generate = {
      content: "fallback-content", // no `text` key — exercises the ?? chain
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "length",
    };
    const streamSpy = vi
      .spyOn(mod.Agent.prototype, "stream")
      .mockResolvedValueOnce({} as any);
    const events = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: true,
      } as any)
    );
    expect(events).toEqual([
      { type: "text-delta", text: "fallback-content" },
      {
        type: "finish",
        reason: "length",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      },
    ]);
    streamSpy.mockRestore();
  });
});

describe("MastraExecutor — extractUsage totalTokens fallback", () => {
  it("derives totalTokens from input+output when provider omits it", async () => {
    const s = await script();
    // Simulate a Mastra provider whose final chunk omits totalTokens —
    // legacy runner used promptTokens+completionTokens; executor must too.
    s.generate = {
      text: "hi",
      usage: { promptTokens: 42, completionTokens: 8 },
      finishReason: "stop",
    };
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: false,
      } as any)
    );
    const finish = events[events.length - 1] as any;
    expect(finish.type).toBe("finish");
    expect(finish.usage).toEqual({
      inputTokens: 42,
      outputTokens: 8,
      totalTokens: 50,
    });
  });

  it("preserves provider-supplied totalTokens when present", async () => {
    const s = await script();
    s.generate = {
      text: "hi",
      usage: { inputTokens: 3, outputTokens: 7, totalTokens: 12 },
      finishReason: "stop",
    };
    const { MastraExecutor } = await import("../src/executor");
    const events = await collect(
      new MastraExecutor().executeText(makeFormatted(), {
        shouldStream: false,
      } as any)
    );
    const finish = events[events.length - 1] as any;
    // Trust the SDK — don't recompute when it's already there.
    expect(finish.usage.totalTokens).toBe(12);
  });
});
