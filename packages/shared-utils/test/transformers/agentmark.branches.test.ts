import { describe, it, expect } from "vitest";
import { AgentMarkTransformer, AGENTMARK_SCOPE_NAME } from "../../src/normalizer/transformers/agentmark";
import { SpanType } from "../../src/normalizer/types";

const t = new AgentMarkTransformer();
const span = (name: string): any => ({
  traceId: "t",
  spanId: "s",
  name,
  kind: 1,
  startTimeUnixNano: "0",
  endTimeUnixNano: "1",
});

describe("AgentMarkTransformer.classify", () => {
  it("GENERATION from operation name chat/text_completion/embeddings", () => {
    expect(t.classify(span("x"), { "gen_ai.operation.name": "chat" })).toBe(SpanType.GENERATION);
    expect(t.classify(span("x"), { "gen_ai.operation.name": "text_completion" })).toBe(SpanType.GENERATION);
    expect(t.classify(span("x"), { "gen_ai.operation.name": "embeddings" })).toBe(SpanType.GENERATION);
  });
  it("GENERATION from span name chat/llm.turn/session", () => {
    expect(t.classify(span("chat gpt"), {})).toBe(SpanType.GENERATION);
    expect(t.classify(span("chat"), {})).toBe(SpanType.GENERATION);
    expect(t.classify(span("gen_ai.llm.turn"), {})).toBe(SpanType.GENERATION);
    expect(t.classify(span("gen_ai.session"), {})).toBe(SpanType.GENERATION);
  });
  it("SPAN for tool/agent/conversation spans", () => {
    expect(t.classify(span("execute_tool x"), {})).toBe(SpanType.SPAN);
    expect(t.classify(span("gen_ai.tool.call"), {})).toBe(SpanType.SPAN);
    expect(t.classify(span("invoke_agent y"), {})).toBe(SpanType.SPAN);
    expect(t.classify(span("gen_ai.conversation"), {})).toBe(SpanType.SPAN);
    expect(t.classify(span("gen_ai.subagent"), {})).toBe(SpanType.SPAN);
  });
  it("GENERATION via anthropic fallback only with both tokens AND response output", () => {
    expect(
      t.classify(span("z"), { "gen_ai.system": "anthropic", "gen_ai.usage.input_tokens": 1, "gen_ai.response.output": "o" })
    ).toBe(SpanType.GENERATION);
    // missing response.output → not enough → SPAN
    expect(t.classify(span("z"), { "gen_ai.system": "anthropic", "gen_ai.usage.input_tokens": 1 })).toBe(SpanType.SPAN);
    // wrong system → SPAN
    expect(t.classify(span("z"), { "gen_ai.system": "openai", "gen_ai.usage.input_tokens": 1, "gen_ai.response.output": "o" })).toBe(SpanType.SPAN);
  });
  it("defaults to SPAN", () => {
    expect(t.classify(span("z"), {})).toBe(SpanType.SPAN);
  });
});

describe("AgentMarkTransformer.transform — full generation span", () => {
  it("extracts model/tokens/cost/finish/settings/input/output", () => {
    expect(
      t.transform(span("chat"), {
        "gen_ai.response.model": "gpt-4o",
        "gen_ai.request.model": "req",
        "gen_ai.usage.input_tokens": 10,
        "gen_ai.usage.output_tokens": 5,
        "agentmark.usage.cost_usd": 0.002,
        "gen_ai.response.finish_reasons": JSON.stringify(["stop", "x"]),
        "gen_ai.request.max_tokens": 100,
        "gen_ai.request.temperature": 0.5,
        "gen_ai.request.input": JSON.stringify([{ role: "user", content: "hi" }]),
        "gen_ai.response.output": JSON.stringify({ answer: 1 }),
      })
    ).toStrictEqual({
      model: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cost: 0.002,
      finishReason: "stop",
      settings: { maxTokens: 100, temperature: 0.5 },
      input: [{ role: "user", content: "hi" }],
      output: '{"answer":1}',
      outputObject: { answer: 1 },
    });
  });

  it("prefers response model, falls back to request model, and String()s a non-string", () => {
    expect(t.transform(span("chat"), { "gen_ai.request.model": "only-req" })).toStrictEqual({ model: "only-req" });
    // response model wins over request model
    expect(
      t.transform(span("chat"), { "gen_ai.response.model": "resp", "gen_ai.request.model": "req" })
    ).toStrictEqual({ model: "resp" });
    // any truthy value is coerced via String()
    expect(t.transform(span("chat"), { "gen_ai.response.model": 123 })).toStrictEqual({ model: "123" });
  });

  it("only sets cost for a positive numeric cost_usd", () => {
    expect(t.transform(span("chat"), { "agentmark.usage.cost_usd": 0 })).toStrictEqual({});
    expect(t.transform(span("chat"), { "agentmark.usage.cost_usd": -1 })).toStrictEqual({});
    expect(t.transform(span("chat"), { "agentmark.usage.cost_usd": "0.1" })).toStrictEqual({});
  });

  it("computes totalTokens only when both token counts present", () => {
    expect(t.transform(span("chat"), { "gen_ai.usage.input_tokens": 3 })).toStrictEqual({ inputTokens: 3 });
    expect(t.transform(span("chat"), { "gen_ai.usage.output_tokens": 7 })).toStrictEqual({ outputTokens: 7 });
  });
});

