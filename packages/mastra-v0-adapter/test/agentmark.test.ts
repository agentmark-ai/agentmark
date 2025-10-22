import { describe, it, expect, vi } from "vitest";
import path from "path";
import { FileLoader } from "@agentmark/prompt-core";
import { createAgentMarkClient, MastraModelRegistry } from "../src";

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
          prompt: "math",
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
