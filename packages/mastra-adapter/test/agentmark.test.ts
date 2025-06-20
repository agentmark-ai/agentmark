import { describe, it, expect, vi } from "vitest";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { FileLoader } from "@agentmark/agentmark-core";
import { createAgentMarkClient, MastraModelRegistry } from "../src";
import { Agent } from "@mastra/core";
import { openai } from "@ai-sdk/openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  "speech.prompt.mdx": {
    input: { userMessage: string };
    output: never;
  };
};

describe("Mastra AgentMark Integration", () => {
  describe("MastraAdapter Integration", () => {
    it("should adapt object prompts for Mastra", async () => {
      const fixturesDir = resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      
      const mockAgentCreator = vi.fn().mockImplementation((name, config, options) => {
        return new Agent({
          name: name,
          instructions: "You are a helpful math tutor.",
          model: openai("gpt-4o-mini"),
          ...config,
        });
      });
      
      const modelRegistry = new MastraModelRegistry();
      modelRegistry.registerModels("test-model", mockAgentCreator);

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

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].role).toBe("system");
      expect(result.messages[0].content).toBe("You are a helpful math tutor.");
      expect(result.messages[1].role).toBe("user");
      expect(result.messages[1].content).toBe("What is the sum of 5 and 3?");
      expect(result.output).toBeDefined();
      expect(result.options).toBeDefined();
    });

    it("should adapt text prompts for Mastra", async () => {
      const fixturesDir = resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const mockAgentCreator = vi.fn().mockImplementation((name, config, options) => {
        return new Agent({
          name: name,
          instructions: "You are a helpful math tutor.",
          model: openai("gpt-4o-mini"),
          ...config,
        });
      });

      const modelRegistry = new MastraModelRegistry();
      modelRegistry.registerModels("test-model", mockAgentCreator);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      const textPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
      const result = await textPrompt.format({
        props: {
          userMessage: "What is the sum of 5 and 3?",
        },
      });

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(3);
      expect(result.options).toBeDefined();
    });

    it("should adapt image prompts for Mastra", async () => {
      const fixturesDir = resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const mockAgentCreator = vi.fn().mockImplementation((name, config, options) => {
        return new Agent({
          name: name,
          instructions: "You are a helpful image generator.",
          model: openai("gpt-4o-mini"),
          ...config,
        });
      });

      const modelRegistry = new MastraModelRegistry();
      modelRegistry.registerModels("test-model", mockAgentCreator);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      const imagePrompt = await agentMark.loadImagePrompt("image.prompt.mdx");
      const result = await imagePrompt.format({
        props: {
          userMessage: "a beautiful sunset",
        },
      });

      expect(result).toBeDefined();
      expect(result.prompt).toBe("Generate an image of a beautiful sunset");
      expect(result.options?.n).toBe(1);
    });

    it("should adapt speech prompts for Mastra", async () => {
      const fixturesDir = resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const mockAgentCreator = vi.fn().mockImplementation((name, config, options) => {
        return new Agent({
          name: name,
          instructions: "You are a helpful speech synthesizer.",
          model: openai("gpt-4o-mini"),
          ...config,
        });
      });

      const modelRegistry = new MastraModelRegistry();
      modelRegistry.registerModels("test-model", mockAgentCreator);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      const speechPrompt = await agentMark.loadSpeechPrompt("speech.prompt.mdx");
      const result = await speechPrompt.format({
        props: {
          userMessage: "Hello world",
        },
      });

      expect(result).toBeDefined();
      expect(result.text).toBe("Speaking: Hello world");
      expect(result.options?.voice).toBe("alloy");
    });

    it("should handle custom runtime config in Mastra adapter", async () => {
      const fixturesDir = resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const mockAgentCreator = vi.fn().mockImplementation((name, config, options) => {
        return new Agent({
          name: name,
          instructions: "You are a helpful math tutor.",
          model: openai("gpt-4o-mini"),
          ...config,
        });
      });

      const modelRegistry = new MastraModelRegistry();
      modelRegistry.registerModels("test-model", mockAgentCreator);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
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

      expect(result.messages[1].content).toBe("What is 2+2?");
    });

    it("should properly handle runtime configuration with telemetry", async () => {
      const fixturesDir = resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const mockAgentCreator = vi.fn().mockImplementation((name, config, options) => {
        return new Agent({
          name: name,
          instructions: "You are a helpful math tutor.",
          model: openai("gpt-4o-mini"),
          ...config,
        });
      });

      const modelRegistry = new MastraModelRegistry();
      modelRegistry.registerModels("test-model", mockAgentCreator);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
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

      expect(result.options?.experimental_telemetry).toEqual(telemetryConfig);
    });

    it("should handle model registry pattern matching", async () => {
      const fixturesDir = resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const mockAgentCreator = vi.fn().mockImplementation((name, config, options) => {
        return new Agent({
          name: name,
          instructions: "You are a helpful assistant.",
          model: openai("gpt-4o-mini"),
          ...config,
        });
      });

      const modelRegistry = new MastraModelRegistry();
      modelRegistry.registerModels(/^test-.*/, mockAgentCreator);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
      const result = await mathPrompt.format({
        props: {
          userMessage: "What is 2+2?",
        },
      });

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(3);
    });

    it("should handle array of models in registry", async () => {
      const fixturesDir = resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const mockAgentCreator = vi.fn().mockImplementation((name, config, options) => {
        return new Agent({
          name: name,
          instructions: "You are a helpful assistant.",
          model: openai("gpt-4o-mini"),
          ...config,
        });
      });

      const modelRegistry = new MastraModelRegistry();
      modelRegistry.registerModels(["test-model", "another-test-model"], mockAgentCreator);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
      const result = await mathPrompt.format({
        props: {
          userMessage: "What is 2+2?",
        },
      });

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(3);
    });

    it("should throw error for unregistered model", async () => {
      const fixturesDir = resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const modelRegistry = new MastraModelRegistry();
      // No models registered

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      await expect(async () => {
        const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
        await mathPrompt.format({
          props: {
            userMessage: "What is 2+2?",
          },
        });
      }).rejects.toThrow("No agent creator found for model: test-model");
    });
  });
});