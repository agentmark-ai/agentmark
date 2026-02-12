import { ModelRegistryImpl } from "../src/registry";
import type { ModelsFile, OverridesFile } from "../src/types";
import providerLabels from "../provider-labels.json";

const testModelsFile: ModelsFile = {
  version: "1.0.0",
  generatedAt: "2026-01-01T00:00:00Z",
  sources: {
    litellm: { fetchedAt: "2026-01-01T00:00:01Z", modelCount: 3 },
  },
  models: {
    "gpt-4o": {
      provider: "openai",
      displayName: "GPT-4o",
      mode: "chat",
      pricing: {
        inputCostPerToken: 0.000005,
        outputCostPerToken: 0.000015,
      },
      context: {
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
      },
      capabilities: {
        vision: true,
        functionCalling: true,
        structuredOutput: true,
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
      context: {
        maxInputTokens: 200000,
        maxOutputTokens: 4096,
      },
      capabilities: {
        vision: true,
        functionCalling: true,
      },
      source: "litellm",
    },
    "dall-e-3": {
      provider: "openai",
      displayName: "DALL-E 3",
      mode: "image_generation",
      source: "litellm",
    },
    "deprecated-model": {
      provider: "openai",
      displayName: "Deprecated Model",
      mode: "chat",
      deprecationDate: "2025-01-01",
      source: "litellm",
    },
  },
};

describe("ModelRegistryImpl", () => {
  let registry: ModelRegistryImpl;

  beforeEach(() => {
    registry = new ModelRegistryImpl(testModelsFile, undefined, providerLabels);
  });

  describe("getAllModels", () => {
    it("returns all models", () => {
      const models = registry.getAllModels();
      expect(models).toHaveLength(4);
    });

    it("includes id field in each entry", () => {
      const models = registry.getAllModels();
      const gpt4o = models.find((m) => m.id === "gpt-4o");
      expect(gpt4o).toBeDefined();
      expect(gpt4o!.id).toBe("gpt-4o");
      expect(gpt4o!.provider).toBe("openai");
    });
  });

  describe("getModel", () => {
    it("returns correct entry for known model", () => {
      const model = registry.getModel("gpt-4o");
      expect(model).toBeDefined();
      expect(model!.displayName).toBe("GPT-4o");
      expect(model!.mode).toBe("chat");
    });

    it("returns undefined for unknown model", () => {
      const model = registry.getModel("nonexistent");
      expect(model).toBeUndefined();
    });
  });

  describe("getModelsByProvider", () => {
    it("filters correctly by provider", () => {
      const openaiModels = registry.getModelsByProvider("openai");
      expect(openaiModels).toHaveLength(3);
      expect(openaiModels.every((m) => m.provider === "openai")).toBe(true);
    });

    it("returns empty array for unknown provider", () => {
      const models = registry.getModelsByProvider("nonexistent");
      expect(models).toHaveLength(0);
    });
  });

  describe("getProviders", () => {
    it("returns unique providers with counts", () => {
      const providers = registry.getProviders();
      expect(providers).toHaveLength(2);

      const openai = providers.find((p) => p.id === "openai");
      expect(openai).toBeDefined();
      expect(openai!.label).toBe("OpenAI");
      expect(openai!.modelCount).toBe(3);

      const anthropic = providers.find((p) => p.id === "anthropic");
      expect(anthropic).toBeDefined();
      expect(anthropic!.label).toBe("Anthropic");
      expect(anthropic!.modelCount).toBe(1);
    });
  });

  describe("getPricingForModel", () => {
    it("returns pricing for model with pricing", () => {
      const pricing = registry.getPricingForModel("gpt-4o");
      expect(pricing).toBeDefined();
      expect(pricing!.inputCostPerToken).toBe(0.000005);
      expect(pricing!.outputCostPerToken).toBe(0.000015);
    });

    it("returns undefined for model without pricing", () => {
      const pricing = registry.getPricingForModel("dall-e-3");
      expect(pricing).toBeUndefined();
    });
  });

  describe("getCapabilitiesForModel", () => {
    it("returns capabilities for model", () => {
      const caps = registry.getCapabilitiesForModel("gpt-4o");
      expect(caps).toBeDefined();
      expect(caps!.vision).toBe(true);
      expect(caps!.functionCalling).toBe(true);
    });
  });

  describe("findModelsByCapability", () => {
    it("filters by boolean capability flag", () => {
      const visionModels = registry.findModelsByCapability("vision");
      expect(visionModels).toHaveLength(2);
      expect(visionModels.map((m) => m.id).sort()).toEqual([
        "claude-3-opus-20240229",
        "gpt-4o",
      ]);
    });

    it("filters by structuredOutput", () => {
      const models = registry.findModelsByCapability("structuredOutput");
      expect(models).toHaveLength(1);
      expect(models[0]!.id).toBe("gpt-4o");
    });
  });

  describe("findDeprecatedModels", () => {
    it("returns only deprecated entries", () => {
      const deprecated = registry.findDeprecatedModels();
      expect(deprecated).toHaveLength(1);
      expect(deprecated[0]!.id).toBe("deprecated-model");
    });
  });

  describe("overrides merge", () => {
    it("override fields win over base model fields", () => {
      const overrides: OverridesFile = {
        models: {
          "gpt-4o": {
            displayName: "GPT-4o (Custom)",
            pricing: {
              inputCostPerToken: 0.000001,
              outputCostPerToken: 0.000002,
            },
          },
        },
      };

      const reg = new ModelRegistryImpl(testModelsFile, overrides);
      const model = reg.getModel("gpt-4o");

      expect(model!.displayName).toBe("GPT-4o (Custom)");
      expect(model!.pricing!.inputCostPerToken).toBe(0.000001);
      // Non-overridden fields preserved
      expect(model!.provider).toBe("openai");
      expect(model!.mode).toBe("chat");
    });

    it("overrides can add new models", () => {
      const overrides: OverridesFile = {
        models: {
          "my-custom-model": {
            provider: "ollama",
            displayName: "My Custom",
            mode: "chat",
            source: "override",
          },
        },
      };

      const reg = new ModelRegistryImpl(testModelsFile, overrides);
      const model = reg.getModel("my-custom-model");
      expect(model).toBeDefined();
      expect(model!.provider).toBe("ollama");
    });

    it("override new model without required fields is skipped", () => {
      const overrides: OverridesFile = {
        models: {
          "incomplete-model": {
            displayName: "Incomplete",
          },
        },
      };

      const reg = new ModelRegistryImpl(testModelsFile, overrides);
      const model = reg.getModel("incomplete-model");
      expect(model).toBeUndefined();
    });
  });
});
