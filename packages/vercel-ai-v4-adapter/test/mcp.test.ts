import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";
import { FileLoader } from "@agentmark/agentmark-core";
import { createAgentMarkClient, VercelAIModelRegistry } from "../src";

vi.mock("../src/mcp/mcp-client-manager", () => {
  class MockTool {
    parameters = {} as any;
    description = "mock tool";
    execute = vi.fn(async () => ({ ok: true }));
  }

  class McpClientManager {
    async getTool(server: string, toolName: string) {
      return new MockTool();
    }
  }

  return { McpClientManager };
});

type TestPromptTypes = {
  "mcp-text.prompt.mdx": {
    input: { userMessage: string };
    output: never;
  };
};

describe("Vercel adapter MCP integration", () => {
  let modelRegistry: VercelAIModelRegistry;
  let fileLoader: FileLoader<any>;

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
    const agentMark = createAgentMarkClient<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry,
      mcpServers: {
        "server-1": { url: "https://example.com/sse" },
      },
    });

    const prompt = await agentMark.loadTextPrompt("mcp-text.prompt.mdx");
    const result = await prompt.format({ props: { userMessage: "hi" } });

    expect(result.tools).toBeDefined();
    expect(result.tools.search).toBeDefined();
    expect(typeof result.tools.search.execute).toBe("function");
    expect(result.tools.sum).toBeDefined();
  });
});


