import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import path from "path";
import { FileLoader } from "@agentmark-ai/loader-file";
import { createAgentMarkClient, MastraModelRegistry } from "../src";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

type TestPromptTypes = {
  "math.prompt.mdx": {
    input: { userMessage: string };
    output: { answer: string };
  };
  "text.prompt.mdx": {
    input: { userMessage: string };
    output: never;
  };
  "text-with-tools.prompt.mdx": {
    input: { userMessage: string };
    output: never;
  };
};

describe("Mastra Adapter Integration", () => {
  // Build pre-compiled fixtures before tests run
  beforeAll(async () => {
    await setupFixtures();
  });

  // Clean up generated fixtures after tests
  afterAll(() => {
    cleanupFixtures();
  });

  it("should adapt object prompts for Mastra", async () => {
    const fixturesDir = path.resolve(__dirname, "./fixtures");
    const fileLoader = new FileLoader(fixturesDir);

    const mockModelFn = vi.fn().mockImplementation((modelName) => ({
      name: modelName,
      generate: vi.fn(),
    }));

    const modelRegistry = new MastraModelRegistry();
    modelRegistry.registerModels("test-model", mockModelFn);

    const agentMark = createAgentMarkClient<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry,
    });

    const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
    const agent = await mathPrompt.formatAgent();

    // Model function should be resolved with model name and options
    expect(mockModelFn).toHaveBeenCalledWith("test-model", expect.any(Object));

    // formatMessages should return messages (including the system message for object prompts)
    const [messages, opts] = await agent.formatMessages({
      props: { userMessage: "What is the sum of 5 and 3?" },
    });

    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe("You are a helpful math tutor.");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toBe("What is the sum of 5 and 3?");

    // options.output should be a zod schema for the object prompt
    expect((opts as any).output).toBeDefined();
    expect(typeof (opts as any).output.parse).toBe("function");
  });

  it("should adapt text prompts for Mastra", async () => {
    const fixturesDir = path.resolve(__dirname, "./fixtures");
    const fileLoader = new FileLoader(fixturesDir);

    const mockModelFn = vi.fn().mockImplementation((modelName) => ({
      name: modelName,
      generate: vi.fn(),
    }));

    const modelRegistry = new MastraModelRegistry();
    modelRegistry.registerModels("test-model", mockModelFn);

    const agentMark = createAgentMarkClient<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry,
    });

    const textPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
    const agent = await textPrompt.formatAgent();

    expect(mockModelFn).toHaveBeenCalledWith("test-model", expect.any(Object));

    // Text messages exclude the system prompt (2 messages: user + assistant)
    const [messages, opts] = await agent.formatMessages({
      props: { userMessage: "What is the sum of 5 and 3?" },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");

    // options should include output: undefined for text prompts
    expect((opts as any).output).toBeUndefined();
  });

  it("should properly handle runtime configuration and telemetry (object)", async () => {
    const fixturesDir = path.resolve(__dirname, "./fixtures");
    const fileLoader = new FileLoader(fixturesDir);

    const mockModelFn = vi.fn().mockImplementation((modelName, config) => ({
      name: modelName,
      ...config,
      generate: vi.fn(),
    }));

    const modelRegistry = new MastraModelRegistry();
    modelRegistry.registerModels("test-model", mockModelFn);

    const agentMark = createAgentMarkClient<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry,
    });

    const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");

    const metadata = { test: "test" };
    const runtimeConfig = {
      telemetry: { isEnabled: true, functionId: "1", metadata },
      apiKey: "test-api-key",
    } as const;

    const agent = await mathPrompt.formatAgent({
      options: runtimeConfig,
    });

    // formatMessages should bake telemetry into options
    const [, opts] = await agent.formatMessages({
      props: { userMessage: "What is 2+2?" },
    });

    expect((opts as any).telemetry).toEqual(
      expect.objectContaining({
        isEnabled: true,
        functionId: "1",
        metadata: expect.objectContaining({
          ...metadata,
          prompt_name: "math",
          props: JSON.stringify({ userMessage: "What is 2+2?" }),
        }),
      })
    );

    // Model function received runtime config
    expect(mockModelFn).toHaveBeenCalledWith(
      "test-model",
      expect.objectContaining(runtimeConfig)
    );
  });

  it("should throw if a declared tool is not registered", async () => {
    const fixturesDir = path.resolve(__dirname, "./fixtures");
    const fileLoader = new FileLoader(fixturesDir);

    const mockModelFn = vi.fn().mockImplementation((modelName) => ({
      name: modelName,
      generate: vi.fn(),
    }));

    const modelRegistry = new MastraModelRegistry();
    modelRegistry.registerModels("test-model", mockModelFn);

    const agentMark = createAgentMarkClient<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry,
    });

    const textPrompt = await agentMark.loadTextPrompt(
      "text-with-tools.prompt.mdx"
    );

    await expect(
      textPrompt.formatAgent({ props: { userMessage: "sum?" } })
    ).rejects.toThrow(/Tool sum not registered/);
  });
});