describe("AgentMarkTransformer.transform — finish reason + settings branches", () => {
  it("uses a raw (non-JSON) finish reason as-is via the catch path", () => {
    expect(t.transform(span("chat"), { "gen_ai.response.finish_reasons": "stop" })).toStrictEqual({ finishReason: "stop" });
  });
  it("ignores an empty JSON finish-reasons array", () => {
    expect(t.transform(span("chat"), { "gen_ai.response.finish_reasons": "[]" })).toStrictEqual({});
  });
  it("emits a partial settings object when only one of maxTokens/temperature is numeric", () => {
    expect(t.transform(span("chat"), { "gen_ai.request.max_tokens": 50 })).toStrictEqual({ settings: { maxTokens: 50 } });
    // present-but-non-numeric still creates settings (object), but skips the field
    expect(t.transform(span("chat"), { "gen_ai.request.temperature": "hot" })).toStrictEqual({ settings: {} });
  });
});

describe("AgentMarkTransformer.transform — input parsing branches", () => {
  it("keeps a valid messages array as-is", () => {
    expect(
      t.transform(span("chat"), { "gen_ai.request.input": JSON.stringify([{ role: "user", content: "hi" }]) })
    ).toStrictEqual({ input: [{ role: "user", content: "hi" }] });
  });
  it("wraps a non-messages JSON array as a single user text message", () => {
    const raw = JSON.stringify([{ foo: 1 }]);
    expect(t.transform(span("chat"), { "gen_ai.request.input": raw })).toStrictEqual({
      input: [{ role: "user", content: raw }],
    });
  });
  it("wraps plain (non-JSON) text as a single user message", () => {
    expect(t.transform(span("chat"), { "gen_ai.request.input": "just text" })).toStrictEqual({
      input: [{ role: "user", content: "just text" }],
    });
  });
  it("wraps an empty JSON array as plain text", () => {
    expect(t.transform(span("chat"), { "gen_ai.request.input": "[]" })).toStrictEqual({
      input: [{ role: "user", content: "[]" }],
    });
  });
});

describe("AgentMarkTransformer.transform — agentmark.* fallbacks + tools", () => {
  it("falls back to agentmark.props for input and agentmark.output for output", () => {
    expect(t.transform(span("x"), { "agentmark.props": "the-props", "agentmark.output": "out-text" })).toStrictEqual({
      input: [{ role: "user", content: "the-props" }],
      output: "out-text",
      props: "the-props",
    });
  });
  it("builds a tool call with parsed input args + result, and raw fallback", () => {
    expect(
      t.transform(span("execute_tool"), {
        "gen_ai.tool.name": "search",
        "gen_ai.tool.call.id": "id1",
        "gen_ai.tool.input": JSON.stringify({ q: 1 }),
        "gen_ai.tool.output": "res",
      })
    ).toStrictEqual({
      name: "search",
      toolCalls: [{ type: "tool-call", toolCallId: "id1", toolName: "search", args: { q: 1 }, result: "res" }],
    });
    expect(
      t.transform(span("execute_tool"), { "gen_ai.tool.name": "search", "gen_ai.tool.input": "not-json" })
    ).toStrictEqual({
      name: "search",
      toolCalls: [{ type: "tool-call", toolCallId: "", toolName: "search", args: { raw: "not-json" } }],
    });
  });
});

describe("AgentMarkTransformer.transform — agentmark.* attribute + metadata extraction", () => {
  it("extracts agentmark.metadata.* into the metadata field", () => {
    expect(
      t.transform(span("x"), { "agentmark.metadata.userId": "u1", "agentmark.metadata.sessionId": "s1" })
    ).toStrictEqual({ metadata: { userId: "u1", sessionId: "s1" } });
  });
  it("extracts a known agentmark.* attribute (prompt_name -> promptName)", () => {
    expect(t.transform(span("x"), { "agentmark.prompt_name": "my-prompt" })).toStrictEqual({ promptName: "my-prompt" });
  });
  it("combines a known agentmark.* attribute with custom metadata", () => {
    expect(
      t.transform(span("x"), { "agentmark.prompt_name": "p", "agentmark.metadata.k": "v" })
    ).toStrictEqual({ promptName: "p", metadata: { k: "v" } });
  });
});

it("exposes the agentmark scope name", () => {
  expect(AGENTMARK_SCOPE_NAME).toBe("agentmark");
});
