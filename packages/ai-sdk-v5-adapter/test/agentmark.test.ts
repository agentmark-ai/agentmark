import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import path from "path";
import { FileLoader } from "@agentmark-ai/loader-file";
import { createAgentMarkClient, VercelAIModelRegistry } from "../src";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

type TestPromptTypes = {
  "math.prompt.mdx": {
    input: { userMessage: string };
    output: { answer: string };
  };
  "image.prompt.mdx": {
    input: { userMessage: string };
    output: never;
  };
  "text.prompt.mdx": {
    input: { userMessage: string };
    output: never;
  };
};

describe("AgentMark Integration", () => {
  // Build pre-compiled fixtures before tests run
  beforeAll(async () => {
    await setupFixtures();
  });

  // Clean up generated fixtures after tests
  afterAll(() => {
    cleanupFixtures();
  });

  describe("AIAdapter Integration", () => {
    it("should adapt object prompts for Vercel AI SDK", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      const mockModelFn = vi.fn().mockImplementation((modelName) => ({
        name: modelName,
        generate: vi.fn(),
      }));
      const modelRegistry = new VercelAIModelRegistry();
      modelRegistry.registerModels("test-model", mockModelFn);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
      const result = await mathPrompt.format({
        props: {
          userMessage: "What is the sum of 5 and 3?",
        },
      });

      expect(mockModelFn).toHaveBeenCalledWith(
        "test-model",
        expect.any(Object)
      );

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].role).toBe("system");
      expect(result.messages[0].content).toBe("You are a helpful math tutor.");
      expect(result.messages[1].role).toBe("user");
      expect(result.messages[1].content).toBe("What is the sum of 5 and 3?");
      expect(result.model).toBeDefined();
      expect(result.schema).toBeDefined();
    });

    it("should adapt text prompts for Vercel AI SDK", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const mockModelFn = vi.fn().mockImplementation((modelName) => ({
        name: modelName,
        generate: vi.fn(),
      }));

      const modelRegistry = new VercelAIModelRegistry();
      modelRegistry.registerModels("test-model", mockModelFn);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      const mathPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
      const result = await mathPrompt.format({
        props: {
          userMessage: "What is the sum of 5 and 3?",
        },
      });

      expect(mockModelFn).toHaveBeenCalledWith(
        "test-model",
        expect.any(Object)
      );

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(3);

      expect(result.model).toEqual({
        name: "test-model",
        generate: expect.any(Function),
      });
    });

    it("should handle custom runtime config in Vercel adapter", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const mockModelFn = vi.fn().mockImplementation((modelName, config) => {
        return {
          name: modelName,
          apiKey: config.apiKey,
          generate: vi.fn(),
        };
      });

      const modelRegistry = new VercelAIModelRegistry();
      modelRegistry.registerModels("test-model", mockModelFn);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry
      });

      const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
      const runtimeConfig = {
        apiKey: "test-api-key",
      };
      const result = await mathPrompt.format({
        props: {
          userMessage: "What is 2+2?",
        },
        ...runtimeConfig,
      });

      expect(mockModelFn).toHaveBeenCalledWith(
        "test-model",
        expect.objectContaining(runtimeConfig)
      );

      expect(result.messages[1].content).toBe("What is 2+2?");
    });

    it("should properly handle runtime configuration", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const mockModelFn = vi.fn().mockImplementation((modelName, config) => ({
        name: modelName,
        ...config,
        generate: vi.fn(),
      }));

      const modelRegistry = new VercelAIModelRegistry();
      modelRegistry.registerModels("test-model", mockModelFn);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry
      });

      const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");

      const metadata = {
        test: "test",
      };
      const runtimeConfig = {
        telemetry: { isEnabled: true, functionId: "1", metadata },
        apiKey: "test-api-key",
      };

      const telemetryConfig = {
        isEnabled: true,
        functionId: "1",
        metadata: {
          ...metadata,
          prompt_name: "math",
          props: JSON.stringify({ userMessage: "What is 2+2?" }),
        },
      };

      const result = await mathPrompt.format({
        props: {
          userMessage: "What is 2+2?",
        },
        ...runtimeConfig,
      });

      expect(result.experimental_telemetry).toEqual(telemetryConfig);

      expect(mockModelFn).toHaveBeenCalledWith(
        "test-model",
        expect.objectContaining(runtimeConfig)
      );
    });
  });
});

