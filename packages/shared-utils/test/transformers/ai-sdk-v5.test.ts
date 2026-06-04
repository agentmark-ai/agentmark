import { describe, it, expect } from "vitest";
import { AiSdkV5Strategy } from "../../src/normalizer/transformers/ai-sdk/strategies/v5";

const s = new AiSdkV5Strategy();

describe("AiSdkV5Strategy.extractModel", () => {
  it("prefers gen_ai.request.model over ai.model.id", () => {
    expect(s.extractModel({ "gen_ai.request.model": "a", "ai.model.id": "b" })).toBe("a");
    expect(s.extractModel({ "ai.model.id": "b" })).toBe("b");
    expect(s.extractModel({})).toBeUndefined();
  });
});

describe("AiSdkV5Strategy.extractInput — content normalization (v5)", () => {
  it("normalizes a tool-call part using `input` -> `args`", () => {
    expect(
      s.extractInput({
        "ai.prompt.messages": [
          { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "t", input: { q: 1 } }] },
        ],
      })
    ).toStrictEqual([
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "t", args: { q: 1 } }] },
    ]);
  });

  it("extracts tool-result from the v5 output.value wrapper, with fallbacks", () => {
    const call = (part: any) =>
      s.extractInput({ "ai.prompt.messages": [{ role: "tool", content: [part] }] })![0].content;
    expect(call({ type: "tool-result", toolCallId: "c", toolName: "t", output: { type: "json", value: { ok: 1 } } })).toStrictEqual([
      { type: "tool-result", toolCallId: "c", toolName: "t", result: { ok: 1 } },
    ]);
    // output object without a `value` key → use the whole output object
    expect(call({ type: "tool-result", output: { other: 2 } })).toStrictEqual([
      { type: "tool-result", toolCallId: "", toolName: "", result: { other: 2 } },
    ]);
    // scalar output → used directly
    expect(call({ type: "tool-result", output: "scalar" })).toStrictEqual([
      { type: "tool-result", toolCallId: "", toolName: "", result: "scalar" },
    ]);
    // no output → fall back to result
    expect(call({ type: "tool-result", result: "legacy" })).toStrictEqual([
      { type: "tool-result", toolCallId: "", toolName: "", result: "legacy" },
    ]);
  });

  it("coerces {prompt, system} and bare strings like v4", () => {
    expect(s.extractInput({ "ai.prompt": { system: "sys", prompt: "go" } })).toStrictEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "go" },
    ]);
    expect(s.extractInput({ "ai.prompt": "hi" })).toStrictEqual([{ role: "user", content: "hi" }]);
    expect(s.extractInput({})).toBeUndefined();
  });
});

describe("AiSdkV5Strategy.extractOutput / extractOutputObject (ai.response.* only)", () => {
  it("reads ai.response.text only", () => {
    expect(s.extractOutput({ "ai.response.text": "x" })).toBe("x");
    expect(s.extractOutput({ "ai.result.text": "r" })).toBeUndefined();
  });
  it("parses ai.response.object string, returns object as-is, undefined on bad JSON", () => {
    expect(s.extractOutputObject({ "ai.response.object": '{"a":1}' })).toStrictEqual({ a: 1 });
    expect(s.extractOutputObject({ "ai.response.object": { b: 2 } })).toStrictEqual({ b: 2 });
    expect(s.extractOutputObject({ "ai.response.object": "{bad" })).toBeUndefined();
    expect(s.extractOutputObject({})).toBeUndefined();
  });
});

describe("AiSdkV5Strategy.extractToolCalls (ai.response.toolCalls, input->args)", () => {
  it("maps response.toolCalls, normalizing input->args and carrying providerMetadata", () => {
    expect(
      s.extractToolCalls({
        "ai.response.toolCalls": [
          { type: "tool-call", toolCallId: "c1", toolName: "t1", input: { a: 1 }, providerOptions: { p: 1 } },
        ],
      })
    ).toStrictEqual([
      { type: "tool-call", toolCallId: "c1", toolName: "t1", args: { a: 1 }, providerMetadata: { p: 1 } },
    ]);
  });

  it("returns undefined on bad JSON / non-array", () => {
    expect(s.extractToolCalls({ "ai.response.toolCalls": "{bad" })).toBeUndefined();
    expect(s.extractToolCalls({ "ai.response.toolCalls": '{"x":1}' })).toBeUndefined();
  });

  it("falls back to individual ai.toolCall.* requiring id AND name", () => {
    expect(
      s.extractToolCalls({
        "ai.toolCall.name": "search",
        "ai.toolCall.id": "id1",
        "ai.toolCall.args": JSON.stringify({ q: "x" }),
        "ai.toolCall.result": { ok: 1 },
      })
    ).toStrictEqual([
      { type: "tool-call", toolCallId: "id1", toolName: "search", args: { q: "x" }, result: '{"ok":1}' },
    ]);
    expect(s.extractToolCalls({ "ai.toolCall.name": "search" })).toBeUndefined();
    expect(s.extractToolCalls({})).toBeUndefined();
  });
});

