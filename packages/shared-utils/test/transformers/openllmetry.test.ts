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

describe("OpenLLMetryTransformer.transform — vector-store result events", () => {
  it("maps Pinecone-shape db.query.result events (id + score + metadata) to structured documents", () => {
    const out = t.transform(
      span("pinecone.query", [
        {
          timeUnixNano: "0",
          name: "db.query.result",
          attributes: {
            "db.query.result.id": "vec-1",
            "db.query.result.score": 0.93,
            "db.query.result.metadata": JSON.stringify({ title: "Intro" }),
          },
        },
        {
          timeUnixNano: "1",
          name: "db.query.result",
          attributes: { "db.query.result.id": "vec-2", "db.query.result.score": "0.71" },
        },
      ]),
      { "db.system": "Pinecone", "db.operation": "query" }
    );
    expect(out.outputObject).toEqual({
      documents: [
        { id: "vec-1", score: 0.93, metadata: { title: "Intro" } },
        { id: "vec-2", score: 0.71 },
      ],
    });
    // No document content emitted by Pinecone → no joined text output.
    expect(out.output).toBeUndefined();
  });

  it("maps Chroma-shape events (distance + document) and joins content for search", () => {
    const out = t.transform(
      span("chroma.query", [
        {
          timeUnixNano: "0",
          name: "db.query.result",
          attributes: {
            "db.query.result.id": "c-1",
            "db.query.result.distance": 0.12,
            "db.query.result.document": "first chunk",
          },
        },
        {
          timeUnixNano: "1",
          name: "db.query.result",
          attributes: {
            "db.query.result.id": "c-2",
            "db.query.result.distance": 0.34,
            "db.query.result.document": "second chunk",
          },
        },
      ]),
      { "db.system": "chroma" }
    );
    expect(out.outputObject).toEqual({
      documents: [
        { id: "c-1", distance: 0.12, content: "first chunk" },
        { id: "c-2", distance: 0.34, content: "second chunk" },
      ],
    });
    expect(out.output).toBe("first chunk\n\nsecond chunk");
  });

  it("recognizes events NAMED db.search.result (not only db.query.result)", () => {
    const out = t.transform(
      span("vector.search", [
        {
          timeUnixNano: "0",
          name: "db.search.result",
          attributes: {
            "db.search.result.id": "w1",
            "db.search.result.distance": 0.05,
            "db.search.result.document": "alpha",
          },
        },
      ]),
      { "db.system": "weaviate" }
    );
    expect(out.outputObject).toEqual({ documents: [{ id: "w1", distance: 0.05, content: "alpha" }] });
    expect(out.output).toBe("alpha");
  });

  it("maps real Milvus-shape events (db.search.result.{id,distance,entity}) — recovers entity into metadata", () => {
    // Exact wire shape observed live from opentelemetry-instrumentation-milvus:
    // event name is db.query.result but attrs use the db.search.result.* prefix,
    // and the matched row is a Python-repr dict string under `entity`.
    const out = t.transform(
      span("milvus.search", [
        {
          timeUnixNano: "0",
          name: "db.query.result",
          attributes: {
            "db.search.result.id": "m1",
            "db.search.result.distance": 0.02,
            "db.search.result.entity": "{'src': 'z', 'text': 'gamma doc'}",
          },
        },
        {
          timeUnixNano: "1",
          name: "db.query.result",
          attributes: {
            "db.search.result.id": "m2",
            "db.search.result.distance": 0.15,
            // a JSON-shaped entity parses into an object
            "db.search.result.entity": JSON.stringify({ src: "y", text: "beta doc" }),
          },
        },
      ]),
      { "db.system": "milvus" }
    );
    expect(out.outputObject).toEqual({
      documents: [
        { id: "m1", distance: 0.02, metadata: { entity: "{'src': 'z', 'text': 'gamma doc'}" } },
        { id: "m2", distance: 0.15, metadata: { src: "y", text: "beta doc" } },
      ],
    });
  });

  it("ignores non-result events and produces no documents when none match", () => {
    const out = t.transform(
      span("chroma.add", [
        { timeUnixNano: "0", name: "some.other.event", attributes: { foo: "bar" } },
      ]),
      { "db.system": "chroma" }
    );
    expect(out.outputObject).toBeUndefined();
  });
});
