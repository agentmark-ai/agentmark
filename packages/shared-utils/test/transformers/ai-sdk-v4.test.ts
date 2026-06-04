import { describe, it, expect } from "vitest";
import { AiSdkV4Strategy } from "../../src/normalizer/transformers/ai-sdk/strategies/v4";

const s = new AiSdkV4Strategy();

describe("AiSdkV4Strategy.extractModel", () => {
  it("prefers gen_ai.request.model over ai.model.id", () => {
    expect(s.extractModel({ "gen_ai.request.model": "a", "ai.model.id": "b" })).toBe("a");
    expect(s.extractModel({ "ai.model.id": "b" })).toBe("b");
    expect(s.extractModel({})).toBeUndefined();
  });
});

describe("AiSdkV4Strategy.extractInput", () => {
  it("returns undefined when neither ai.prompt.messages nor ai.prompt is present", () => {
    expect(s.extractInput({})).toBeUndefined();
  });

  it("normalizes a messages array (string content kept, parts normalized)", () => {
    expect(
      s.extractInput({
        "ai.prompt.messages": [
          { role: "user", content: "hello" },
          {
            role: "assistant",
            content: [
              { type: "text", text: "hi" },
              { type: "tool-call", toolCallId: "c1", toolName: "search", args: { q: 1 } },
            ],
          },
        ],
      })
    ).toStrictEqual([
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "hi" },
          { type: "tool-call", toolCallId: "c1", toolName: "search", args: { q: 1 } },
        ],
      },
    ]);
  });

  it("parses a JSON-string ai.prompt.messages", () => {
    expect(
      s.extractInput({ "ai.prompt.messages": JSON.stringify([{ role: "user", content: "x" }]) })
    ).toStrictEqual([{ role: "user", content: "x" }]);
  });

  it("coerces ai.prompt {messages, system} by prepending the system message", () => {
    expect(
      s.extractInput({ "ai.prompt": { system: "be brief", messages: [{ role: "user", content: "x" }] } })
    ).toStrictEqual([
      { role: "system", content: "be brief" },
      { role: "user", content: "x" },
    ]);
  });

  it("coerces ai.prompt {prompt, system} (string prompt) to system+user", () => {
    expect(s.extractInput({ "ai.prompt": { system: "sys", prompt: "do it" } })).toStrictEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "do it" },
    ]);
  });

  it("coerces a bare string ai.prompt to a single user message", () => {
    expect(s.extractInput({ "ai.prompt": "just text" })).toStrictEqual([{ role: "user", content: "just text" }]);
  });

  it("normalizes tool-result parts and fills missing ids/names with defaults", () => {
    expect(
      s.extractInput({
        "ai.prompt.messages": [
          { role: "tool", content: [{ type: "tool-result", result: { ok: true } }] },
        ],
      })
    ).toStrictEqual([
      { role: "tool", content: [{ type: "tool-result", toolCallId: "", toolName: "", result: { ok: true } }] },
    ]);
  });
});

describe("AiSdkV4Strategy.extractOutput / extractOutputObject", () => {
  it("prefers ai.result.text then ai.response.text", () => {
    expect(s.extractOutput({ "ai.result.text": "r", "ai.response.text": "x" })).toBe("r");
    expect(s.extractOutput({ "ai.response.text": "x" })).toBe("x");
    expect(s.extractOutput({})).toBeUndefined();
  });

  it("parses a JSON-string object, returns objects as-is, undefined on bad JSON", () => {
    expect(s.extractOutputObject({ "ai.result.object": '{"a":1}' })).toStrictEqual({ a: 1 });
    expect(s.extractOutputObject({ "ai.response.object": { b: 2 } })).toStrictEqual({ b: 2 });
    expect(s.extractOutputObject({ "ai.result.object": "{bad" })).toBeUndefined();
    expect(s.extractOutputObject({})).toBeUndefined();
  });
});

describe("AiSdkV4Strategy.extractToolCalls", () => {
  it("maps a result.toolCalls array, normalizing args (args || input)", () => {
    expect(
      s.extractToolCalls({
        "ai.result.toolCalls": [
          { type: "tool-call", toolCallId: "c1", toolName: "t1", args: { a: 1 } },
          { toolCallId: "c2", toolName: "t2", input: { b: 2 } },
        ],
      })
    ).toStrictEqual([
      { type: "tool-call", toolCallId: "c1", toolName: "t1", args: { a: 1 } },
      { type: "tool-call", toolCallId: "c2", toolName: "t2", args: { b: 2 } },
    ]);
  });

  it("parses a JSON-string toolCalls and returns undefined on bad JSON / non-array", () => {
    expect(
      s.extractToolCalls({ "ai.result.toolCalls": JSON.stringify([{ toolCallId: "c", toolName: "t" }]) })
    ).toStrictEqual([{ type: "tool-call", toolCallId: "c", toolName: "t", args: {} }]);
    expect(s.extractToolCalls({ "ai.result.toolCalls": "{bad" })).toBeUndefined();
    expect(s.extractToolCalls({ "ai.result.toolCalls": '{"not":"array"}' })).toBeUndefined();
  });

  it("falls back to individual ai.toolCall.* (requires id AND name), parsing args + keeping result string", () => {
    expect(
      s.extractToolCalls({
        "ai.toolCall.name": "search",
        "ai.toolCall.id": "id1",
        "ai.toolCall.args": JSON.stringify({ q: "x" }),
        "ai.toolCall.result": "res",
      })
    ).toStrictEqual([{ type: "tool-call", toolCallId: "id1", toolName: "search", args: { q: "x" }, result: "res" }]);
  });

  it("stringifies a non-string tool result and empties args on bad JSON", () => {
    expect(
      s.extractToolCalls({
        "ai.toolCall.name": "search",
        "ai.toolCall.id": "id1",
        "ai.toolCall.args": "not-json",
        "ai.toolCall.result": { ok: 1 },
      })
    ).toStrictEqual([
      { type: "tool-call", toolCallId: "id1", toolName: "search", args: {}, result: '{"ok":1}' },
    ]);
  });

  it("returns undefined when the individual fallback lacks an id", () => {
    expect(s.extractToolCalls({ "ai.toolCall.name": "search" })).toBeUndefined();
    expect(s.extractToolCalls({})).toBeUndefined();
  });
});

