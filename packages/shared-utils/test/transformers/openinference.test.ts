import { describe, it, expect } from "vitest";
import { OpenInferenceTransformer } from "../../src/normalizer/transformers/openinference";
import { SpanType } from "../../src/normalizer/types";

const t = new OpenInferenceTransformer();
const span = (name: string): any => ({
  traceId: "t",
  spanId: "s",
  name,
  kind: 1,
  startTimeUnixNano: "0",
  endTimeUnixNano: "1",
});

describe("OpenInferenceTransformer.classify", () => {
  it("classifies openinference.span.kind=LLM as GENERATION (case-insensitive)", () => {
    expect(t.classify(span("x"), { "openinference.span.kind": "LLM" })).toBe(SpanType.GENERATION);
    expect(t.classify(span("x"), { "openinference.span.kind": "llm" })).toBe(SpanType.GENERATION);
  });
  it("classifies CHAIN / TOOL / RETRIEVER as SPAN", () => {
    expect(t.classify(span("x"), { "openinference.span.kind": "CHAIN" })).toBe(SpanType.SPAN);
    expect(t.classify(span("x"), { "openinference.span.kind": "TOOL" })).toBe(SpanType.SPAN);
    expect(t.classify(span("x"), { "openinference.span.kind": "RETRIEVER" })).toBe(SpanType.SPAN);
  });
  it("falls back to GENERATION when token counts are present without an LLM kind", () => {
    expect(t.classify(span("x"), { "llm.token_count.prompt": 5 })).toBe(SpanType.GENERATION);
  });
  it("defaults to SPAN", () => {
    expect(t.classify(span("x"), {})).toBe(SpanType.SPAN);
  });
});

describe("OpenInferenceTransformer.transform — LLM generation span", () => {
  it("extracts model, token counts (+reasoning), settings, input and output messages", () => {
    expect(
      t.transform(span("ChatOpenAI"), {
        "openinference.span.kind": "LLM",
        "llm.model_name": "gpt-4o",
        "llm.token_count.prompt": 12,
        "llm.token_count.completion": 8,
        "llm.token_count.total": 20,
        "llm.token_count.completion_details.reasoning": 3,
        "llm.invocation_parameters": JSON.stringify({ temperature: 0.7, max_tokens: 256, top_p: 1 }),
        "llm.input_messages.0.message.role": "system",
        "llm.input_messages.0.message.content": "You are helpful",
        "llm.input_messages.1.message.role": "user",
        "llm.input_messages.1.message.content": "What is 2+2?",
        "llm.output_messages.0.message.role": "assistant",
        "llm.output_messages.0.message.content": "4",
      })
    ).toEqual({
      model: "gpt-4o",
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
      reasoningTokens: 3,
      settings: { temperature: 0.7, maxTokens: 256, topP: 1 },
      input: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "What is 2+2?" },
      ],
      output: "4",
    });
  });

  it("computes totalTokens when only prompt+completion are present", () => {
    const out = t.transform(span("llm"), {
      "openinference.span.kind": "LLM",
      "llm.token_count.prompt": 10,
      "llm.token_count.completion": 5,
    });
    expect(out.totalTokens).toBe(15);
  });

  it("extracts tool calls from output messages into span-level toolCalls", () => {
    const out = t.transform(span("llm"), {
      "openinference.span.kind": "LLM",
      "llm.model_name": "gpt-4o",
      "llm.output_messages.0.message.role": "assistant",
      "llm.output_messages.0.message.tool_calls.0.tool_call.id": "call_1",
      "llm.output_messages.0.message.tool_calls.0.tool_call.function.name": "get_weather",
      "llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments": '{"city":"NYC"}',
    });
    expect(out.toolCalls).toEqual([
      { type: "tool-call", toolCallId: "call_1", toolName: "get_weather", args: { city: "NYC" } },
    ]);
    // No assistant text → no output string.
    expect(out.output).toBeUndefined();
  });
});

describe("OpenInferenceTransformer.transform — generic IO (CHAIN/TOOL/AGENT spans)", () => {
  it("parses JSON output.value into outputObject with mime application/json", () => {
    expect(
      t.transform(span("chain"), {
        "openinference.span.kind": "CHAIN",
        "input.value": "summarize this",
        "input.mime_type": "text/plain",
        "output.value": '{"summary":"ok"}',
        "output.mime_type": "application/json",
      })
    ).toEqual({
      input: [{ role: "user", content: "summarize this" }],
      output: '{"summary":"ok"}',
      outputObject: { summary: "ok" },
    });
  });

  it("treats a JSON messages array in input.value as messages", () => {
    const out = t.transform(span("chain"), {
      "openinference.span.kind": "CHAIN",
      "input.value": JSON.stringify([{ role: "user", content: "hi" }]),
      "input.mime_type": "application/json",
    });
    expect(out.input).toEqual([{ role: "user", content: "hi" }]);
  });

  it("names tool-execution spans after the tool", () => {
    const out = t.transform(span("tool"), {
      "openinference.span.kind": "TOOL",
      "tool.name": "search_web",
      "input.value": '{"q":"x"}',
      "input.mime_type": "application/json",
    });
    expect(out.name).toBe("search_web");
  });
});

describe("OpenInferenceTransformer.transform — retrieval & context", () => {
  it("surfaces retriever document contents as output", () => {
    const out = t.transform(span("retriever"), {
      "openinference.span.kind": "RETRIEVER",
      "retrieval.documents.0.document.content": "doc one",
      "retrieval.documents.1.document.content": "doc two",
    });
    expect(out.output).toBe("doc one\n\ndoc two");
  });

  it("extracts session id, user id and a metadata blob", () => {
    const out = t.transform(span("llm"), {
      "openinference.span.kind": "LLM",
      "session.id": "sess-1",
      "user.id": "user-9",
      metadata: JSON.stringify({ env: "prod", team: "core" }),
    });
    expect(out.sessionId).toBe("sess-1");
    expect(out.userId).toBe("user-9");
    expect(out.metadata).toEqual({ env: "prod", team: "core" });
  });
});
