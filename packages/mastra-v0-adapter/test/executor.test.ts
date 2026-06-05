/**
 * Unit tests for MastraExecutor — translates Mastra agent.run/stream events
 * into the canonical AgentEvent stream consumed by WebhookRunner.
 *
 * The tests mock @mastra/core/agent so we don't need a real LLM — the
 * MastraExecutor's job is pure event translation, which is what this test
 * verifies end-to-end through the shared conformance assertions.
 *
 * Status: additive. Mastra's public webhook (MastraAdapterWebhookHandler)
 * still uses its legacy runner; the executor is an opt-in BYO-style path
 * for users who want the shared WebhookRunner. A future port flipping the
 * runner to WebhookRunner would require updating mastra's skip-worktree'd
 * tsconfig to support subpath `exports` (moduleResolution: node16/nodenext).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
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

async function script() {
  // Pull the scripted state out of the mocked module.
  const mod: any = await import("@mastra/core/agent");
  return mod.__scripted as {
    chunks: Array<Record<string, any>>;
    generate: any;
  };
}

// Build a formatted payload with the `_runnable` field the executor expects.
function makeFormatted(extra?: Record<string, any>): any {
  return {
    name: "probe",
    instructions: "you are helpful",
    model: {} as any,
    tools: {},
    ...extra,
    _runnable: {
      messages: [{ role: "user", content: "hello" }],
      generateOptions: {},
    },
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

  it("throws a clear error when formatted lacks _runnable", async () => {
    const { MastraExecutor } = await import("../src/executor");
    const ex = new MastraExecutor();
    const ctx = { shouldStream: false } as any;
    const events = ex.executeText({ name: "bad" } as any, ctx);
    // The error event path emits a terminal ErrorEvent carrying the
    // explanation instead of throwing out of the AsyncIterable.
    const observed = await collect(events);
    expect(observed[observed.length - 1].type).toBe("error");
    expect((observed[observed.length - 1] as any).error).toMatch(
      /_runnable/
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
    // terminal `finish` (the canonical contract — `finish` is the sole usage
    // carrier; here the mock's usage promise resolves undefined, so finish
    // carries no usage but still terminates the stream).
    expect(events.map((e) => e.type)).toEqual([
      "object-delta",
      "object-delta",
      "finish",
    ]);
    const finish = events.at(-1) as { type: "finish"; usage?: unknown };
    expect(finish.usage).toBeUndefined();
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
