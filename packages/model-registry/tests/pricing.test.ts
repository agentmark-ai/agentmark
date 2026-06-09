import {
  buildPricingDictionary,
  candidateModelIds,
  costForTokens,
  resolveModelKey,
  resolveModelPrice,
} from "../src/pricing";

describe("buildPricingDictionary", () => {
  it("converts per-token prices to per-1K and drops unpriced models", () => {
    const dict = buildPricingDictionary({
      "gpt-4o": {
        pricing: { inputCostPerToken: 0.0000025, outputCostPerToken: 0.00001 },
      },
      "dall-e-3": {}, // per-image pricing → no pricing block
    });

    expect(dict).toEqual({
      "gpt-4o": { promptPrice: 0.0025, completionPrice: 0.01 },
    });
  });
});

describe("costForTokens", () => {
  it("computes USD cost from per-1K prices", () => {
    // (2.5 * 1000 + 10 * 500) / 1000 = 7.5
    expect(
      costForTokens({ promptPrice: 2.5, completionPrice: 10 }, 1000, 500)
    ).toBe(7.5);
  });

  it("returns 0 for zero tokens", () => {
    expect(
      costForTokens({ promptPrice: 2.5, completionPrice: 10 }, 0, 0)
    ).toBe(0);
  });
});

describe("candidateModelIds", () => {
  it("puts the raw (trimmed) id first", () => {
    expect(candidateModelIds("  gpt-4o ")[0]).toBe("gpt-4o");
  });

  it("strips provider path prefixes", () => {
    expect(candidateModelIds("openai/gpt-4o")).toContain("gpt-4o");
    expect(candidateModelIds("models/gemini-2.5-pro")).toContain(
      "gemini-2.5-pro"
    );
    expect(
      candidateModelIds("accounts/fireworks/models/llama-v3p1-70b-instruct")
    ).toContain("llama-v3p1-70b-instruct");
  });

  it("extracts fine-tune base ids in both ft-prefixed and bare forms", () => {
    const candidates = candidateModelIds("ft:gpt-4o-2024-08-06:acme::abc123");
    // Registry carries ft:* entries (fine-tune token rates differ from base).
    const ftIndex = candidates.indexOf("ft:gpt-4o-2024-08-06");
    const baseIndex = candidates.indexOf("gpt-4o-2024-08-06");
    expect(ftIndex).toBeGreaterThan(-1);
    expect(baseIndex).toBeGreaterThan(ftIndex);
    expect(candidates).toContain("gpt-4o");
  });

  it("strips Bedrock cross-region prefixes", () => {
    expect(
      candidateModelIds("us.anthropic.claude-3-5-sonnet-20241022-v2:0")
    ).toContain("anthropic.claude-3-5-sonnet-20241022-v2:0");
  });

  it("strips version-pin suffixes", () => {
    expect(candidateModelIds("gpt-4o-2024-08-06")).toContain("gpt-4o");
    expect(candidateModelIds("claude-3-5-sonnet-20241022")).toContain(
      "claude-3-5-sonnet"
    );
    expect(candidateModelIds("claude-3-5-sonnet-v2@20241022")).toContain(
      "claude-3-5-sonnet-v2"
    );
    expect(candidateModelIds("gemini-1.5-pro@001")).toContain("gemini-1.5-pro");
    expect(candidateModelIds("grok-2-latest")).toContain("grok-2");
  });

  it("composes normalizations (prefix + date)", () => {
    expect(candidateModelIds("openai/gpt-4o-2024-08-06")).toContain("gpt-4o");
  });

  it("deduplicates and ignores empty input", () => {
    expect(candidateModelIds("gpt-4o")).toEqual(["gpt-4o"]);
    expect(candidateModelIds("")).toEqual([]);
    expect(candidateModelIds("   ")).toEqual([]);
  });
});

