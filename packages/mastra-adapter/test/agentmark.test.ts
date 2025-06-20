import { describe, it, expect, vi } from "vitest";
import path from "path";
import { FileLoader } from "@agentmark/agentmark-core";
import { createAgentMarkClient, MastraAgentRegistry, MastraToolRegistry, MastraAdapter } from "../src";

type TestPromptTypes = {
  "math.prompt.mdx": {
    input: { userMessage: string };
    output: { answer: string };
  };
  "text.prompt.mdx": {
    input: { userMessage: string };
    output: never;
  };
};

// Mock Mastra's Agent class
const mockAgent = {
  name: "test-agent",
  instructions: "test instructions",
  generate: vi.fn(),
  stream: vi.fn(),
};

describe("AgentMark Integration", () => {
  describe("MastraAdapter Integration", () => {
    it("should adapt object prompts for Mastra", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);
      const mockAgentFn = vi.fn().mockImplementation((name, instructions, model, options) => ({
        ...mockAgent,
        name,
        instructions,
        model,
        options,
      }));
      const agentRegistry = new MastraAgentRegistry();
      agentRegistry.registerAgents("test-model", mockAgentFn);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        agentRegistry,
      });

      const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
      const result = await mathPrompt.format({
        props: {
          userMessage: "What is the sum of 5 and 3?",
        },
      });

      expect(mockAgentFn).toHaveBeenCalledWith(
        "Object Agent for math",
        "You are an AI assistant that returns structured output for: math",
        null,
        expect.any(Object)
      );

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[0].content).toBe("What is the sum of 5 and 3?");
      expect(result.messages[1].role).toBe("assistant");
      expect(result.messages[1].content).toBe("Here's your answer!");
      expect(result.agent).toBeDefined();
      expect(result.agent.name).toBe("Object Agent for math");
      expect(result.schema).toBeDefined();
    });

    it("should adapt text prompts for Mastra", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const mockAgentFn = vi.fn().mockImplementation((name, instructions, model, options) => ({
        ...mockAgent,
        name,
        instructions,
        model,
        options,
      }));

      const agentRegistry = new MastraAgentRegistry();
      agentRegistry.registerAgents("test-model", mockAgentFn);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        agentRegistry,
      });

      const textPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
      const result = await textPrompt.format({
        props: {
          userMessage: "What is the sum of 5 and 3?",
        },
      });

      expect(mockAgentFn).toHaveBeenCalledWith(
        "Agent for math",
        "You are an AI assistant handling: math",
        null,
        expect.any(Object)
      );

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(2);

      expect(result.agent).toEqual({
        ...mockAgent,
        name: "Agent for math",
        instructions: "You are an AI assistant handling: math",
        model: null,
        options: expect.any(Object),
      });
    });

    it("should handle custom runtime config in Mastra adapter", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const mockAgentFn = vi.fn().mockImplementation((name, instructions, model, config) => {
        return {
          ...mockAgent,
          name,
          instructions,
          model,
          apiKey: config.apiKey,
        };
      });

      const agentRegistry = new MastraAgentRegistry();
      agentRegistry.registerAgents("test-model", mockAgentFn);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
        agentRegistry
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

      expect(mockAgentFn).toHaveBeenCalledWith(
        "Object Agent for math",
        "You are an AI assistant that returns structured output for: math",
        null,
        expect.objectContaining(runtimeConfig)
      );

      expect(result.messages[0].content).toBe("What is 2+2?");
    });

    it("should handle agent registry patterns", async () => {
      const agentRegistry = new MastraAgentRegistry();
      const mockAgentFn = vi.fn().mockImplementation((name) => ({
        ...mockAgent,
        name,
      }));

      // Test exact match
      agentRegistry.registerAgents("exact-model", mockAgentFn);
      
      // Test array registration
      agentRegistry.registerAgents(["model-1", "model-2"], mockAgentFn);
      
      // Test regex pattern
      agentRegistry.registerAgents(/^gpt-.*/, mockAgentFn);
      
      // Test default fallback
      const defaultAgentFn = vi.fn().mockImplementation((name) => ({
        ...mockAgent,
        name: `default-${name}`,
      }));
      agentRegistry.setDefaultCreator(defaultAgentFn);

      // Test exact match
      const exactAgent = agentRegistry.getAgentFunction("exact-model");
      expect(exactAgent).toBe(mockAgentFn);

      // Test array match
      const arrayAgent = agentRegistry.getAgentFunction("model-1");
      expect(arrayAgent).toBe(mockAgentFn);

      // Test regex match
      const regexAgent = agentRegistry.getAgentFunction("gpt-4o-mini");
      expect(regexAgent).toBe(mockAgentFn);

      // Test default fallback
      const defaultAgent = agentRegistry.getAgentFunction("unknown-model");
      expect(defaultAgent).toBe(defaultAgentFn);
    });

    it("should handle tool registry", async () => {
      // Create a proper typed tool registry for testing
      type TestToolDef = {
        testTool: { args: { arg: string } };
        anotherTool: { args: { value: number } };
      };
      
      const toolRegistry = new MastraToolRegistry<TestToolDef>();
      const mockToolFn = vi.fn().mockResolvedValue("tool result");
      const mockTool2Fn = vi.fn().mockResolvedValue(42);
      
      toolRegistry.register("testTool", mockToolFn);
      toolRegistry.register("anotherTool", mockTool2Fn);
      
      expect(toolRegistry.has("testTool")).toBe(true);
      expect(toolRegistry.has("anotherTool")).toBe(true);
      expect((toolRegistry as any).has("nonExistentTool")).toBe(false);
      
      const tool = toolRegistry.get("testTool");
      const result = await tool({ arg: "test" });
      
      expect(mockToolFn).toHaveBeenCalledWith({ arg: "test" });
      expect(result).toBe("tool result");

      const tool2 = toolRegistry.get("anotherTool");
      const result2 = await tool2({ value: 100 });
      
      expect(mockTool2Fn).toHaveBeenCalledWith({ value: 100 });
      expect(result2).toBe(42);
    });

    it("should handle missing agents gracefully", () => {
      const agentRegistry = new MastraAgentRegistry();
      
      expect(() => {
        agentRegistry.getAgentFunction("non-existent-model");
      }).toThrow("No agent function found for: non-existent-model");
    });

    it("should create adapter with correct name", () => {
      const agentRegistry = new MastraAgentRegistry();
      const adapter = new MastraAdapter(agentRegistry);
      
      expect(adapter.__name).toBe("mastra");
    });
  });
});