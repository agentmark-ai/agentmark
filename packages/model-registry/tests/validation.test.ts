import { modelsFileSchema, overridesFileSchema } from "../src/validation";

const validModelsFile = {
  version: "1.0.0",
  generatedAt: "2026-01-01T00:00:00Z",
  sources: {
    litellm: { fetchedAt: "2026-01-01T00:00:01Z", modelCount: 100 },
  },
  models: {
    "gpt-4o": {
      provider: "openai",
      displayName: "GPT-4o",
      mode: "chat" as const,
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
      },
      deprecationDate: null,
      source: "litellm",
    },
  },
};

describe("modelsFileSchema", () => {
  it("accepts a valid models file", () => {
    const result = modelsFileSchema.safeParse(validModelsFile);
    expect(result.success).toBe(true);
  });

  it("accepts models file with empty models", () => {
    const result = modelsFileSchema.safeParse({
      version: "1.0.0",
      generatedAt: "2026-01-01T00:00:00Z",
      sources: {},
      models: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required field: version", () => {
    const { version: _v, ...rest } = validModelsFile;
    const result = modelsFileSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing required field: generatedAt", () => {
    const { generatedAt: _g, ...rest } = validModelsFile;
    const result = modelsFileSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects model with missing provider", () => {
    const file = {
      ...validModelsFile,
      models: {
        "gpt-4o": {
          displayName: "GPT-4o",
          mode: "chat",
        },
      },
    };
    const result = modelsFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("rejects model with missing displayName", () => {
    const file = {
      ...validModelsFile,
      models: {
        "gpt-4o": {
          provider: "openai",
          mode: "chat",
        },
      },
    };
    const result = modelsFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("rejects model with invalid mode enum", () => {
    const file = {
      ...validModelsFile,
      models: {
        "gpt-4o": {
          provider: "openai",
          displayName: "GPT-4o",
          mode: "invalid_mode",
        },
      },
    };
    const result = modelsFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("rejects pricing with only inputCostPerToken (missing outputCostPerToken)", () => {
    const file = {
      ...validModelsFile,
      models: {
        "gpt-4o": {
          provider: "openai",
          displayName: "GPT-4o",
          mode: "chat",
          pricing: {
            inputCostPerToken: 0.000005,
          },
        },
      },
    };
    const result = modelsFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("rejects negative context values", () => {
    const file = {
      ...validModelsFile,
      models: {
        "gpt-4o": {
          provider: "openai",
          displayName: "GPT-4o",
          mode: "chat",
          context: {
            maxInputTokens: -1,
          },
        },
      },
    };
    const result = modelsFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("rejects maxOutputTokens > maxInputTokens", () => {
    const file = {
      ...validModelsFile,
      models: {
        "gpt-4o": {
          provider: "openai",
          displayName: "GPT-4o",
          mode: "chat",
          context: {
            maxInputTokens: 4096,
            maxOutputTokens: 128000,
          },
        },
      },
    };
    const result = modelsFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("accepts maxOutputTokens equal to maxInputTokens", () => {
    const file = {
      ...validModelsFile,
      models: {
        "gpt-4o": {
          provider: "openai",
          displayName: "GPT-4o",
          mode: "chat",
          context: {
            maxInputTokens: 4096,
            maxOutputTokens: 4096,
          },
        },
      },
    };
    const result = modelsFileSchema.safeParse(file);
    expect(result.success).toBe(true);
  });

  it("rejects invalid deprecationDate format", () => {
    const file = {
      ...validModelsFile,
      models: {
        "gpt-4o": {
          provider: "openai",
          displayName: "GPT-4o",
          mode: "chat",
          deprecationDate: "not-a-date",
        },
      },
    };
    const result = modelsFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("accepts valid ISO date as deprecationDate", () => {
    const file = {
      ...validModelsFile,
      models: {
        "gpt-4o": {
          provider: "openai",
          displayName: "GPT-4o",
          mode: "chat",
          deprecationDate: "2026-06-01",
        },
      },
    };
    const result = modelsFileSchema.safeParse(file);
    expect(result.success).toBe(true);
  });

  it("rejects non-boolean capability values", () => {
    const file = {
      ...validModelsFile,
      models: {
        "gpt-4o": {
          provider: "openai",
          displayName: "GPT-4o",
          mode: "chat",
          capabilities: {
            vision: "yes" as unknown as boolean,
          },
        },
      },
    };
    const result = modelsFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });
});

describe("overridesFileSchema", () => {
  it("accepts a valid overrides file", () => {
    const result = overridesFileSchema.safeParse({
      models: {
        "my-model": {
          provider: "ollama",
          displayName: "My Model",
          mode: "chat",
          source: "override",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty overrides file", () => {
    const result = overridesFileSchema.safeParse({ models: {} });
    expect(result.success).toBe(true);
  });

  it("accepts partial model entries in overrides", () => {
    const result = overridesFileSchema.safeParse({
      models: {
        "gpt-4o": {
          pricing: {
            inputCostPerToken: 0.000003,
            outputCostPerToken: 0.000012,
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });
});
