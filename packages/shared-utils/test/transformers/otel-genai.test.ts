import { describe, it, expect } from "vitest";
import { OtelGenAiTransformer } from "../../src/normalizer/transformers/otel-genai";
import { SpanType } from "../../src/normalizer/types";

const t = new OtelGenAiTransformer();
const span = (name: string): any => ({
  traceId: "t",
  spanId: "s",
  name,
  kind: 1,
  startTimeUnixNano: "0",
  endTimeUnixNano: "1",
});

describe("OtelGenAiTransformer.classify", () => {
  it("classifies 'chat …' spans as GENERATION", () => {
    expect(t.classify(span("chat gpt-4o"), {})).toBe(SpanType.GENERATION);
  });
  it("classifies invoke_agent / 'agent run' / execute_tool / 'running …' as SPAN", () => {
    expect(t.classify(span("invoke_agent foo"), {})).toBe(SpanType.SPAN);
    expect(t.classify(span("agent run"), {})).toBe(SpanType.SPAN);
    expect(t.classify(span("execute_tool x"), {})).toBe(SpanType.SPAN);
    expect(t.classify(span("running thing"), {})).toBe(SpanType.SPAN);
  });
  it("falls back to GENERATION when input-token usage is present", () => {
    expect(t.classify(span("weird"), { "gen_ai.usage.input_tokens": 5 })).toBe(SpanType.GENERATION);
  });
  it("defaults to SPAN otherwise", () => {
    expect(t.classify(span("weird"), {})).toBe(SpanType.SPAN);
  });
});

describe("OtelGenAiTransformer.transform — generation span", () => {
  it("extracts model, tokens (+ computed total), first finish reason, temperature, IO", () => {
    expect(
      t.transform(span("chat m"), {
        "gen_ai.response.model": "gpt-4o",
        "gen_ai.usage.input_tokens": 10,
        "gen_ai.usage.output_tokens": 4,
        "gen_ai.response.finish_reasons": ["stop", "x"],
        "gen_ai.request.temperature": 0.7,
        "gen_ai.input.messages": JSON.stringify([
          { role: "user", parts: [{ type: "text", content: "hi" }, { type: "text", content: "there" }] },
        ]),
        "gen_ai.output.messages": JSON.stringify([
          { role: "assistant", parts: [{ type: "tool_call", arguments: { a: 1 } }] },
        ]),
      })
    ).toStrictEqual({
      model: "gpt-4o",
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
      finishReason: "stop",
      settings: { temperature: 0.7 },
      input: [{ role: "user", content: "hi\nthere" }],
      output: '{"a":1}',
      outputObject: { a: 1 },
    });
  });

  it("uses request.model + request.input as fallbacks for the canonical keys", () => {
    expect(
      t.transform(span("chat m"), {
        "gen_ai.request.model": "fb-model",
        "gen_ai.request.input": JSON.stringify([{ role: "user", content: "plain" }]),
      })
    ).toStrictEqual({
      model: "fb-model",
      input: [{ role: "user", content: "plain" }],
    });
  });

  it("extracts plain text output when there is no tool_call part", () => {
    expect(
      t.transform(span("chat m"), {
        "gen_ai.output.messages": JSON.stringify([
          { role: "assistant", parts: [{ type: "text", content: "answer" }] },
        ]),
      })
    ).toStrictEqual({ output: "answer" });
  });

  it("does not compute totalTokens unless both input and output tokens are present", () => {
    expect(t.transform(span("chat m"), { "gen_ai.usage.input_tokens": 3 })).toStrictEqual({
      inputTokens: 3,
    });
    expect(t.transform(span("chat m"), { "gen_ai.usage.output_tokens": 9 })).toStrictEqual({
      outputTokens: 9,
    });
  });

  it("ignores a non-string model and non-numeric tokens/temperature", () => {
    expect(
      t.transform(span("chat m"), {
        "gen_ai.response.model": 123,
        "gen_ai.usage.input_tokens": "10",
        "gen_ai.request.temperature": "hot",
      })
    ).toStrictEqual({});
  });

  it("ignores an empty finish_reasons array", () => {
    expect(t.transform(span("chat m"), { "gen_ai.response.finish_reasons": [] })).toStrictEqual({});
  });
});

describe("OtelGenAiTransformer.transform — message normalization", () => {
  it("passes through messages already in {role, content} form and drops text-less ones", () => {
    expect(
      t.transform(span("chat m"), {
        "gen_ai.input.messages": JSON.stringify([
          { role: "user", content: "kept" },
          { role: "assistant", parts: [{ type: "image" }] }, // no text → dropped
          { parts: [{ type: "text", content: "no role" }] }, // no role → skipped
        ]),
      })
    ).toStrictEqual({ input: [{ role: "user", content: "kept" }] });
  });

  it("yields no input for invalid JSON or an empty array", () => {
    expect(t.transform(span("chat m"), { "gen_ai.input.messages": "{bad" })).toStrictEqual({});
    expect(t.transform(span("chat m"), { "gen_ai.input.messages": "[]" })).toStrictEqual({});
  });
});

describe("OtelGenAiTransformer.transform — pydantic + agentmark fallbacks", () => {
  it("derives input from pydantic all_messages (user messages only) and final_result output", () => {
    expect(
      t.transform(span("agent run"), {
        "pydantic_ai.all_messages": JSON.stringify([
          { role: "system", parts: [{ type: "text", content: "sys" }] },
          { role: "user", parts: [{ type: "text", content: "q" }] },
        ]),
        final_result: JSON.stringify({ result: 42 }),
      })
    ).toStrictEqual({
      input: [{ role: "user", content: "q" }],
      output: '{"result":42}',
      outputObject: { result: 42 },
    });
  });

  it("uses agentmark.props for input and agentmark.output for output", () => {
    expect(
      t.transform(span("x"), {
        "agentmark.props": JSON.stringify({ foo: "bar" }),
        "agentmark.output": "the-output",
      })
    ).toStrictEqual({
      input: [{ role: "user", content: '{"foo":"bar"}' }],
      output: "the-output",
      props: '{"foo":"bar"}',
    });
  });
});

describe("OtelGenAiTransformer.transform — tool execution span", () => {
  it("builds a tool call with parsed args and result", () => {
    expect(
      t.transform(span("execute_tool"), {
        "gen_ai.tool.name": "search",
        "gen_ai.tool.call.id": "id1",
        "gen_ai.tool.call.arguments": JSON.stringify({ q: "x" }),
        "gen_ai.tool.call.result": "res",
      })
    ).toStrictEqual({
      name: "search",
      toolCalls: [
        { type: "tool-call", toolCallId: "id1", toolName: "search", args: { q: "x" }, result: "res" },
      ],
    });
  });

  it("falls back to {raw} args when the arguments are not valid JSON, and empty id when missing", () => {
    expect(
      t.transform(span("execute_tool"), {
        "gen_ai.tool.name": "search",
        "gen_ai.tool.call.arguments": "not-json",
      })
    ).toStrictEqual({
      name: "search",
      toolCalls: [{ type: "tool-call", toolCallId: "", toolName: "search", args: { raw: "not-json" } }],
    });
  });
});

it("exposes the pydantic-ai scope name", () => {
  expect(OtelGenAiTransformer.SCOPE_NAME).toBe("pydantic-ai");
});
