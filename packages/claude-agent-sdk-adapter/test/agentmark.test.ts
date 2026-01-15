import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "path";
import { FileLoader } from "@agentmark-ai/loader-file";
import {
  createAgentMarkClient,
  ClaudeAgentModelRegistry,
  ClaudeAgentToolRegistry,
  ClaudeAgentAdapter,
} from "../src";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

type TestTools = {
  search: { args: { query: string } };
};

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
    tools: TestTools;
  };
  "agent-task.prompt.mdx": {
    input: { task: string };
    output: never;
  };
  "image.prompt.mdx": {
    input: { description: string };
    output: never;
  };
  "speech.prompt.mdx": {
    input: { text: string };
    output: never;
  };
};

describe("Claude Agent SDK Adapter Integration", () => {
  beforeAll(async () => {
    await setupFixtures();
  });

  afterAll(() => {
    cleanupFixtures();
  });

  describe("ClaudeAgentModelRegistry", () => {
    it("should create a default registry that passes model names through", () => {
      const registry = ClaudeAgentModelRegistry.createDefault();
      const config = registry.getModelConfig("claude-sonnet-4-20250514");

      expect(config).toEqual({ model: "claude-sonnet-4-20250514" });
    });

    it("should register models with exact match", () => {
      const registry = new ClaudeAgentModelRegistry()
        .registerModels("claude-opus-4-20250514", (name) => ({
          model: name,
          maxThinkingTokens: 10000,
        }));

      const config = registry.getModelConfig("claude-opus-4-20250514");
      expect(config).toEqual({
        model: "claude-opus-4-20250514",
        maxThinkingTokens: 10000,
      });
    });

    it("should register models with regex pattern", () => {
      const registry = new ClaudeAgentModelRegistry()
        .registerModels(/claude-.*-thinking/, (name) => ({
          model: name,
          maxThinkingTokens: 20000,
        }));

      const config = registry.getModelConfig("claude-sonnet-thinking");
      expect(config).toEqual({
        model: "claude-sonnet-thinking",
        maxThinkingTokens: 20000,
      });
    });

    it("should register multiple models with array", () => {
      const registry = new ClaudeAgentModelRegistry()
        .registerModels(
          ["claude-sonnet-4-20250514", "claude-haiku-4-20250514"],
          (name) => ({ model: name })
        );

      expect(registry.hasModel("claude-sonnet-4-20250514")).toBe(true);
      expect(registry.hasModel("claude-haiku-4-20250514")).toBe(true);
    });

    it("should fall back to default creator for unknown models", () => {
      const registry = new ClaudeAgentModelRegistry((name) => ({
        model: name,
      }));

      const config = registry.getModelConfig("unknown-model");
      expect(config).toEqual({ model: "unknown-model" });
    });

    it("should throw error when no matching configuration and no default", () => {
      const registry = new ClaudeAgentModelRegistry();
      // Override the default creator
      (registry as any).defaultCreator = undefined;

      expect(() => registry.getModelConfig("unknown-model")).toThrow(
        /No model configuration found/
      );
    });

    it("should prioritize exact match over pattern match", () => {
      const registry = new ClaudeAgentModelRegistry()
        .registerModels(/claude-.*/, () => ({
          model: "pattern-match",
          maxThinkingTokens: 1000,
        }))
        .registerModels("claude-opus-4-20250514", () => ({
          model: "claude-opus-4-20250514",
          maxThinkingTokens: 50000,
        }));

      const config = registry.getModelConfig("claude-opus-4-20250514");
      // Exact match should win
      expect(config.maxThinkingTokens).toBe(50000);
    });

    it("should use first matching pattern when multiple match", () => {
      const registry = new ClaudeAgentModelRegistry()
        .registerModels(/claude-.*/, () => ({
          model: "first-pattern",
        }))
        .registerModels(/claude-sonnet.*/, () => ({
          model: "second-pattern",
        }));

      const config = registry.getModelConfig("claude-sonnet-4-20250514");
      // First registered pattern should win
      expect(config.model).toBe("first-pattern");
    });

    it("should handle regex with flags (case-insensitive)", () => {
      const registry = new ClaudeAgentModelRegistry()
        .registerModels(/CLAUDE-.*/i, (name) => ({
          model: name,
          maxThinkingTokens: 5000,
        }));

      const config = registry.getModelConfig("claude-sonnet-4-20250514");
      expect(config.model).toBe("claude-sonnet-4-20250514");
      expect(config.maxThinkingTokens).toBe(5000);
    });

    it("should pass model name to creator function", () => {
      const creator = (name: string) => ({
        model: name.toUpperCase(),
      });
      const registry = new ClaudeAgentModelRegistry()
        .registerModels("test-model", creator);

      const config = registry.getModelConfig("test-model");
      expect(config.model).toBe("TEST-MODEL");
    });
  });

  describe("ClaudeAgentToolRegistry", () => {
    it("should register and retrieve tools", async () => {
      type TestTools = {
        search: { args: { query: string } };
      };
      const registry = new ClaudeAgentToolRegistry<TestTools>()
        .register("search", async ({ query }) => ({ results: [query] }));

      expect(registry.has("search")).toBe(true);
      expect(registry.size).toBe(1);
    });

    it("should execute registered tools", async () => {
      type TestTools = {
        add: { args: { a: number; b: number } };
      };
      const registry = new ClaudeAgentToolRegistry<TestTools>()
        .register("add", async ({ a, b }) => ({ sum: a + b }));

      const executor = registry.get("add");
      const result = await executor({ a: 5, b: 3 });
      expect(result).toEqual({ sum: 8 });
    });

    it("should get all tool names", () => {
      type TestTools = {
        tool1: { args: Record<string, never> };
        tool2: { args: Record<string, never> };
      };
      const registry = new ClaudeAgentToolRegistry<TestTools>()
        .register("tool1", async () => ({}))
        .register("tool2", async () => ({}));

      const names = registry.getToolNames();
      expect(names).toEqual(["tool1", "tool2"]);
    });

    it("should return false for unregistered tools", () => {
      type TestTools = {
        search: { args: { query: string } };
      };
      const registry = new ClaudeAgentToolRegistry<TestTools>();

      expect(registry.has("search")).toBe(false);
    });

    it("should handle tool executor that throws", async () => {
      type TestTools = {
        failing: { args: Record<string, never> };
      };
      const registry = new ClaudeAgentToolRegistry<TestTools>()
        .register("failing", async () => {
          throw new Error("Tool execution failed");
        });

      const executor = registry.get("failing");
      await expect(executor({})).rejects.toThrow("Tool execution failed");
    });

    it("should allow chained registration", () => {
      type TestTools = {
        tool1: { args: Record<string, never> };
        tool2: { args: Record<string, never> };
        tool3: { args: Record<string, never> };
      };
      const registry = new ClaudeAgentToolRegistry<TestTools>()
        .register("tool1", async () => ({}))
        .register("tool2", async () => ({}))
        .register("tool3", async () => ({}));

      expect(registry.size).toBe(3);
    });

    it("should handle async executor with complex return type", async () => {
      type TestTools = {
        complex: { args: { data: string[] } };
      };
      const registry = new ClaudeAgentToolRegistry<TestTools>()
        .register("complex", async ({ data }) => {
          await new Promise(resolve => setTimeout(resolve, 1));
          return {
            processed: data.map(d => d.toUpperCase()),
            count: data.length,
            timestamp: Date.now(),
          };
        });

      const executor = registry.get("complex");
      const result = await executor({ data: ["a", "b", "c"] });
      expect(result).toHaveProperty("processed");
      expect(result).toHaveProperty("count", 3);
    });
  });

  describe("ClaudeAgentAdapter - Text Prompts", () => {
    it("should adapt text prompts for Claude Agent SDK", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      const modelRegistry = ClaudeAgentModelRegistry.createDefault();

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      const textPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
      const result = await textPrompt.format({
        props: {
          userMessage: "Hello, how are you?",
        },
      });

      expect(result).toBeDefined();
      expect(result.query.prompt).toContain("Hello, how are you?");
      expect(result.query.options).toBeDefined();
      expect(result.query.options.model).toBe("claude-sonnet-4-20250514");
      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it("should extract system prompt from messages", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      const modelRegistry = ClaudeAgentModelRegistry.createDefault();

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      const textPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
      const result = await textPrompt.format({
        props: { userMessage: "test" },
      });

      // System prompt should be in options, not in the prompt string
      expect(result.query.options.systemPrompt).toBe("You are a helpful assistant.");
      // The prompt should not contain the system message
      expect(result.query.prompt).not.toContain("You are a helpful assistant.");
    });

    it("should pass max_calls as maxTurns", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      const modelRegistry = ClaudeAgentModelRegistry.createDefault();

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      const agentPrompt = await agentMark.loadTextPrompt("agent-task.prompt.mdx");
      const result = await agentPrompt.format({
        props: { task: "Write a function" },
      });

      expect(result.query.options.maxTurns).toBe(10);
    });
  });

  describe("ClaudeAgentAdapter - Object Prompts", () => {
    it("should adapt object prompts with structured output", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      const modelRegistry = ClaudeAgentModelRegistry.createDefault();

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
      const result = await mathPrompt.format({
        props: { userMessage: "What is 2+2?" },
      });

      expect(result).toBeDefined();
      expect(result.query.prompt).toContain("What is 2+2?");
      expect(result.query.options.outputFormat).toBeDefined();
      expect(result.query.options.outputFormat.type).toBe("json_schema");
      expect(result.query.options.outputFormat.schema).toBeDefined();
    });
  });

  describe("ClaudeAgentAdapter - Unsupported Types", () => {
    it("should throw error for image prompts", () => {
      const modelRegistry = ClaudeAgentModelRegistry.createDefault();
      const adapter = new ClaudeAgentAdapter<TestPromptTypes>(modelRegistry);

      // Call adaptImage directly with a mock config
      const mockImageConfig = {
        name: "test-image",
        image_config: {
          model_name: "dall-e-3",
          size: "1024x1024",
        },
      };

      expect(() =>
        adapter.adaptImage(mockImageConfig as never, {})
      ).toThrow(/Image generation is not supported/);
    });

    it("should throw error for speech prompts", () => {
      const modelRegistry = ClaudeAgentModelRegistry.createDefault();
      const adapter = new ClaudeAgentAdapter<TestPromptTypes>(modelRegistry);

      // Call adaptSpeech directly with a mock config
      const mockSpeechConfig = {
        name: "test-speech",
        speech_config: {
          model_name: "tts-1-hd",
          voice: "alloy",
        },
      };

      expect(() =>
        adapter.adaptSpeech(mockSpeechConfig as never, {})
      ).toThrow(/Speech generation is not supported/);
    });
  });

  describe("ClaudeAgentAdapter - Adapter Options", () => {
    it("should apply permission mode from adapter options", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      const modelRegistry = ClaudeAgentModelRegistry.createDefault();

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
        adapterOptions: {
          permissionMode: "bypassPermissions",
        },
      });

      const textPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
      const result = await textPrompt.format({
        props: { userMessage: "test" },
      });

      expect(result.query.options.permissionMode).toBe("bypassPermissions");
    });

    it("should apply maxTurns from adapter options", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      const modelRegistry = ClaudeAgentModelRegistry.createDefault();

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
        adapterOptions: {
          maxTurns: 50,
        },
      });

      const textPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
      const result = await textPrompt.format({
        props: { userMessage: "test" },
      });

      expect(result.query.options.maxTurns).toBe(50);
    });

    it("should apply cwd from adapter options", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      const modelRegistry = ClaudeAgentModelRegistry.createDefault();

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
        adapterOptions: {
          cwd: "/custom/path",
        },
      });

      const textPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
      const result = await textPrompt.format({
        props: { userMessage: "test" },
      });

      expect(result.query.options.cwd).toBe("/custom/path");
    });

    it("should apply allowedTools and disallowedTools", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      const modelRegistry = ClaudeAgentModelRegistry.createDefault();

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
        adapterOptions: {
          allowedTools: ["Read", "Write"],
          disallowedTools: ["Bash"],
        },
      });

      const textPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
      const result = await textPrompt.format({
        props: { userMessage: "test" },
      });

      expect(result.query.options.allowedTools).toEqual(["Read", "Write"]);
      expect(result.query.options.disallowedTools).toEqual(["Bash"]);
    });
  });

  describe("ClaudeAgentAdapter - Telemetry", () => {
    it("should include telemetry context when enabled", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      const modelRegistry = ClaudeAgentModelRegistry.createDefault();

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      const textPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
      const result = await textPrompt.format({
        props: { userMessage: "test" },
        telemetry: {
          isEnabled: true,
          functionId: "test-function",
          metadata: { userId: "user-123" },
        },
      });

      // Telemetry context is now returned for withTracing() wrapper to use
      expect(result.telemetry).toBeDefined();
      expect(result.telemetry?.isEnabled).toBe(true);
      expect(result.telemetry?.promptName).toBe("text-prompt");
      expect(result.telemetry?.metadata?.userId).toBe("user-123");
    });

    it("should not include telemetry context when telemetry is disabled", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      const modelRegistry = ClaudeAgentModelRegistry.createDefault();

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      const textPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
      const result = await textPrompt.format({
        props: { userMessage: "test" },
      });

      // No telemetry context when not enabled
      expect(result.telemetry).toBeUndefined();
    });
  });

  describe("ClaudeAgentAdapter - Tool Registry Integration", () => {
    it("should include MCP servers when tools are defined in prompt and registered", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      const modelRegistry = ClaudeAgentModelRegistry.createDefault();

      const toolRegistry = new ClaudeAgentToolRegistry<TestTools>()
        .register("search", async ({ query }) => ({ results: [query] }));

      const agentMark = createAgentMarkClient<TestPromptTypes, typeof toolRegistry>({
        loader: fileLoader,
        modelRegistry,
        toolRegistry,
      });

      // Use prompt with tools defined in frontmatter
      const textPrompt = await agentMark.loadTextPrompt("text-with-tools.prompt.mdx");
      const result = await textPrompt.format({
        props: { userMessage: "test" },
      });

      expect(result.query.options.mcpServers).toBeDefined();
      expect(result.query.options.mcpServers?.["prompt-tools"]).toBeDefined();
    });

    it("should not include MCP servers when no tools registered", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      const modelRegistry = ClaudeAgentModelRegistry.createDefault();

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        modelRegistry,
      });

      const textPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
      const result = await textPrompt.format({
        props: { userMessage: "test" },
      });

      expect(result.query.options.mcpServers).toBeUndefined();
    });
  });

  describe("ClaudeAgentAdapter - Unsupported Options Warning", () => {
    it("should warn when unsupported text_config options are present and onWarning is set", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const modelRegistry = ClaudeAgentModelRegistry.createDefault();
      // Enable warnings by providing onWarning callback
      const adapter = new ClaudeAgentAdapter<TestPromptTypes>(modelRegistry, undefined, { onWarning: console.warn });

      // Mock text config with unsupported options
      const mockTextConfig = {
        name: "test-prompt",
        messages: [{ role: "user" as const, content: "test" }],
        text_config: {
          model_name: "claude-sonnet-4-20250514",
          temperature: 0.7,
          max_tokens: 1000,
          top_p: 0.9,
        },
      };

      await adapter.adaptText(
        mockTextConfig,
        {},
        { props: {}, path: undefined, template: {} }
      );

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[claude-agent-sdk-adapter]")
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("temperature")
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("max_tokens")
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("top_p")
      );

      warnSpy.mockRestore();
    });

    it("should warn when unsupported object_config options are present and onWarning is set", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const modelRegistry = ClaudeAgentModelRegistry.createDefault();
      // Enable warnings by providing onWarning callback
      const adapter = new ClaudeAgentAdapter<TestPromptTypes>(modelRegistry, undefined, { onWarning: console.warn });

      // Mock object config with unsupported options
      const mockObjectConfig = {
        name: "test-object-prompt",
        messages: [{ role: "user" as const, content: "test" }],
        object_config: {
          model_name: "claude-sonnet-4-20250514",
          schema: { type: "object", properties: {} },
          frequency_penalty: 0.5,
          seed: 12345,
        },
      };

      await adapter.adaptObject(
        mockObjectConfig,
        {},
        { props: {}, path: undefined, template: {} }
      );

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[claude-agent-sdk-adapter]")
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("frequency_penalty")
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("seed")
      );

      warnSpy.mockRestore();
    });

    it("should not warn when only supported options are present", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const modelRegistry = ClaudeAgentModelRegistry.createDefault();
      const adapter = new ClaudeAgentAdapter<TestPromptTypes>(modelRegistry);

      // Mock text config with only supported options
      const mockTextConfig = {
        name: "test-prompt",
        messages: [{ role: "user" as const, content: "test" }],
        text_config: {
          model_name: "claude-sonnet-4-20250514",
          max_calls: 5,
        },
      };

      await adapter.adaptText(
        mockTextConfig,
        {},
        { props: {}, path: undefined, template: {} }
      );

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("should include prompt name in warning message when onWarning is set", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const modelRegistry = ClaudeAgentModelRegistry.createDefault();
      // Enable warnings by providing onWarning callback
      const adapter = new ClaudeAgentAdapter<TestPromptTypes>(modelRegistry, undefined, { onWarning: console.warn });

      const mockTextConfig = {
        name: "my-special-prompt",
        messages: [{ role: "user" as const, content: "test" }],
        text_config: {
          model_name: "claude-sonnet-4-20250514",
          temperature: 0.5,
        },
      };

      await adapter.adaptText(
        mockTextConfig,
        {},
        { props: {}, path: undefined, template: {} }
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('prompt "my-special-prompt"')
      );

      warnSpy.mockRestore();
    });
  });
});
