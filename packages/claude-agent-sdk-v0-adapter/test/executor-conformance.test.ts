/**
 * Conformance tests for ClaudeAgentExecutor — the translation from Claude
 * Agent SDK `query()` messages to the canonical AgentEvent stream.
 *
 * Mirrors the Python adapter's executor semantics (the reference pair):
 * streaming surfaces AssistantMessage deltas; one-shot skips them because
 * ResultMessage carries the final text; error subtypes are terminal error
 * events; usage rides exactly one terminal finish.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assertTextStream,
  assertObjectStream,
  assertErrorStream,
  runExecutorConformance,
  type AgentEvent,
  type Executor,
} from "@agentmark-ai/prompt-core";

// Script consumed by the mocked SDK query(). `throwOn` lets the
// runExecutorConformance error fixture trigger a synchronous failure.
const scripted: {
  messages: Array<Record<string, any>>;
  throwOn?: (params: any) => boolean;
} = { messages: [] };

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn((params: any) => {
    if (scripted.throwOn?.(params)) throw new Error("scripted failure");
    return (async function* () {
      for (const m of scripted.messages) yield m;
    })();
  }),
}));

import { ClaudeAgentExecutor } from "../src/executor";

const STREAM_CTX = { shouldStream: true } as any;
const ONESHOT_CTX = { shouldStream: false } as any;

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

beforeEach(() => {
  scripted.messages = [];
  scripted.throwOn = undefined;
});

describe("ClaudeAgentExecutor — protocol", () => {
  it("matches the Executor contract and declares text/object only", () => {
    const ex: Executor = new ClaudeAgentExecutor();
    expect(ex.name).toBe("claude-agent-sdk-v0");
    expect(ex.capabilities()).toEqual({
      text: true,
      object: true,
      image: false,
      speech: false,
    });
  });

  it("passes the full conformance suite in both stream modes", async () => {
    scripted.messages = [assistant("ok"), success()];
    // withTracing hands `formatted.query` to the SDK fn — the error fixture
    // plants a marker there that makes the mock throw synchronously.
    scripted.throwOn = (p) => p?.__explode === true;
    await runExecutorConformance(new ClaudeAgentExecutor(), {
      // formatted carries `query` — withTracing passes it to the SDK fn.
      text: { query: { prompt: "hi", options: {} }, messages: [] },
      object: { query: { prompt: "hi", options: {} }, messages: [] },
      errorInput: { query: { __explode: true }, messages: [] },
    });
  });
});

describe("ClaudeAgentExecutor — text", () => {
  it("streaming: assistant blocks become deltas; result is not re-emitted", async () => {
    scripted.messages = [assistant("Hello "), assistant("World"), success()];
    const events = await collect(
      new ClaudeAgentExecutor().executeText({ query: { prompt: "p", options: {} } }, STREAM_CTX)
    );
    await assertTextStream(replay(events));
    expect(events.map((e) => e.type)).toEqual([
      "text-delta",
      "text-delta",
      "finish",
    ]);
    expect((events[0] as any).text).toBe("Hello ");
    expect((events[1] as any).text).toBe("World");
    const finish = events.at(-1) as Extract<AgentEvent, { type: "finish" }>;
    expect(finish.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
  });

  it("one-shot: skips assistant deltas, emits the result text once", async () => {
    scripted.messages = [assistant("streamed thinking"), success()];
    const events = await collect(
      new ClaudeAgentExecutor().executeText({ query: { prompt: "p", options: {} } }, ONESHOT_CTX)
    );
    await assertTextStream(replay(events));
    expect(events.map((e) => e.type)).toEqual(["text-delta", "finish"]);
    expect((events[0] as any).text).toBe("Final answer");
  });

  it("error subtype becomes the terminal error event", async () => {
    scripted.messages = [
      assistant("partial"),
      {
        type: "result",
        subtype: "error_max_turns",
        errors: ["Max turns exceeded"],
      },
    ];
    const events = await assertErrorStream(
      new ClaudeAgentExecutor().executeText({ query: { prompt: "p", options: {} } }, STREAM_CTX)
    );
    expect((events.at(-1) as any).error).toBe("Max turns exceeded");
  });

  it("a thrown SDK error becomes the terminal error event", async () => {
    scripted.throwOn = () => true;
    const events = await assertErrorStream(
      new ClaudeAgentExecutor().executeText({ query: { prompt: "p", options: {} } }, STREAM_CTX)
    );
    expect((events.at(-1) as any).error).toBe("scripted failure");
  });
});

describe("ClaudeAgentExecutor — message-shape robustness", () => {
  it("skips system/user messages, contentless and null/empty-text blocks", async () => {
    scripted.messages = [
      { type: "system", subtype: "init" },           // SDK init message
      { type: "user", message: { content: [{ type: "text", text: "echo" }] } },
      { type: "assistant", message: {} },             // no content key
      {
        type: "assistant",
        message: { content: [null, { type: "text", text: "" }, { type: "tool_use" }] },
      },
      { type: "assistant", message: { content: [{ type: "text", text: "real" }] } },
      success(),
    ];
    const events = await collect(
      new ClaudeAgentExecutor().executeText(
        { query: { prompt: "p", options: {} } },
        STREAM_CTX
      )
    );
    // Only the real text block streams; nothing else leaks into the
    // protocol, and the system/user messages don't clobber the result.
    expect(events).toEqual([
      { type: "text-delta", text: "real" },
      {
        type: "finish",
        reason: "stop",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
    ]);
  });

  it("falls back to `Error: <subtype>` when an error result carries no errors array", async () => {
    scripted.messages = [
      { type: "result", subtype: "error_max_turns" }, // no `errors` key
    ];
    const events = await assertErrorStream(
      new ClaudeAgentExecutor().executeText(
        { query: { prompt: "p", options: {} } },
        STREAM_CTX
      )
    );
    expect((events.at(-1) as any).error).toBe("Error: error_max_turns");
  });
});

describe("ClaudeAgentExecutor — object", () => {
  it("streaming: JSON fragments are object-deltas; structured output is the final value", async () => {
    scripted.messages = [
      assistant('{"answer":'),
      assistant("42}"),
      success({ structured_output: { answer: 42 }, result: "" }),
    ];
    const events = await collect(
      new ClaudeAgentExecutor().executeObject({ query: { prompt: "p", options: {} } }, STREAM_CTX)
    );
    await assertObjectStream(replay(events));
    expect(events.map((e) => e.type)).toEqual([
      "object-delta",
      "object-delta",
      "object-final",
      "finish",
    ]);
    expect(
      (events[2] as Extract<AgentEvent, { type: "object-final" }>).value
    ).toEqual({ answer: 42 });
  });

  it("one-shot: emits object-final + finish only", async () => {
    scripted.messages = [
      assistant("ignored fragment"),
      success({ structured_output: { ok: true }, result: "" }),
    ];
    const events = await collect(
      new ClaudeAgentExecutor().executeObject({ query: { prompt: "p", options: {} } }, ONESHOT_CTX)
    );
    await assertObjectStream(replay(events));
    expect(events.map((e) => e.type)).toEqual(["object-final", "finish"]);
  });

  it("zero-defaults usage when the SDK omits it", async () => {
    scripted.messages = [
      success({ structured_output: { ok: true }, result: "", usage: undefined }),
    ];
    const events = await collect(
      new ClaudeAgentExecutor().executeObject({ query: { prompt: "p", options: {} } }, ONESHOT_CTX)
    );
    await assertObjectStream(replay(events));
    const finish = events.at(-1) as Extract<AgentEvent, { type: "finish" }>;
    expect(finish.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });
});
