import { ModelRegistryImpl } from "../src/registry";
import type { ModelsFile } from "../src/types";
import providerLabels from "../provider-labels.json";

const testModelsFile: ModelsFile = {
  version: "1.0.0",
  generatedAt: "2026-01-01T00:00:00Z",
  sources: {},
  models: {
    "gpt-4o": {
      provider: "openai",
      displayName: "GPT-4o",
      mode: "chat",
      pricing: {
        inputCostPerToken: 0.000005,
        outputCostPerToken: 0.000015,
      },
      capabilities: {
        vision: true,
      },
      source: "litellm",
    },
    "claude-3-opus-20240229": {
      provider: "anthropic",
      displayName: "Claude 3 Opus",
      mode: "chat",
      pricing: {
        inputCostPerToken: 0.000015,
        outputCostPerToken: 0.000075,
      },
      source: "litellm",
    },
    "dall-e-3": {
      provider: "openai",
      displayName: "DALL-E 3",
      mode: "image_generation",
      source: "litellm",
    },
    "tts-1": {
      provider: "openai",
      displayName: "TTS-1",
      mode: "audio_speech",
      source: "litellm",
    },
    "text-embedding-3-small": {
      provider: "openai",
      displayName: "Text Embedding 3 Small",
      mode: "embedding",
      pricing: {
        inputCostPerToken: 0.00000002,
        outputCostPerToken: 0,
      },
      source: "litellm",
    },
    "no-pricing-model": {
      provider: "ollama",
      displayName: "No Pricing Model",
      mode: "chat",
      source: "override",
    },
  },
};

describe("getPricingDictionary", () => {
  let registry: ModelRegistryImpl;

  beforeEach(() => {
    registry = new ModelRegistryImpl(testModelsFile, undefined, providerLabels);
  });

  it("converts per-token to per-1K-token format", () => {
    const dict = registry.getPricingDictionary();
    expect(dict["gpt-4o"]!.promptPrice).toBeCloseTo(0.005, 10);
    expect(dict["gpt-4o"]!.completionPrice).toBeCloseTo(0.015, 10);
  });

  it("includes models with pricing", () => {
    const dict = registry.getPricingDictionary();
    expect(dict["claude-3-opus-20240229"]).toBeDefined();
    expect(dict["claude-3-opus-20240229"]!.promptPrice).toBeCloseTo(0.015, 10);
    expect(dict["claude-3-opus-20240229"]!.completionPrice).toBeCloseTo(0.075, 10);
  });

  it("excludes models without pricing", () => {
    const dict = registry.getPricingDictionary();
    expect(dict["dall-e-3"]).toBeUndefined();
    expect(dict["no-pricing-model"]).toBeUndefined();
  });

  it("handles zero pricing correctly", () => {
    const dict = registry.getPricingDictionary();
    expect(dict["text-embedding-3-small"]!.completionPrice).toBe(0);
  });
});

describe("getProviderModels", () => {
  let registry: ModelRegistryImpl;

  beforeEach(() => {
    registry = new ModelRegistryImpl(testModelsFile, undefined, providerLabels);
  });

  it("groups models by provider", () => {
    const providers = registry.getProviderModels();
    expect(Object.keys(providers)).toContain("openai");
    expect(Object.keys(providers)).toContain("anthropic");
    expect(Object.keys(providers)).toContain("ollama");
  });

  it("uses human-readable provider labels", () => {
    const providers = registry.getProviderModels();
    expect(providers["openai"]!.label).toBe("OpenAI");
    expect(providers["anthropic"]!.label).toBe("Anthropic");
  });

  it("maps chat mode to languageModels", () => {
    const providers = registry.getProviderModels();
    expect(providers["openai"]!.languageModels).toContain("gpt-4o");
    expect(providers["anthropic"]!.languageModels).toContain(
      "claude-3-opus-20240229"
    );
  });

  it("maps image_generation to imageModels", () => {
    const providers = registry.getProviderModels();
    expect(providers["openai"]!.imageModels).toContain("dall-e-3");
  });

  it("maps audio_speech to speechModels", () => {
    const providers = registry.getProviderModels();
    expect(providers["openai"]!.speechModels).toContain("tts-1");
  });

  it("maps embedding to languageModels", () => {
    const providers = registry.getProviderModels();
    expect(providers["openai"]!.languageModels).toContain(
      "text-embedding-3-small"
    );
  });
});
