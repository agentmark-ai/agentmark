import { describe, it, expect } from "vitest";
import { detectVersion } from "../../src/normalizer/transformers/ai-sdk/version-detector";
import { extractReasoningFromProviderMetadata } from "../../src/normalizer/transformers/ai-sdk/token-helpers";

describe("detectVersion", () => {
  it("detects v5 from any ai.response.* attribute", () => {
    expect(detectVersion({ "ai.response.text": "x" })).toBe("v5");
    expect(detectVersion({ "ai.response.toolCalls": [] })).toBe("v5");
    expect(detectVersion({ "ai.response.object": {} })).toBe("v5");
  });

  it("detects v4 from ai.result.* attributes", () => {
    expect(detectVersion({ "ai.result.text": "x" })).toBe("v4");
    expect(detectVersion({ "ai.result.toolCalls": [] })).toBe("v4");
    expect(detectVersion({ "ai.result.object": {} })).toBe("v4");
  });

  it("detects v4 from ai.prompt attributes when no result/response present", () => {
    expect(detectVersion({ "ai.prompt.messages": [] })).toBe("v4");
    expect(detectVersion({ "ai.prompt": "hi" })).toBe("v4");
  });

  it("v5 response attributes win over v4 result attributes", () => {
    expect(detectVersion({ "ai.response.text": "x", "ai.result.text": "y" })).toBe("v5");
  });

  it("treats a null-valued attribute as absent (not that version)", () => {
    expect(detectVersion({ "ai.response.text": null })).toBe("unknown");
    expect(detectVersion({ "ai.result.text": null, "ai.response.object": null })).toBe("unknown");
  });

  it("returns unknown for generic/no AI SDK attributes", () => {
    expect(detectVersion({})).toBe("unknown");
    expect(detectVersion({ "gen_ai.request.model": "gpt-4o" })).toBe("unknown");
  });
});

describe("token-helpers.extractReasoningFromProviderMetadata", () => {
  const KEY = "ai.response.providerMetadata";
  it("returns undefined when providerMetadata is absent", () => {
    expect(extractReasoningFromProviderMetadata({})).toBeUndefined();
  });
  it("reads openai.reasoningTokens from a JSON string and from an object", () => {
    expect(extractReasoningFromProviderMetadata({ [KEY]: JSON.stringify({ openai: { reasoningTokens: 9 } }) })).toBe(9);
    expect(extractReasoningFromProviderMetadata({ [KEY]: { openai: { reasoningTokens: 4 } } })).toBe(4);
  });
  it("returns undefined for non-numeric reasoningTokens, missing openai, or bad JSON", () => {
    expect(extractReasoningFromProviderMetadata({ [KEY]: { openai: { reasoningTokens: "3" } } })).toBeUndefined();
    expect(extractReasoningFromProviderMetadata({ [KEY]: { anthropic: {} } })).toBeUndefined();
    expect(extractReasoningFromProviderMetadata({ [KEY]: "{bad" })).toBeUndefined();
  });
  it("distinguishes 0 reasoning tokens from missing", () => {
    expect(extractReasoningFromProviderMetadata({ [KEY]: { openai: { reasoningTokens: 0 } } })).toBe(0);
  });
});
