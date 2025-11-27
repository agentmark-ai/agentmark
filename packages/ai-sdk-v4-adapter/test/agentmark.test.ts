import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import path from "path";
import { FileLoader } from "@agentmark/prompt-core";
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
          prompt: "math",
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
