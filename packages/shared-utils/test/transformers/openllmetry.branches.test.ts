import { describe, it, expect } from "vitest";
import { OpenLLMetryTransformer } from "../../src/normalizer/transformers/openllmetry";
import { SpanType } from "../../src/normalizer/types";

const t = new OpenLLMetryTransformer();
const span = (events?: any[]): any => ({
  traceId: "t",
  spanId: "s",
  name: "s",
  kind: 1,
  startTimeUnixNano: "0",
  endTimeUnixNano: "1",
  events,
});

describe("OpenLLMetryTransformer.transform — empty & model preference", () => {
  it("returns {} when nothing recognized is present", () => {
    expect(t.transform(span(), {})).toStrictEqual({});
  });

  it("prefers response.model over request.model", () => {
    expect(
      t.transform(span(), { "gen_ai.request.model": "req", "gen_ai.response.model": "resp" })
    ).toStrictEqual({ model: "resp" });
  });

  it("falls back to request.model when response.model is absent", () => {
    expect(t.transform(span(), { "gen_ai.request.model": "req" })).toStrictEqual({ model: "req" });
  });

  it("ignores an empty-string model", () => {
    expect(t.transform(span(), { "gen_ai.response.model": "" })).toStrictEqual({});
  });
});

describe("OpenLLMetryTransformer.transform — tokens", () => {
  it("reads prompt/completion legacy keys and computes total", () => {
    expect(
      t.transform(span(), { "gen_ai.usage.prompt_tokens": 8, "gen_ai.usage.completion_tokens": 4 })
    ).toStrictEqual({ inputTokens: 8, outputTokens: 4, totalTokens: 12 });
  });

  it("reads the current input/output token keys", () => {
    expect(
      t.transform(span(), { "gen_ai.usage.input_tokens": 9, "gen_ai.usage.output_tokens": 1 })
    ).toStrictEqual({ inputTokens: 9, outputTokens: 1, totalTokens: 10 });
  });

  it("prefers an explicit total token count", () => {
    expect(
      t.transform(span(), {
        "gen_ai.usage.prompt_tokens": 8,
        "gen_ai.usage.completion_tokens": 4,
        "gen_ai.usage.total_tokens": 50,
      })
    ).toStrictEqual({ inputTokens: 8, outputTokens: 4, totalTokens: 50 });
  });

  it("uses llm.usage.total_tokens as a total fallback only when no computed total exists", () => {
    expect(t.transform(span(), { "gen_ai.usage.prompt_tokens": 4, "llm.usage.total_tokens": 11 })).toStrictEqual({
      inputTokens: 4,
      totalTokens: 11,
    });
  });

  it("does not apply the alt total when a computed total is already present", () => {
    expect(
      t.transform(span(), {
        "gen_ai.usage.prompt_tokens": 4,
        "gen_ai.usage.completion_tokens": 2,
        "llm.usage.total_tokens": 999,
      })
    ).toStrictEqual({ inputTokens: 4, outputTokens: 2, totalTokens: 6 });
  });
});

describe("OpenLLMetryTransformer.transform — settings & finish reason", () => {
  it("maps each request setting independently", () => {
    expect(
      t.transform(span(), {
        "gen_ai.request.temperature": 0.4,
        "gen_ai.request.max_tokens": 64,
        "gen_ai.request.top_p": 0.8,
        "gen_ai.request.presence_penalty": 0.05,
        "gen_ai.request.frequency_penalty": 0.06,
      })
    ).toStrictEqual({
      settings: { temperature: 0.4, maxTokens: 64, topP: 0.8, presencePenalty: 0.05, frequencyPenalty: 0.06 },
    });
  });

  it("emits no settings when no request params are present", () => {
    expect(t.transform(span(), { "gen_ai.response.model": "m" })).toStrictEqual({ model: "m" });
  });

  it("reads a scalar response finish reason", () => {
    expect(t.transform(span(), { "gen_ai.response.finish_reason": "stop" })).toStrictEqual({ finishReason: "stop" });
  });

  it("takes the first element of an array finish reason", () => {
    expect(t.transform(span(), { "gen_ai.response.finish_reason": ["length", "stop"] })).toStrictEqual({
      finishReason: "length",
    });
  });

  it("falls back to the indexed completion finish reason", () => {
    expect(t.transform(span(), { "gen_ai.completion.0.finish_reason": "tool_calls" })).toStrictEqual({
      finishReason: "tool_calls",
    });
  });
});