describe("AiSdkV5Strategy.extractFinishReason / extractSettings", () => {
  it("reads ai.response.finishReason then OTel array/scalar (no ai.result)", () => {
    expect(s.extractFinishReason({ "ai.response.finishReason": "stop" })).toBe("stop");
    expect(s.extractFinishReason({ "ai.result.finishReason": "ignored" })).toBeUndefined();
    expect(s.extractFinishReason({ "gen_ai.response.finish_reasons": ["a", "b"] })).toBe("a");
    expect(s.extractFinishReason({ "gen_ai.response.finish_reasons": "x" })).toBe("x");
  });
  it("extracts settings with OTel precedence + string coercion", () => {
    expect(
      s.extractSettings({ "gen_ai.request.temperature": 0.2, "ai.settings.maxTokens": "64", "gen_ai.request.top_p": "0.8" })
    ).toStrictEqual({ temperature: 0.2, maxTokens: 64, topP: 0.8 });
    expect(s.extractSettings({})).toBeUndefined();
  });
});

describe("AiSdkV5Strategy.extractSettings — number vs string coercion per field", () => {
  const cases: Array<[string, string, "float" | "int"]> = [
    ["gen_ai.request.temperature", "temperature", "float"],
    ["gen_ai.request.max_tokens", "maxTokens", "int"],
    ["gen_ai.request.top_p", "topP", "float"],
    ["gen_ai.request.presence_penalty", "presencePenalty", "float"],
    ["gen_ai.request.frequency_penalty", "frequencyPenalty", "float"],
  ];
  for (const [key, field, kind] of cases) {
    it(`${field}: numeric value used directly`, () => {
      expect(s.extractSettings({ [key]: 2 })).toStrictEqual({ [field]: 2 });
    });
    it(`${field}: string value coerced via ${kind}`, () => {
      const expected = kind === "int" ? 7 : 1.5;
      expect(s.extractSettings({ [key]: kind === "int" ? "7" : "1.5" })).toStrictEqual({ [field]: expected });
    });
  }
});

describe("AiSdkV5Strategy — content-part + tool-arg edge defaults", () => {
  const contentOf = (part: any) =>
    s.extractInput({ "ai.prompt.messages": [{ role: "user", content: [part] }] })![0].content;

  it("defaults missing text to '' and missing tool-call ids/name to defaults (input->args)", () => {
    expect(contentOf({ type: "text" })).toStrictEqual([{ type: "text", text: "" }]);
    expect(contentOf({ type: "tool-call" })).toStrictEqual([
      { type: "tool-call", toolCallId: "", toolName: "", args: {} },
    ]);
  });

  it("tool-result with neither output nor result yields undefined result", () => {
    expect(contentOf({ type: "tool-result", toolCallId: "c", toolName: "t" })).toStrictEqual([
      { type: "tool-result", toolCallId: "c", toolName: "t", result: undefined },
    ]);
  });

  it("uses an object-valued ai.toolCall.args directly in the individual fallback", () => {
    expect(
      s.extractToolCalls({ "ai.toolCall.name": "t", "ai.toolCall.id": "i", "ai.toolCall.args": { a: 1 } })
    ).toStrictEqual([{ type: "tool-call", toolCallId: "i", toolName: "t", args: { a: 1 }, result: undefined }]);
  });
});

describe("AiSdkV5Strategy.extractMetadata", () => {
  it("reads ai.telemetry.metadata.* and agentmark.metadata.* into metadata", () => {
    expect(
      s.extractMetadata({ "ai.telemetry.metadata.userId": "u1" })
    ).toStrictEqual({ metadata: { userId: "u1" } });
    expect(s.extractMetadata({ "agentmark.metadata.foo": "bar" })).toStrictEqual({ metadata: { foo: "bar" } });
  });
  it("merges both prefixes and omits metadata when empty", () => {
    expect(
      s.extractMetadata({ "agentmark.metadata.a": "1", "ai.telemetry.metadata.b": "2" })
    ).toStrictEqual({ metadata: { a: "1", b: "2" } });
    expect(s.extractMetadata({})).toStrictEqual({});
  });
});

describe("AiSdkV5Strategy.extractTokens (v5 keys + reasoning)", () => {
  it("reads OTel input/output keys, computes total, defaults reasoning to 0", () => {
    expect(
      s.extractTokens({ "gen_ai.usage.input_tokens": 8, "gen_ai.usage.output_tokens": 2 })
    ).toStrictEqual({ input: 8, output: 2, total: 10, reasoning: 0 });
  });
  it("reads ai.usage.reasoningTokens directly (preserving 0)", () => {
    expect(
      s.extractTokens({
        "gen_ai.usage.input_tokens": 1,
        "gen_ai.usage.output_tokens": 1,
        "ai.usage.reasoningTokens": 5,
      })
    ).toStrictEqual({ input: 1, output: 1, total: 2, reasoning: 5 });
  });
  it("falls back to providerMetadata reasoning when the key is absent", () => {
    expect(
      s.extractTokens({
        "gen_ai.usage.input_tokens": 1,
        "gen_ai.usage.output_tokens": 1,
        "ai.response.providerMetadata": JSON.stringify({ openai: { reasoningTokens: 3 } }),
      })
    ).toStrictEqual({ input: 1, output: 1, total: 2, reasoning: 3 });
  });
});
