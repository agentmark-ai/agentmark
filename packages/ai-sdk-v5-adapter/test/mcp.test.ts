import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import path from "path";
import type { LanguageModel } from "ai";
import { FileLoader } from "@agentmark-ai/loader-file";
import { createAgentMarkClient, VercelAIModelRegistry } from "../src";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

// Mock at the SDK boundary: the shared McpServerRegistry (in prompt-core)
// delegates to `@ai-sdk/mcp` via the adapter's McpClientFactory. Intercepting
// there yields a fake client that returns pre-built tools, no network.
vi.mock("@ai-sdk/mcp", () => {
  const makeMockTool = () => ({
    parameters: {},
    description: "mock tool",
    execute: vi.fn(async () => ({ ok: true })),
  });
  return {
    experimental_createMCPClient: vi.fn(async () => ({
      tools: async () => ({ search: makeMockTool(), sum: makeMockTool() }),
    })),
  };
});

type TestPromptTypes = {
  "mcp-text.prompt.mdx": {
    input: { userMessage: string };
    output: never;
  };
};

describe("Vercel adapter MCP integration", () => {
  let modelRegistry: VercelAIModelRegistry;
  let fileLoader: FileLoader;

  // Build pre-compiled fixtures before tests run
  beforeAll(async () => {
    await setupFixtures();
  });

  // Clean up generated fixtures after tests
  afterAll(() => {
    cleanupFixtures();
  });

  beforeEach(() => {
    fileLoader = new FileLoader(path.resolve(__dirname, "./fixtures"));
    modelRegistry = new VercelAIModelRegistry();
    modelRegistry.registerModels("test-model", (modelName) => ({
      name: modelName,
      // minimal generate mock; adapter does not call it during adaptText
      generate: vi.fn(async () => ({ output: { text: "" } })),
    } as unknown as LanguageModel));
  });

  it("resolves MCP tools from URIs and returns them in tools map", async () => {
    const agentMark = createAgentMarkClient<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry,
      mcpServers: { "server-1": { url: "https://example.com/sse" } },
    });

    const prompt = await agentMark.loadTextPrompt("mcp-text.prompt.mdx");
    const result = await prompt.format({ props: { userMessage: "hi" } });

    expect(result.tools).toBeDefined();
    // Both tools are MCP URIs in v5 fixture
    const resultTools = result.tools as Record<string, unknown>;
    expect(resultTools.search).toBeDefined();
    expect(typeof (resultTools.search as { execute: unknown }).execute).toBe("function");
    expect(resultTools.sum).toBeDefined();
  });
});

