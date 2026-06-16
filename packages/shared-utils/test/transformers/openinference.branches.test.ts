import { describe, it, expect } from "vitest";
import { OpenInferenceTransformer } from "../../src/normalizer/transformers/openinference";
import { SpanType } from "../../src/normalizer/types";

const t = new OpenInferenceTransformer();
const span = (name = "s"): any => ({
  traceId: "t",
  spanId: "s",
  name,
  kind: 1,
  startTimeUnixNano: "0",
  endTimeUnixNano: "1",
});

describe("OpenInferenceTransformer.transform — empty & per-field isolation", () => {
  it("returns {} when no recognized attributes are present", () => {
    expect(t.transform(span(), {})).toStrictEqual({});
  });

  it("sets model only for a non-empty string", () => {
    expect(t.transform(span(), { "llm.model_name": "gpt-4o" })).toStrictEqual({ model: "gpt-4o" });
    expect(t.transform(span(), { "llm.model_name": "" })).toStrictEqual({});
    expect(t.transform(span(), { "llm.model_name": 123 })).toStrictEqual({});
  });
});

describe("OpenInferenceTransformer.transform — tokens", () => {
  it("extracts prompt/completion/total independently", () => {
    expect(t.transform(span(), { "llm.token_count.prompt": 7 })).toStrictEqual({ inputTokens: 7 });
    expect(t.transform(span(), { "llm.token_count.completion": 3 })).toStrictEqual({ outputTokens: 3 });
    expect(t.transform(span(), { "llm.token_count.total": 10 })).toStrictEqual({ totalTokens: 10 });
  });

  it("prefers an explicit total over the computed sum", () => {
    expect(
      t.transform(span(), {
        "llm.token_count.prompt": 7,
        "llm.token_count.completion": 3,
        "llm.token_count.total": 999,
      })
    ).toStrictEqual({ inputTokens: 7, outputTokens: 3, totalTokens: 999 });
  });

  it("computes total from prompt+completion only when total is absent", () => {
    expect(
      t.transform(span(), { "llm.token_count.prompt": 7, "llm.token_count.completion": 3 })
    ).toStrictEqual({ inputTokens: 7, outputTokens: 3, totalTokens: 10 });
  });

  it("does not compute a total when only one side is present", () => {
    expect(t.transform(span(), { "llm.token_count.prompt": 7 })).toStrictEqual({ inputTokens: 7 });
  });

  it("parses string-encoded token counts and ignores non-numeric strings", () => {
    expect(t.transform(span(), { "llm.token_count.prompt": "5" })).toStrictEqual({ inputTokens: 5 });
    expect(t.transform(span(), { "llm.token_count.prompt": "abc" })).toStrictEqual({});
  });

  it("extracts reasoning tokens", () => {
    expect(t.transform(span(), { "llm.token_count.completion_details.reasoning": 4 })).toStrictEqual({
      reasoningTokens: 4,
    });
  });
});

describe("OpenInferenceTransformer.transform — settings from invocation_parameters", () => {
  it("maps each parameter and supports max_tokens / maxTokens / max_completion_tokens aliases", () => {
    expect(
      t.transform(span(), {
        "llm.invocation_parameters": JSON.stringify({
          temperature: 0.3,
          max_tokens: 100,
          top_p: 0.9,
          presence_penalty: 0.1,
          frequency_penalty: 0.2,
        }),
      })
    ).toStrictEqual({ settings: { temperature: 0.3, maxTokens: 100, topP: 0.9, presencePenalty: 0.1, frequencyPenalty: 0.2 } });

    expect(
      t.transform(span(), { "llm.invocation_parameters": JSON.stringify({ maxTokens: 50 }) })
    ).toStrictEqual({ settings: { maxTokens: 50 } });
    expect(
      t.transform(span(), { "llm.invocation_parameters": JSON.stringify({ max_completion_tokens: 60 }) })
    ).toStrictEqual({ settings: { maxTokens: 60 } });
  });

  it("accepts an object-typed invocation_parameters value", () => {
    expect(t.transform(span(), { "llm.invocation_parameters": { temperature: 1 } })).toStrictEqual({
      settings: { temperature: 1 },
    });
  });

  it("emits no settings for invalid JSON, non-object, or empty params", () => {
    expect(t.transform(span(), { "llm.invocation_parameters": "{bad" })).toStrictEqual({});
    expect(t.transform(span(), { "llm.invocation_parameters": 5 })).toStrictEqual({});
    expect(t.transform(span(), { "llm.invocation_parameters": JSON.stringify({}) })).toStrictEqual({});
    expect(t.transform(span(), { "llm.invocation_parameters": JSON.stringify({ other: 1 }) })).toStrictEqual({});
  });
});

