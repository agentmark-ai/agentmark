import { describe, it, expect } from "vitest";
import { MastraTransformer } from "../../src/normalizer/transformers/mastra";
import { SpanType } from "../../src/normalizer/types";

const t = new MastraTransformer();
const span = (name: string): any => ({
  traceId: "t",
  spanId: "s",
  name,
  kind: 1,
  startTimeUnixNano: "0",
  endTimeUnixNano: "1",
});

describe("MastraTransformer.classify", () => {
  it("classifies agent generation spans as GENERATION", () => {
    for (const n of ["agent.streamLegacy", "agent.stream", "agent.streamObject", "agent.generate", "agent.generateObject"]) {
      expect(t.classify(span(n), {})).toBe(SpanType.GENERATION);
    }
  });
  it("classifies other spans as SPAN", () => {
    expect(t.classify(span("agent.resolveModelConfig"), {})).toBe(SpanType.SPAN);
    expect(t.classify(span("whatever"), {})).toBe(SpanType.SPAN);
  });
});

describe("MastraTransformer.transform", () => {
  it("extracts model+settings, input, text output, tokens, and trace name", () => {
    expect(
      t.transform(span("agent.stream"), {
        "agent.resolveModelConfig.result": JSON.stringify({ modelId: "gpt-4o", config: { provider: "openai" }, settings: { temperature: 0.5 } }),
        "agent.stream.argument.0": JSON.stringify([{ role: "user", content: "hi" }]),
        "agent.stream.result": JSON.stringify({ usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, text: "answer" }),
        "agentmark.trace_name": "my-trace",
      })
    ).toStrictEqual({
      model: "gpt-4o",
      input: [{ role: "user", content: "hi" }],
      output: "answer",
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      traceName: "my-trace",
      settings: { temperature: 0.5 },
    });
  });

  it("prefers result.object (stringified output + outputObject)", () => {
    expect(
      t.transform(span("agent.streamObject"), { "agent.streamObject.result": JSON.stringify({ object: { a: 1 } }) })
    ).toStrictEqual({ output: '{"a":1}', outputObject: { a: 1 } });
  });

  it("handles a nested object response (output stringified + outputObject) vs string response", () => {
    expect(t.transform(span("agent.stream"), { "agent.stream.result": JSON.stringify({ response: { r: 1 } }) })).toStrictEqual({
      output: '{"r":1}',
      outputObject: { r: 1 },
    });
    expect(t.transform(span("agent.stream"), { "agent.stream.result": JSON.stringify({ response: "txt" }) })).toStrictEqual({
      output: "txt",
    });
  });

  it("accepts an already-parsed (object) result attribute", () => {
    expect(
      t.transform(span("agent.stream"), { "agent.stream.result": { text: "plain" } as any })
    ).toStrictEqual({ output: "plain" });
  });

  it("falls back to componentName for the trace name", () => {
    expect(t.transform(span("x"), { componentName: "comp" })).toStrictEqual({ traceName: "comp" });
  });

  it("ignores a model config without a modelId, and bad-JSON results", () => {
    expect(t.transform(span("agent.stream"), { "agent.resolveModelConfig.result": JSON.stringify({ config: {} }) })).toStrictEqual({});
    expect(t.transform(span("agent.stream"), { "agent.stream.result": "{bad" })).toStrictEqual({});
  });

  it("returns an empty object when nothing is present", () => {
    expect(t.transform(span("x"), {})).toStrictEqual({});
  });

  it("reads input messages from a span-name-scoped argument.0", () => {
    expect(
      t.transform(span("agent.generate"), { "agent.generate.argument.0": JSON.stringify([{ role: "system", content: "s" }]) })
    ).toStrictEqual({ input: [{ role: "system", content: "s" }] });
  });
});
