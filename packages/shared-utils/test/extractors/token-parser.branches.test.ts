import { describe, it, expect } from "vitest";
import {
  parseTokens,
  extractReasoningFromProviderMetadata,
} from "../../src/normalizer/extractors/token-parser";

// Branch-precise tests targeting parseTokens guard/precedence logic and the
// previously-untested extractReasoningFromProviderMetadata. toStrictEqual is
// used deliberately so a guard mutated to always-enter (which assigns an
// `undefined` key) is distinguishable from the key being absent.

describe("parseTokens — value coercion branches", () => {
  it("floors a JSON-encoded negative decimal via Math.floor, not parseInt", () => {
    // parseInt("-3.7") === -3, but Math.floor(-3.7) === -4. Pins the
    // `typeof parsed === 'number'` JSON branch to the floor path.
    expect(parseTokens({ in: "-3.7" }, { inputKey: "in" })).toStrictEqual({
      inputTokens: -4,
    });
  });

  it("reads intValue out of a JSON object string", () => {
    expect(parseTokens({ in: '{"intValue":7}' }, { inputKey: "in" })).toStrictEqual({
      inputTokens: 7,
    });
  });

  it("ignores a JSON object string that has no numeric intValue", () => {
    // parsed is a truthy object but parsed.intValue is not a number, so the
    // intValue branch must NOT be taken (taking it would yield Math.floor(undefined)=NaN).
    expect(parseTokens({ in: '{"x":1}' }, { inputKey: "in" })).toStrictEqual({
      inputTokens: undefined,
    });
  });

  it("short-circuits on JSON null without throwing (parsed && intValue guard)", () => {
    // A present-but-unparseable value sets the key to undefined; the `parsed &&`
    // guard must short-circuit on null rather than dereferencing null.intValue
    // (the `&&`→`||` mutant throws here and is killed).
    expect(parseTokens({ in: "null" }, { inputKey: "in" })).toStrictEqual({
      inputTokens: undefined,
    });
  });
});

describe("parseTokens — key guards require the attribute to be present", () => {
  it("does not set inputTokens when promptKey is declared but absent from attributes", () => {
    expect(parseTokens({}, { promptKey: "prompt" })).toStrictEqual({});
  });

  it("does not set outputTokens when completionKey is declared but absent", () => {
    expect(parseTokens({}, { completionKey: "completion" })).toStrictEqual({});
  });

  it("does not set totalTokens when totalKey is declared but absent", () => {
    expect(parseTokens({}, { totalKey: "total" })).toStrictEqual({});
  });

  it("does not set reasoningTokens when reasoningKey is declared but absent", () => {
    expect(parseTokens({}, { reasoningKey: "reasoning" })).toStrictEqual({});
  });

  it("prefers inputKey over promptKey only when inputKey's attribute is present", () => {
    expect(
      parseTokens({ in: 10, prompt: 99 }, { inputKey: "in", promptKey: "prompt" })
    ).toStrictEqual({ inputTokens: 10 });
    // inputKey declared but missing → falls back to promptKey.
    expect(
      parseTokens({ prompt: 99 }, { inputKey: "in", promptKey: "prompt" })
    ).toStrictEqual({ inputTokens: 99 });
  });
});

describe("extractReasoningFromProviderMetadata", () => {
  const KEY = "ai.response.providerMetadata";

  it("returns undefined when providerMetadata is absent", () => {
    expect(extractReasoningFromProviderMetadata({})).toBeUndefined();
  });

  it("reads openai.reasoningTokens from a JSON string", () => {
    expect(
      extractReasoningFromProviderMetadata({
        [KEY]: JSON.stringify({ openai: { reasoningTokens: 42 } }),
      })
    ).toBe(42);
  });

  it("reads openai.reasoningTokens from an already-parsed object", () => {
    expect(
      extractReasoningFromProviderMetadata({
        [KEY]: { openai: { reasoningTokens: 7 } },
      })
    ).toBe(7);
  });

  it("returns undefined when openai key is missing", () => {
    expect(
      extractReasoningFromProviderMetadata({ [KEY]: { anthropic: { reasoningTokens: 9 } } })
    ).toBeUndefined();
  });

  it("returns undefined when reasoningTokens is non-numeric", () => {
    expect(
      extractReasoningFromProviderMetadata({ [KEY]: { openai: { reasoningTokens: "12" } } })
    ).toBeUndefined();
  });

  it("returns undefined for an invalid JSON string", () => {
    expect(extractReasoningFromProviderMetadata({ [KEY]: "{not json" })).toBeUndefined();
  });

  it("distinguishes 0 reasoning tokens from missing", () => {
    expect(
      extractReasoningFromProviderMetadata({ [KEY]: { openai: { reasoningTokens: 0 } } })
    ).toBe(0);
  });
});