describe("OpenInferenceTransformer.transform — structured messages take priority over generic IO", () => {
  it("uses input/output messages and ignores input.value/output.value when messages exist", () => {
    expect(
      t.transform(span(), {
        "llm.input_messages.0.message.role": "user",
        "llm.input_messages.0.message.content": "structured",
        "input.value": "should be ignored",
        "input.mime_type": "text/plain",
        "llm.output_messages.0.message.role": "assistant",
        "llm.output_messages.0.message.content": "answer",
        "output.value": "ignored too",
        "output.mime_type": "text/plain",
      })
    ).toStrictEqual({
      input: [{ role: "user", content: "structured" }],
      output: "answer",
    });
  });

  it("emits no output string when output messages carry only tool calls", () => {
    expect(
      t.transform(span(), {
        "llm.output_messages.0.message.role": "assistant",
        "llm.output_messages.0.message.tool_calls.0.tool_call.id": "c1",
        "llm.output_messages.0.message.tool_calls.0.tool_call.function.name": "fn",
        "llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments": "{}",
      })
    ).toStrictEqual({
      toolCalls: [{ type: "tool-call", toolCallId: "c1", toolName: "fn", args: {} }],
    });
  });
});

describe("OpenInferenceTransformer.transform — generic input.value / output.value", () => {
  it("treats a JSON messages array as messages", () => {
    expect(
      t.transform(span(), {
        "input.value": JSON.stringify([{ role: "user", content: "hi" }]),
        "input.mime_type": "application/json",
      })
    ).toStrictEqual({ input: [{ role: "user", content: "hi" }] });
  });

  it("wraps a non-array JSON object as a single user message", () => {
    expect(
      t.transform(span(), {
        "input.value": JSON.stringify({ query: "x" }),
        "input.mime_type": "application/json",
      })
    ).toStrictEqual({ input: [{ role: "user", content: '{"query":"x"}' }] });
  });

  it("wraps a JSON array of non-role objects as a single user message", () => {
    expect(
      t.transform(span(), {
        "input.value": JSON.stringify([{ notRole: 1 }]),
        "input.mime_type": "application/json",
      })
    ).toStrictEqual({ input: [{ role: "user", content: '[{"notRole":1}]' }] });
  });

  it("falls back to a raw-string user message for invalid JSON despite a json mime", () => {
    expect(
      t.transform(span(), { "input.value": "{bad", "input.mime_type": "application/json" })
    ).toStrictEqual({ input: [{ role: "user", content: "{bad" }] });
  });

  it("treats text/plain (and missing mime) input.value as a user message", () => {
    expect(t.transform(span(), { "input.value": "plain", "input.mime_type": "text/plain" })).toStrictEqual({
      input: [{ role: "user", content: "plain" }],
    });
    expect(t.transform(span(), { "input.value": "no mime" })).toStrictEqual({
      input: [{ role: "user", content: "no mime" }],
    });
  });

  it("parses JSON output.value into output + outputObject", () => {
    expect(
      t.transform(span(), { "output.value": '{"r":1}', "output.mime_type": "application/json" })
    ).toStrictEqual({ output: '{"r":1}', outputObject: { r: 1 } });
  });

  it("keeps invalid-JSON and text output.value as a plain output string", () => {
    expect(
      t.transform(span(), { "output.value": "{bad", "output.mime_type": "application/json" })
    ).toStrictEqual({ output: "{bad" });
    expect(t.transform(span(), { "output.value": "done" })).toStrictEqual({ output: "done" });
  });
});

