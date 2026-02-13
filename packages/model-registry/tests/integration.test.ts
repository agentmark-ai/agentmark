import { ModelRegistryImpl } from "../src/registry";
import type { ModelsFile } from "../src/types";

/**
 * Integration test verifying consumer consistency:
 * - Every model in getProviderModels() has corresponding pricing (for models with pricing)
 * - All providers in getProviderModels() appear in getProviders()
 */
const testModelsFile: ModelsFile = {
  version: "1.0.0",
  generatedAt: "2026-01-01T00:00:00Z",
  sources: {},
  models: {
    "gpt-4o": {
      provider: "openai",
      displayName: "GPT-4o",
      mode: "chat",
      pricing: { inputCostPerToken: 0.000005, outputCostPerToken: 0.000015 },
      capabilities: { vision: true },
      source: "litellm",
    },
    "gpt-4o-mini": {
      provider: "openai",
      displayName: "GPT-4o Mini",
      mode: "chat",
      pricing: { inputCostPerToken: 0.000001, outputCostPerToken: 0.000004 },
      source: "litellm",
    },
    "dall-e-3": {
      provider: "openai",
      displayName: "DALL-E 3",
      mode: "image_generation",
      source: "litellm",
    },
    "claude-3-opus-20240229": {
      provider: "anthropic",
      displayName: "Claude 3 Opus",
      mode: "chat",
      pricing: { inputCostPerToken: 0.000015, outputCostPerToken: 0.000075 },
      source: "litellm",
    },
    "ollama-model": {
      provider: "ollama",
      displayName: "Ollama Model",
      mode: "chat",
      source: "override",
    },
  },
};

describe("consumer consistency integration test", () => {
  let registry: ModelRegistryImpl;

  beforeEach(() => {
    registry = new ModelRegistryImpl(testModelsFile);
  });

  it("every model with pricing in getProviderModels() has a pricing dictionary entry", () => {
    const providerModels = registry.getProviderModels();
    const pricingDict = registry.getPricingDictionary();

    for (const [_provider, group] of Object.entries(providerModels)) {
      const allModelIds = [
        ...group.languageModels,
        ...group.imageModels,
        ...group.speechModels,
      ];

      for (const modelId of allModelIds) {
        const model = registry.getModel(modelId);
        if (model?.pricing) {
          expect(pricingDict[modelId]).toBeDefined();
          expect(pricingDict[modelId]!.promptPrice).toEqual(expect.any(Number));
          expect(pricingDict[modelId]!.completionPrice).toEqual(
            expect.any(Number)
          );
        }
      }
    }
  });

  it("all providers in getProviderModels() appear in getProviders()", () => {
    const providerModels = registry.getProviderModels();
    const providers = registry.getProviders();
    const providerIds = new Set(providers.map((p) => p.id));

    for (const providerId of Object.keys(providerModels)) {
      expect(providerIds.has(providerId)).toBe(true);
    }
  });

  it("all models in getAllModels() appear in exactly one provider group", () => {
    const allModels = registry.getAllModels();
    const providerModels = registry.getProviderModels();

    for (const model of allModels) {
      const group = providerModels[model.provider];
      expect(group).toBeDefined();

      const allIds = [
        ...group!.languageModels,
        ...group!.imageModels,
        ...group!.speechModels,
      ];
      expect(allIds).toContain(model.id);
    }
  });
});