describe("VercelAIModelRegistry - Provider Auto-Resolution", () => {
  it("should resolve languageModel when registerProviders({ openai }) + getModelFunction('openai/gpt-4o', 'languageModel')", () => {
    const mockProvider = {
      languageModel: vi.fn().mockReturnValue({ id: "gpt-4o" }),
    };

    const registry = new VercelAIModelRegistry();
    registry.registerProviders({ openai: mockProvider });

    const creator = registry.getModelFunction("openai/gpt-4o", "languageModel");
    const model = creator("openai/gpt-4o");

    expect(mockProvider.languageModel).toHaveBeenCalledWith("gpt-4o");
    expect(model).toEqual({ id: "gpt-4o" });
  });

  it("should call provider.imageModel() when getModelFunction('openai/dall-e-3', 'imageModel')", () => {
    const mockProvider = {
      imageModel: vi.fn().mockReturnValue({ id: "dall-e-3" }),
    };

    const registry = new VercelAIModelRegistry();
    registry.registerProviders({ openai: mockProvider });

    const creator = registry.getModelFunction("openai/dall-e-3", "imageModel");
    const model = creator("openai/dall-e-3");

    expect(mockProvider.imageModel).toHaveBeenCalledWith("dall-e-3");
    expect(model).toEqual({ id: "dall-e-3" });
  });

  it("should call provider.speechModel() when getModelFunction('openai/tts-1-hd', 'speechModel')", () => {
    const mockProvider = {
      speechModel: vi.fn().mockReturnValue({ id: "tts-1-hd" }),
    };

    const registry = new VercelAIModelRegistry();
    registry.registerProviders({ openai: mockProvider });

    const creator = registry.getModelFunction("openai/tts-1-hd", "speechModel");
    const model = creator("openai/tts-1-hd");

    expect(mockProvider.speechModel).toHaveBeenCalledWith("tts-1-hd");
    expect(model).toEqual({ id: "tts-1-hd" });
  });

  it("should throw descriptive error when provider is not registered", () => {
    const registry = new VercelAIModelRegistry();

    expect(() =>
      registry.getModelFunction("unknown/model", "languageModel")
    ).toThrow(
      "Provider 'unknown' is not registered. Add .registerProviders({ unknown }) to your model registry."
    );
  });

  it("should throw descriptive error when provider is missing the requested model type method", () => {
    const mockProvider = {
      languageModel: vi.fn().mockReturnValue({ id: "gpt-4o" }),
    };

    const registry = new VercelAIModelRegistry();
    registry.registerProviders({ openai: mockProvider });

    expect(() =>
      registry.getModelFunction("openai/gpt-4o", "imageModel")
    ).toThrow("does not support imageModel models");
  });

  it("should bypass provider resolution for bare model names without a slash", () => {
    const mockProvider = {
      languageModel: vi.fn().mockReturnValue({ id: "from-provider" }),
    };
    const defaultCreator = vi.fn().mockReturnValue({ id: "from-default" });

    const registry = new VercelAIModelRegistry(defaultCreator);
    registry.registerProviders({ openai: mockProvider });

    const creator = registry.getModelFunction("gpt-4o");
    const model = creator("gpt-4o");

    expect(defaultCreator).toHaveBeenCalledWith("gpt-4o");
    expect(mockProvider.languageModel).not.toHaveBeenCalled();
    expect(model).toEqual({ id: "from-default" });
  });

  it("should merge providers across multiple registerProviders calls", () => {
    const mockOpenai = {
      languageModel: vi.fn().mockReturnValue({ id: "gpt-4o" }),
    };
    const mockAnthropic = {
      languageModel: vi.fn().mockReturnValue({ id: "claude-3" }),
    };

    const registry = new VercelAIModelRegistry();
    registry.registerProviders({ openai: mockOpenai });
    registry.registerProviders({ anthropic: mockAnthropic });

    const openaiCreator = registry.getModelFunction("openai/gpt-4o", "languageModel");
    const openaiModel = openaiCreator("openai/gpt-4o");
    expect(mockOpenai.languageModel).toHaveBeenCalledWith("gpt-4o");
    expect(openaiModel).toEqual({ id: "gpt-4o" });

    const anthropicCreator = registry.getModelFunction("anthropic/claude-3", "languageModel");
    const anthropicModel = anthropicCreator("anthropic/claude-3");
    expect(mockAnthropic.languageModel).toHaveBeenCalledWith("claude-3");
    expect(anthropicModel).toEqual({ id: "claude-3" });
  });

  it("should return this from registerProviders for chaining", () => {
    const registry = new VercelAIModelRegistry();

    const result = registry.registerProviders({}).registerProviders({});

    expect(result).toBe(registry);
  });

  it("should resolve 5+ different models from a single registered provider across all model types", () => {
    const mockProvider = {
      languageModel: vi.fn().mockImplementation((id: string) => ({ type: "language", id })),
      imageModel: vi.fn().mockImplementation((id: string) => ({ type: "image", id })),
      speechModel: vi.fn().mockImplementation((id: string) => ({ type: "speech", id })),
    };

    const registry = new VercelAIModelRegistry();
    registry.registerProviders({ openai: mockProvider });

    // Language models
    const lm1 = registry.getModelFunction("openai/gpt-4o", "languageModel");
    const lm2 = registry.getModelFunction("openai/gpt-4o-mini", "languageModel");
    const lm3 = registry.getModelFunction("openai/gpt-4-turbo", "languageModel");

    // Image model
    const im1 = registry.getModelFunction("openai/dall-e-3", "imageModel");

    // Speech model
    const sm1 = registry.getModelFunction("openai/tts-1-hd", "speechModel");

    // Invoke all creators
    lm1("openai/gpt-4o");
    lm2("openai/gpt-4o-mini");
    lm3("openai/gpt-4-turbo");
    im1("openai/dall-e-3");
    sm1("openai/tts-1-hd");

    // Verify language models resolved correctly
    expect(mockProvider.languageModel).toHaveBeenCalledWith("gpt-4o");
    expect(mockProvider.languageModel).toHaveBeenCalledWith("gpt-4o-mini");
    expect(mockProvider.languageModel).toHaveBeenCalledWith("gpt-4-turbo");
    expect(mockProvider.languageModel).toHaveBeenCalledTimes(3);

    // Verify image model
    expect(mockProvider.imageModel).toHaveBeenCalledWith("dall-e-3");
    expect(mockProvider.imageModel).toHaveBeenCalledTimes(1);

    // Verify speech model
    expect(mockProvider.speechModel).toHaveBeenCalledWith("tts-1-hd");
    expect(mockProvider.speechModel).toHaveBeenCalledTimes(1);
  });

  // T019: Precedence tests
  it("should give explicit registerModels precedence over registerProviders for same model", () => {
    const customFn = vi.fn().mockReturnValue({ custom: true });
    const mockProvider = {
      languageModel: vi.fn().mockReturnValue({ provider: true }),
    };

    const registry = new VercelAIModelRegistry();
    registry.registerProviders({ openai: mockProvider });
    registry.registerModels("openai/gpt-4o", customFn);

    const creator = registry.getModelFunction("openai/gpt-4o", "languageModel");
    expect(creator).toBe(customFn);
    // Provider should NOT be called
    expect(mockProvider.languageModel).not.toHaveBeenCalled();
  });

  it("should give pattern registerModels precedence over provider auto-resolution", () => {
    const patternFn = vi.fn().mockReturnValue({ pattern: true });
    const mockProvider = {
      languageModel: vi.fn().mockReturnValue({ provider: true }),
    };

    const registry = new VercelAIModelRegistry();
    registry.registerProviders({ openai: mockProvider });
    registry.registerModels(/openai\/.*/, patternFn);

    const creator = registry.getModelFunction("openai/gpt-4o", "languageModel");
    expect(creator).toBe(patternFn);
    expect(mockProvider.languageModel).not.toHaveBeenCalled();
  });

  it("should give provider auto-resolution precedence over default creator", () => {
    const defaultFn = vi.fn().mockReturnValue({ default: true });
    const mockProvider = {
      languageModel: vi.fn().mockReturnValue({ provider: true }),
    };

    const registry = new VercelAIModelRegistry(defaultFn);
    registry.registerProviders({ openai: mockProvider });

    const creator = registry.getModelFunction("openai/gpt-4o", "languageModel");
    creator("openai/gpt-4o");

    expect(mockProvider.languageModel).toHaveBeenCalledWith("gpt-4o");
    expect(defaultFn).not.toHaveBeenCalled();
  });

  it("should use default creator for bare model names even when providers are registered", () => {
    const defaultFn = vi.fn().mockReturnValue({ default: true });
    const mockProvider = {
      languageModel: vi.fn().mockReturnValue({ provider: true }),
    };

    const registry = new VercelAIModelRegistry(defaultFn);
    registry.registerProviders({ openai: mockProvider });

    const creator = registry.getModelFunction("gpt-4o");
    expect(creator).toBe(defaultFn);
    expect(mockProvider.languageModel).not.toHaveBeenCalled();
  });

  // T020: Edge case tests
  it("should split on first slash only for model names with multiple slashes", () => {
    const mockProvider = {
      languageModel: vi.fn().mockReturnValue({ id: "org/model" }),
    };

    const registry = new VercelAIModelRegistry();
    registry.registerProviders({ custom: mockProvider });

    const creator = registry.getModelFunction("custom/org/model", "languageModel");
    creator("custom/org/model");

    // Should split as provider="custom", modelId="org/model"
    expect(mockProvider.languageModel).toHaveBeenCalledWith("org/model");
  });

  it("should throw error for model name that is just a slash", () => {
    const registry = new VercelAIModelRegistry();

    expect(() => registry.getModelFunction("/", "languageModel")).toThrow(
      "Invalid model name format"
    );
  });

  it("should throw error for model name ending in slash", () => {
    const registry = new VercelAIModelRegistry();
    registry.registerProviders({ openai: { languageModel: vi.fn() } });

    expect(() => registry.getModelFunction("openai/", "languageModel")).toThrow(
      "Invalid model name format"
    );
  });
});