describe("AiSdkV4Strategy.extractFinishReason", () => {
  it("prefers ai.result then ai.response then OTel array (first) / scalar", () => {
    expect(s.extractFinishReason({ "ai.result.finishReason": "stop" })).toBe("stop");
    expect(s.extractFinishReason({ "ai.response.finishReason": "length" })).toBe("length");
    expect(s.extractFinishReason({ "gen_ai.response.finish_reasons": ["a", "b"] })).toBe("a");
    expect(s.extractFinishReason({ "gen_ai.response.finish_reasons": "tool-calls" })).toBe("tool-calls");
    expect(s.extractFinishReason({})).toBeUndefined();
  });
});

describe("AiSdkV4Strategy.extractSettings", () => {
  it("reads all five settings, preferring OTel keys, coercing strings", () => {
    expect(
      s.extractSettings({
        "gen_ai.request.temperature": 0.5,
        "ai.settings.maxTokens": "100",
        "gen_ai.request.top_p": "0.9",
        "ai.settings.presencePenalty": 0.1,
        "ai.settings.frequencyPenalty": "0.2",
      })
    ).toStrictEqual({
      temperature: 0.5,
      maxTokens: 100,
      topP: 0.9,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
    });
  });

  it("prefers the OTel temperature over the ai.settings one", () => {
    expect(
      s.extractSettings({ "gen_ai.request.temperature": 0.3, "ai.settings.temperature": 0.9 })
    ).toStrictEqual({ temperature: 0.3 });
  });

  it("returns undefined when no settings present", () => {
    expect(s.extractSettings({})).toBeUndefined();
  });
});

describe("AiSdkV4Strategy.extractSettings — number vs string coercion per field", () => {
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

describe("AiSdkV4Strategy — content-part + tool-arg edge defaults", () => {
  const contentOf = (part: any) =>
    s.extractInput({ "ai.prompt.messages": [{ role: "user", content: [part] }] })![0].content;

  it("defaults missing text to '' and missing tool-call ids/name/args to defaults", () => {
    expect(contentOf({ type: "text" })).toStrictEqual([{ type: "text", text: "" }]);
    expect(contentOf({ type: "tool-call" })).toStrictEqual([
      { type: "tool-call", toolCallId: "", toolName: "", args: {} },
    ]);
  });

  it("uses an object-valued ai.toolCall.args directly in the individual fallback", () => {
    expect(
      s.extractToolCalls({ "ai.toolCall.name": "t", "ai.toolCall.id": "i", "ai.toolCall.args": { a: 1 } })
    ).toStrictEqual([{ type: "tool-call", toolCallId: "i", toolName: "t", args: { a: 1 }, result: undefined }]);
  });
});

describe("AiSdkV4Strategy.extractMetadata", () => {
  it("reads ai.telemetry.metadata.* into the metadata field", () => {
    expect(
      s.extractMetadata({ "ai.telemetry.metadata.userId": "u1", "ai.telemetry.metadata.sessionId": "s1" })
    ).toStrictEqual({ metadata: { userId: "u1", sessionId: "s1" } });
  });
  it("reads agentmark.metadata.* into the metadata field", () => {
    expect(s.extractMetadata({ "agentmark.metadata.foo": "bar" })).toStrictEqual({ metadata: { foo: "bar" } });
  });
  it("merges both prefixes (ai.telemetry precedence)", () => {
    expect(
      s.extractMetadata({ "agentmark.metadata.a": "1", "ai.telemetry.metadata.b": "2" })
    ).toStrictEqual({ metadata: { a: "1", b: "2" } });
  });
  it("omits the metadata field entirely when there is no custom metadata", () => {
    expect(s.extractMetadata({})).toStrictEqual({});
  });
});

describe("AiSdkV4Strategy.extractTokens", () => {
  it("reads legacy prompt/completion keys, computes total, defaults reasoning to 0", () => {
    expect(
      s.extractTokens({ "gen_ai.usage.prompt_tokens": 10, "gen_ai.usage.completion_tokens": 5 })
    ).toStrictEqual({ input: 10, output: 5, total: 15, reasoning: 0 });
  });

  it("falls back to ai.usage.* keys and reads reasoning from providerMetadata", () => {
    expect(
      s.extractTokens({
        "ai.usage.promptTokens": 3,
        "ai.usage.completionTokens": 4,
        "ai.response.providerMetadata": JSON.stringify({ openai: { reasoningTokens: 2 } }),
      })
    ).toStrictEqual({ input: 3, output: 4, total: 7, reasoning: 2 });
  });
});