describe("OpenInferenceTransformer.transform — retrieval, tool name, context", () => {
  it("surfaces retriever documents as structured outputObject + joined text, skipping empty/non-string content", () => {
    expect(
      t.transform(span(), {
        "retrieval.documents.0.document.content": "d0",
        "retrieval.documents.1.document.content": "",
        "retrieval.documents.2.document.content": 7,
        "retrieval.documents.3.document.content": "d3",
      })
    ).toStrictEqual({
      output: "d0\n\nd3",
      // index 1 (empty) and 2 (non-string) contribute no content; index 1 has
      // no other field so it is dropped, index 2 likewise.
      outputObject: { documents: [{ content: "d0" }, { content: "d3" }] },
    });
  });

  it("adds structured documents without overwriting an existing text output", () => {
    expect(
      t.transform(span(), {
        "output.value": "real output",
        "retrieval.documents.0.document.content": "doc",
      })
    ).toStrictEqual({
      output: "real output",
      outputObject: { documents: [{ content: "doc" }] },
    });
  });

  it("keeps an id-only document (e.g. Pinecone with no inline content) in outputObject, with no text output", () => {
    expect(t.transform(span(), { "retrieval.documents.0.document.id": "only-id" })).toStrictEqual({
      outputObject: { documents: [{ id: "only-id" }] },
    });
  });

  it("renames the span to the tool name only for a non-empty string", () => {
    expect(t.transform(span(), { "tool.name": "search_web" })).toStrictEqual({ name: "search_web" });
    expect(t.transform(span(), { "tool.name": "" })).toStrictEqual({});
  });

  it("extracts session id and user id when present", () => {
    expect(t.transform(span(), { "session.id": "s1" })).toStrictEqual({ sessionId: "s1" });
    expect(t.transform(span(), { "user.id": "u1" })).toStrictEqual({ userId: "u1" });
  });
});

describe("OpenInferenceTransformer.transform — metadata blob", () => {
  it("parses a JSON metadata object, stringifying non-string values", () => {
    expect(
      t.transform(span(), { metadata: JSON.stringify({ a: "x", b: 2, c: { nested: true } }) })
    ).toStrictEqual({ metadata: { a: "x", b: "2", c: '{"nested":true}' } });
  });

  it("accepts an object-typed metadata value", () => {
    expect(t.transform(span(), { metadata: { only: "this" } })).toStrictEqual({ metadata: { only: "this" } });
  });

  it("emits no metadata for invalid JSON, arrays, an empty object, or a primitive", () => {
    expect(t.transform(span(), { metadata: "{bad" })).toStrictEqual({});
    expect(t.transform(span(), { metadata: JSON.stringify([1, 2]) })).toStrictEqual({});
    expect(t.transform(span(), { metadata: JSON.stringify({}) })).toStrictEqual({});
    expect(t.transform(span(), { metadata: 5 })).toStrictEqual({});
  });
});

describe("OpenInferenceTransformer.classify — token fallback operands", () => {
  it("classifies a completion-token-only span (no prompt tokens) as GENERATION", () => {
    expect(t.classify(span(), { "llm.token_count.completion": 5 } as any)).toBe(SpanType.GENERATION);
  });
});

describe("OpenInferenceTransformer.transform — mime-guard operand isolation", () => {
  it("does NOT parse a JSON messages-array input.value when the mime is text/plain", () => {
    // mime !== application/json so the `&&` is false → raw text, not messages.
    const raw = JSON.stringify([{ role: "user", content: "hi" }]);
    expect(t.transform(span(), { "input.value": raw, "input.mime_type": "text/plain" })).toStrictEqual({
      input: [{ role: "user", content: raw }],
    });
  });

  it("falls back to String() for a non-string input.value even under a json mime", () => {
    // typeof value !== 'string' so the `&&` is false → String() fallback.
    expect(
      t.transform(span(), { "input.value": { a: 1 }, "input.mime_type": "application/json" })
    ).toStrictEqual({ input: [{ role: "user", content: "[object Object]" }] });
  });

  it("does NOT parse output.value when the mime is text/plain (stays plain text)", () => {
    expect(
      t.transform(span(), { "output.value": '{"a":1}', "output.mime_type": "text/plain" })
    ).toStrictEqual({ output: '{"a":1}' });
  });

  it("falls back to String() for a non-string output.value even under a json mime", () => {
    expect(
      t.transform(span(), { "output.value": { a: 1 }, "output.mime_type": "application/json" })
    ).toStrictEqual({ output: "[object Object]" });
  });

  it("treats a mixed array (not every element has a role) as a wrapped single message", () => {
    // Distinguishes `.every` from `.some`: one element has role, one doesn't.
    const raw = JSON.stringify([{ role: "user", content: "hi" }, { notRole: 1 }]);
    expect(
      t.transform(span(), { "input.value": raw, "input.mime_type": "application/json" })
    ).toStrictEqual({ input: [{ role: "user", content: raw }] });
  });
});