describe("OpenLLMetryTransformer.transform — input/output resolution order", () => {
  it("uses indexed prompt/completion messages first", () => {
    expect(
      t.transform(span(), {
        "gen_ai.prompt.0.role": "user",
        "gen_ai.prompt.0.content": "q",
        "gen_ai.completion.0.role": "assistant",
        "gen_ai.completion.0.content": "a",
        "traceloop.entity.input": "ignored",
        "traceloop.entity.output": "ignored",
      })
    ).toStrictEqual({ input: [{ role: "user", content: "q" }], output: "a" });
  });

  it("uses entity input/output when no indexed messages exist", () => {
    expect(
      t.transform(span(), {
        "traceloop.entity.input": '{"x":1}',
        "traceloop.entity.output": '{"y":2}',
      })
    ).toStrictEqual({
      input: [{ role: "user", content: '{"x":1}' }],
      output: '{"y":2}',
      outputObject: { y: 2 },
    });
  });

  it("keeps a JSON-array entity output as plain text (only objects become outputObject)", () => {
    expect(t.transform(span(), { "traceloop.entity.output": "[1,2]" })).toStrictEqual({ output: "[1,2]" });
  });

  it("keeps a non-JSON entity output as plain text", () => {
    expect(t.transform(span(), { "traceloop.entity.output": "plain" })).toStrictEqual({ output: "plain" });
  });

  it("stringifies a non-string entity output value", () => {
    expect(t.transform(span(), { "traceloop.entity.output": { z: 3 } })).toStrictEqual({
      output: '{"z":3}',
      outputObject: { z: 3 },
    });
  });

  it("falls back to span events for prompt and completion content", () => {
    expect(
      t.transform(
        span([
          { timeUnixNano: "0", name: "prompt", attributes: { "gen_ai.prompt": "from-event-in" } },
          { timeUnixNano: "1", name: "completion", attributes: { "gen_ai.completion": "from-event-out" } },
        ]),
        {}
      )
    ).toStrictEqual({
      input: [{ role: "user", content: "from-event-in" }],
      output: "from-event-out",
    });
  });

  it("reads an event's generic `content` attribute when the specific key is absent", () => {
    expect(
      t.transform(span([{ timeUnixNano: "0", name: "x", attributes: { content: "generic" } }]), {})
    ).toStrictEqual({ input: [{ role: "user", content: "generic" }], output: "generic" });
  });

  it("emits no IO when there are no messages, no entity IO, and no events", () => {
    expect(t.transform(span(), { "gen_ai.response.model": "m" })).toStrictEqual({ model: "m" });
  });
});

describe("OpenLLMetryTransformer.transform — tool calls, entity name, associations", () => {
  it("extracts tool calls from gen_ai.completion", () => {
    expect(
      t.transform(span(), {
        "gen_ai.completion.0.role": "assistant",
        "gen_ai.completion.0.tool_calls.0.id": "c1",
        "gen_ai.completion.0.tool_calls.0.name": "fn",
        "gen_ai.completion.0.tool_calls.0.arguments": '{"a":1}',
      })
    ).toStrictEqual({
      toolCalls: [{ type: "tool-call", toolCallId: "c1", toolName: "fn", args: { a: 1 } }],
    });
  });

  it("maps entity name to trace name only for a non-empty string", () => {
    expect(t.transform(span(), { "traceloop.entity.name": "wf" })).toStrictEqual({ traceName: "wf" });
    expect(t.transform(span(), { "traceloop.entity.name": "" })).toStrictEqual({});
  });

  it("routes association session_id/user_id to fields and other props to metadata", () => {
    expect(
      t.transform(span(), {
        "traceloop.association.properties.session_id": "s1",
        "traceloop.association.properties.user_id": "u1",
        "traceloop.association.properties.tier": "pro",
        "traceloop.association.properties.count": 3,
      })
    ).toStrictEqual({ sessionId: "s1", userId: "u1", metadata: { tier: "pro", count: "3" } });
  });

  it("emits no metadata when association properties are only session/user", () => {
    expect(
      t.transform(span(), {
        "traceloop.association.properties.session_id": "s1",
        "traceloop.association.properties.user_id": "u1",
      })
    ).toStrictEqual({ sessionId: "s1", userId: "u1" });
  });

  it("ignores an association property whose key is exactly the prefix (empty prop name)", () => {
    expect(t.transform(span(), { "traceloop.association.properties.": "orphan" })).toStrictEqual({});
  });
});

describe("OpenLLMetryTransformer.classify — token-usage operands", () => {
  it("classifies a completion-token-only span as GENERATION", () => {
    expect(t.classify(span(), { "gen_ai.usage.completion_tokens": 3 } as any)).toBe(SpanType.GENERATION);
  });
  it("classifies an input-token-only span as GENERATION", () => {
    expect(t.classify(span(), { "gen_ai.usage.input_tokens": 3 } as any)).toBe(SpanType.GENERATION);
  });
});

describe("OpenLLMetryTransformer.transform — event & entity-output edges", () => {
  it("does not throw when an event has no attributes object", () => {
    expect(t.transform(span([{ timeUnixNano: "0", name: "e" }]), {})).toStrictEqual({});
  });

  it("stringifies a numeric entity output without setting outputObject", () => {
    expect(t.transform(span(), { "traceloop.entity.output": 7 })).toStrictEqual({ output: "7" });
  });
});