describe("MastraModelRegistry - Provider Auto-Resolution", () => {
  /**
   * Helper: creates a fake AI SDK-style provider object.
   * Each model type method is a vi.fn() that returns a distinguishable object.
   */
  function createFakeProvider(name: string) {
    return {
      languageModel: vi.fn((modelId: string) => ({
        kind: "languageModel",
        provider: name,
        modelId,
      })),
      imageModel: vi.fn((modelId: string) => ({
        kind: "imageModel",
        provider: name,
        modelId,
      })),
    };
  }

  it("should resolve languageModel via registerProviders when modelType is specified", () => {
    const openai = createFakeProvider("openai");
    const registry = new MastraModelRegistry();
    registry.registerProviders({ openai });

    const creator = registry.getModelFunction("openai/gpt-4o", "languageModel");
    const result = creator("openai/gpt-4o");

    expect(openai.languageModel).toHaveBeenCalledWith("gpt-4o");
    expect(result).toEqual({
      kind: "languageModel",
      provider: "openai",
      modelId: "gpt-4o",
    });
  });

  it("should default to languageModel when modelType is omitted", () => {
    const openai = createFakeProvider("openai");
    const registry = new MastraModelRegistry();
    registry.registerProviders({ openai });

    const creator = registry.getModelFunction("openai/gpt-4o");
    creator("openai/gpt-4o");

    expect(openai.languageModel).toHaveBeenCalledWith("gpt-4o");
    expect(openai.imageModel).not.toHaveBeenCalled();
  });

  it("should resolve imageModel via provider when modelType is imageModel", () => {
    const openai = createFakeProvider("openai");
    const registry = new MastraModelRegistry();
    registry.registerProviders({ openai });

    const creator = registry.getModelFunction("openai/dall-e-3", "imageModel");
    const result = creator("openai/dall-e-3");

    expect(openai.imageModel).toHaveBeenCalledWith("dall-e-3");
    expect(result).toEqual({
      kind: "imageModel",
      provider: "openai",
      modelId: "dall-e-3",
    });
  });

  it("should throw descriptive error when provider is not registered", () => {
    const registry = new MastraModelRegistry();

    expect(() => registry.getModelFunction("anthropic/claude-3", "languageModel")).toThrow(
      "Provider 'anthropic' is not registered. Add .registerProviders({ anthropic }) to your model registry."
    );
  });

  it("should throw descriptive error when provider lacks the requested model type", () => {
    const speechOnlyProvider = {
      speechModel: vi.fn((modelId: string) => ({ kind: "speechModel", modelId })),
    };
    const registry = new MastraModelRegistry();
    registry.registerProviders({ elevenlabs: speechOnlyProvider });

    expect(() => registry.getModelFunction("elevenlabs/voice-1", "languageModel")).toThrow(
      "Provider 'elevenlabs' does not support languageModel models. The model 'elevenlabs/voice-1' cannot be created as a languageModel."
    );
  });

  it("should bypass provider resolution for bare model names without a slash", () => {
    const openai = createFakeProvider("openai");
    const defaultCreator = vi.fn(() => ({ kind: "default" }));
    const registry = new MastraModelRegistry(defaultCreator);
    registry.registerProviders({ openai });

    const creator = registry.getModelFunction("gpt-4o");

    expect(creator).toBe(defaultCreator);
    expect(openai.languageModel).not.toHaveBeenCalled();
  });

  it("should merge providers when registerProviders is called multiple times", () => {
    const openai = createFakeProvider("openai");
    const anthropic = createFakeProvider("anthropic");
    const registry = new MastraModelRegistry();

    registry.registerProviders({ openai });
    registry.registerProviders({ anthropic });

    const openaiCreator = registry.getModelFunction("openai/gpt-4o", "languageModel");
    const anthropicCreator = registry.getModelFunction("anthropic/claude-3", "languageModel");

    openaiCreator("openai/gpt-4o");
    anthropicCreator("anthropic/claude-3");

    expect(openai.languageModel).toHaveBeenCalledWith("gpt-4o");
    expect(anthropic.languageModel).toHaveBeenCalledWith("claude-3");
  });

  it("should prefer exact match over provider auto-resolution", () => {
    const openai = createFakeProvider("openai");
    const exactCreator = vi.fn(() => ({ kind: "exact" }));
    const registry = new MastraModelRegistry();
    registry.registerProviders({ openai });
    registry.registerModels("openai/gpt-4o", exactCreator);

    const creator = registry.getModelFunction("openai/gpt-4o", "languageModel");

    expect(creator).toBe(exactCreator);
    expect(openai.languageModel).not.toHaveBeenCalled();
  });

  it("should prefer pattern match over provider auto-resolution", () => {
    const openai = createFakeProvider("openai");
    const patternCreator = vi.fn(() => ({ kind: "pattern" }));
    const registry = new MastraModelRegistry();
    registry.registerProviders({ openai });
    registry.registerModels(/^openai\/gpt-.*$/, patternCreator);

    const creator = registry.getModelFunction("openai/gpt-4o", "languageModel");

    expect(creator).toBe(patternCreator);
    expect(openai.languageModel).not.toHaveBeenCalled();
  });

  it("should support registerProviders chaining", () => {
    const openai = createFakeProvider("openai");
    const anthropic = createFakeProvider("anthropic");
    const registry = new MastraModelRegistry();

    const result = registry
      .registerProviders({ openai })
      .registerProviders({ anthropic });

    expect(result).toBe(registry);
  });

  it("should throw when model name has no provider or model part after slash", () => {
    const registry = new MastraModelRegistry();
    // A model name like "/gpt-4o" has empty provider name
    registry.registerProviders({});

    expect(() => registry.getModelFunction("/gpt-4o", "languageModel")).toThrow(
      "Invalid model name format: '/gpt-4o'. Expected 'provider/model'."
    );
  });

  it("should throw when model name has trailing slash with no model id", () => {
    const registry = new MastraModelRegistry();
    registry.registerProviders({});

    expect(() => registry.getModelFunction("openai/", "languageModel")).toThrow(
      "Invalid model name format: 'openai/'. Expected 'provider/model'."
    );
  });

  it("should handle model names with multiple slashes by using first segment as provider", () => {
    const openai = createFakeProvider("openai");
    const registry = new MastraModelRegistry();
    registry.registerProviders({ openai });

    const creator = registry.getModelFunction("openai/ft:gpt-4o/custom-suffix", "languageModel");
    creator("openai/ft:gpt-4o/custom-suffix");

    // Everything after the first slash becomes the modelId
    expect(openai.languageModel).toHaveBeenCalledWith("ft:gpt-4o/custom-suffix");
  });

  it("should fall through to default creator when model name has no slash and no match", () => {
    const defaultCreator = vi.fn(() => ({ kind: "default" }));
    const registry = new MastraModelRegistry(defaultCreator);

    const creator = registry.getModelFunction("some-model");

    expect(creator).toBe(defaultCreator);
  });

  it("should throw final error when no resolution strategy matches", () => {
    const registry = new MastraModelRegistry();

    expect(() => registry.getModelFunction("bare-model")).toThrow(
      "No model function found for: 'bare-model'. Register it with .registerModels() or use provider/model format with .registerProviders()."
    );
  });

  it("should override a previously registered provider on second call", () => {
    const openaiV1 = createFakeProvider("openai-v1");
    const openaiV2 = createFakeProvider("openai-v2");
    const registry = new MastraModelRegistry();

    registry.registerProviders({ openai: openaiV1 });
    registry.registerProviders({ openai: openaiV2 });

    const creator = registry.getModelFunction("openai/gpt-4o", "languageModel");
    creator("openai/gpt-4o");

    expect(openaiV1.languageModel).not.toHaveBeenCalled();
    expect(openaiV2.languageModel).toHaveBeenCalledWith("gpt-4o");
  });
});
