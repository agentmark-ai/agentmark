import { describe, it, expect } from "vitest";
import { OpenLLMetryTransformer } from "../../src/normalizer/transformers/openllmetry";
import { SpanType } from "../../src/normalizer/types";

const t = new OpenLLMetryTransformer();
const span = (name: string, events?: any[]): any => ({
  traceId: "t",
  spanId: "s",
  name,
  kind: 1,
  startTimeUnixNano: "0",
  endTimeUnixNano: "1",
  events,
});

describe("OpenLLMetryTransformer.classify", () => {
  it("classifies traceloop.span.kind=LLM as GENERATION", () => {
    expect(t.classify(span("x"), { "traceloop.span.kind": "LLM" })).toBe(SpanType.GENERATION);
  });
  it("classifies WORKFLOW / TASK as SPAN", () => {
    expect(t.classify(span("x"), { "traceloop.span.kind": "WORKFLOW" })).toBe(SpanType.SPAN);
    expect(t.classify(span("x"), { "traceloop.span.kind": "TASK" })).toBe(SpanType.SPAN);
  });
  it("falls back to GENERATION on prompt-token usage", () => {
    expect(t.classify(span("x"), { "gen_ai.usage.prompt_tokens": 9 })).toBe(SpanType.GENERATION);
  });
  it("defaults to SPAN", () => {
    expect(t.classify(span("x"), {})).toBe(SpanType.SPAN);
  });
});

describe("OpenLLMetryTransformer.transform — LLM span (indexed gen_ai.prompt/completion)", () => {
  it("extracts model, tokens via legacy keys, settings, finish reason, IO", () => {
    expect(
      t.transform(span("openai.chat"), {
        "traceloop.span.kind": "LLM",
        "gen_ai.request.model": "gpt-4o-mini",
        "gen_ai.response.model": "gpt-4o-mini-2024",
        "gen_ai.usage.prompt_tokens": 15,
        "gen_ai.usage.completion_tokens": 6,
        "gen_ai.request.temperature": 0.5,
        "gen_ai.request.max_tokens": 128,
        "gen_ai.response.finish_reason": "stop",
        "gen_ai.prompt.0.role": "user",
        "gen_ai.prompt.0.content": "ping",
        "gen_ai.completion.0.role": "assistant",
        "gen_ai.completion.0.content": "pong",
      })
    ).toEqual({
      model: "gpt-4o-mini-2024",
      inputTokens: 15,
      outputTokens: 6,
      totalTokens: 21,
      settings: { temperature: 0.5, maxTokens: 128 },
      finishReason: "stop",
      input: [{ role: "user", content: "ping" }],
      output: "pong",
    });
  });

  it("uses llm.usage.total_tokens as a total fallback when no per-side counts give it", () => {
    const out = t.transform(span("llm"), {
      "traceloop.span.kind": "LLM",
      "gen_ai.usage.prompt_tokens": 4,
      "llm.usage.total_tokens": 11,
    });
    // prompt present, completion absent → no computed total → alt fallback wins.
    expect(out.totalTokens).toBe(11);
  });

  it("extracts tool calls from gen_ai.completion into span-level toolCalls", () => {
    const out = t.transform(span("llm"), {
      "traceloop.span.kind": "LLM",
      "gen_ai.completion.0.role": "assistant",
      "gen_ai.completion.0.tool_calls.0.id": "c1",
      "gen_ai.completion.0.tool_calls.0.name": "search",
      "gen_ai.completion.0.tool_calls.0.arguments": '{"q":"weather"}',
    });
    expect(out.toolCalls).toEqual([
      { type: "tool-call", toolCallId: "c1", toolName: "search", args: { q: "weather" } },
    ]);
  });
});

describe("OpenLLMetryTransformer.transform — workflow/task entity IO", () => {
  it("surfaces traceloop.entity.input/output, parsing JSON object output into outputObject", () => {
    expect(
      t.transform(span("my_workflow.workflow"), {
        "traceloop.span.kind": "WORKFLOW",
        "traceloop.entity.name": "my_workflow",
        "traceloop.entity.input": '{"args":["hello"]}',
        "traceloop.entity.output": '{"result":"done"}',
      })
    ).toEqual({
      traceName: "my_workflow",
      input: [{ role: "user", content: '{"args":["hello"]}' }],
      output: '{"result":"done"}',
      outputObject: { result: "done" },
    });
  });

  it("keeps non-JSON entity output as plain text", () => {
    const out = t.transform(span("task"), {
      "traceloop.span.kind": "TASK",
      "traceloop.entity.output": "just text",
    });
    expect(out.output).toBe("just text");
    expect(out.outputObject).toBeUndefined();
  });
});

describe("OpenLLMetryTransformer.transform — association & events", () => {
  it("maps association properties to session/user and the rest to metadata", () => {
    const out = t.transform(span("llm"), {
      "traceloop.span.kind": "LLM",
      "traceloop.association.properties.session_id": "sess-7",
      "traceloop.association.properties.user_id": "u-3",
      "traceloop.association.properties.tier": "pro",
    });
    expect(out.sessionId).toBe("sess-7");
    expect(out.userId).toBe("u-3");
    expect(out.metadata).toEqual({ tier: "pro" });
  });

  it("falls back to span events for prompt/completion content (OpenLIT shape)", () => {
    const out = t.transform(
      span("llm", [
        { timeUnixNano: "0", name: "gen_ai.content.prompt", attributes: { "gen_ai.prompt": "hi from event" } },
        {
          timeUnixNano: "1",
          name: "gen_ai.content.completion",
          attributes: { "gen_ai.completion": "bye from event" },
        },
      ]),
      { "traceloop.span.kind": "LLM" }
    );
    expect(out.input).toEqual([{ role: "user", content: "hi from event" }]);
    expect(out.output).toBe("bye from event");
  });
});
