import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import path from "path";
import { FileLoader } from "@agentmark-ai/loader-file";
import { createAgentMarkClient, VercelAIModelRegistry } from "../src";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

// Mock at the SDK boundary — the shared McpServerRegistry in prompt-core
// calls `experimental_createMCPClient` via the adapter's McpClientFactory.
vi.mock("ai", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const makeMockTool = () => ({
    parameters: {} as any,
    description: "mock tool",
    execute: vi.fn(async () => ({ ok: true })),
  });
  return {
    ...actual,
    experimental_createMCPClient: vi.fn(async () => ({
      tools: async () => ({
        "web-search": makeMockTool(),
        search: makeMockTool(),
        sum: makeMockTool(),
      }),
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
    } as any));
  });

  it("resolves MCP tools from URIs and returns them in tools map", async () => {
    const mockSumTool = {
      description: "Add two numbers",
      parameters: {} as any,
      execute: vi.fn(async () => 42),
    };

    const agentMark = createAgentMarkClient<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry,
      tools: { sum: mockSumTool as any },
      mcpServers: { "server-1": { url: "https://example.com/sse" } },
    });

    const prompt = await agentMark.loadTextPrompt("mcp-text.prompt.mdx");
    const result = await prompt.format({ props: { userMessage: "hi" } });

    expect(result.tools).toBeDefined();
    // MCP tool resolved by tool name from URI
    expect((result.tools as any)["web-search"]).toBeDefined();
    expect(typeof (result.tools as any)["web-search"].execute).toBe("function");
    // Plain tool resolved by name
    expect((result.tools as any).sum).toBe(mockSumTool);
  });
});