describe("resolveModelKey / resolveModelPrice", () => {
  const priceMap = {
    "gpt-4o": { promptPrice: 2.5, completionPrice: 10 },
    "gpt-4o-mini": { promptPrice: 0.15, completionPrice: 0.6 },
    "ft:gpt-4o-2024-08-06": { promptPrice: 3.75, completionPrice: 15 },
    "anthropic.claude-3-5-sonnet-20241022-v2:0": {
      promptPrice: 3,
      completionPrice: 15,
    },
    "gemini-2.5-pro": { promptPrice: 1.25, completionPrice: 10 },
  };

  it("resolves exact matches to themselves", () => {
    expect(resolveModelKey("gpt-4o", priceMap)).toBe("gpt-4o");
    expect(resolveModelPrice("gpt-4o", priceMap)).toEqual({
      promptPrice: 2.5,
      completionPrice: 10,
    });
  });

  it("resolves provider-prefixed ids", () => {
    expect(resolveModelKey("openai/gpt-4o", priceMap)).toBe("gpt-4o");
    expect(resolveModelKey("models/gemini-2.5-pro", priceMap)).toBe(
      "gemini-2.5-pro"
    );
  });

  it("resolves full OpenAI fine-tune ids to the registry ft entry", () => {
    expect(
      resolveModelKey("ft:gpt-4o-2024-08-06:acme::abc123", priceMap)
    ).toBe("ft:gpt-4o-2024-08-06");
  });

  it("resolves Bedrock cross-region inference profiles", () => {
    expect(
      resolveModelKey("us.anthropic.claude-3-5-sonnet-20241022-v2:0", priceMap)
    ).toBe("anthropic.claude-3-5-sonnet-20241022-v2:0");
  });

  it("resolves unknown dated variants to the base model (prefix fallback)", () => {
    // A model released after the last registry sync should price against its
    // base family, not $0.
    expect(resolveModelKey("gpt-4o-2099-01-01", priceMap)).toBe("gpt-4o");
  });

  it("prefers the longest base-model prefix", () => {
    // Must hit gpt-4o-mini, never the shorter gpt-4o.
    expect(resolveModelKey("gpt-4o-mini-2099-01-01", priceMap)).toBe(
      "gpt-4o-mini"
    );
  });

  it("only prefix-matches at separator boundaries", () => {
    // 'gpt-4o' is a prefix of the string but not at a boundary char.
    expect(resolveModelKey("gpt-4oXL", priceMap)).toBeUndefined();
  });

  it("matches case-insensitively", () => {
    expect(resolveModelKey("GPT-4o", priceMap)).toBe("gpt-4o");
  });

  it("returns undefined for unrelated models and empty ids", () => {
    expect(resolveModelKey("totally-unknown-model", priceMap)).toBeUndefined();
    expect(resolveModelPrice("totally-unknown-model", priceMap)).toBeUndefined();
    expect(resolveModelKey("", priceMap)).toBeUndefined();
  });

  it("does not leak Object.prototype properties as matches", () => {
    expect(resolveModelKey("constructor", priceMap)).toBeUndefined();
    expect(resolveModelPrice("toString", priceMap)).toBeUndefined();
  });

  it("memoizes misses per map without poisoning other maps", () => {
    const mapA = { "gpt-4o": { promptPrice: 1, completionPrice: 2 } };
    const mapB = { "gpt-4o-2099-01-01": { promptPrice: 5, completionPrice: 6 } };
    // Same id resolves differently against each map (fallback vs exact).
    expect(resolveModelKey("gpt-4o-2099-01-01", mapA)).toBe("gpt-4o");
    expect(resolveModelKey("gpt-4o-2099-01-01", mapB)).toBe(
      "gpt-4o-2099-01-01"
    );
    // Repeat (cached) lookups return the same answers.
    expect(resolveModelKey("gpt-4o-2099-01-01", mapA)).toBe("gpt-4o");
    expect(resolveModelKey("gpt-4o-2099-01-01", mapB)).toBe(
      "gpt-4o-2099-01-01"
    );
  });
});
