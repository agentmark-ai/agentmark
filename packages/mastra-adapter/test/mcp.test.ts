import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";
import { FileLoader } from "@agentmark/agentmark-core";
import {
  createAgentMarkClient,
  MastraModelRegistry,
  MastraToolRegistry,
} from "../src";

vi.mock("../src/mcp/mcp-client-manager", () => {
  class MockTool {
    id = "mock";
    description = "mock tool";
    inputSchema = {} as any;
    outputSchema = undefined as any;
    execute = vi.fn(async () => ({ ok: true }));
  }

  class MCPClientManager {
    async getNamespacedTools() {
      return {
        "server-1_web-search": new MockTool(),
      } as Record<string, unknown>;
    }
  }

  return { MCPClientManager };
});

type TestPromptTypes = {
  "mcp-text.prompt.mdx": {
    input: { userMessage: string };
    output: never;
  };
};

describe("Mastra adapter MCP integration", () => {
  let modelRegistry: MastraModelRegistry;
  let fileLoader: FileLoader<any>;
  let toolRegistry: MastraToolRegistry<
    { sum: { args: { a: number; b: number } } },
    { sum: number }
  >;

  beforeEach(() => {
    fileLoader = new FileLoader(path.resolve(__dirname, "./fixtures"));
    modelRegistry = new MastraModelRegistry();
    modelRegistry.registerModels(
      "test-model",
      () =>
        ({
          name: "test-model",
        } as any)
    );

    toolRegistry = new MastraToolRegistry<any>().register(
      "sum",
      ({ a, b }: { a: number; b: number }) => a + b
    ) as any;
  });

  it("resolves MCP tools from URIs and returns them in tools map", async () => {
    const agentMark = createAgentMarkClient<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry,
      toolRegistry,
      mcpServers: {
        "server-1": { url: "https://example.com/mcp" },
      },
    });

    const prompt = await agentMark.loadTextPrompt("mcp-text.prompt.mdx");
    const agent = await prompt.formatAgent({ props: { userMessage: "hi" } });
    expect(agent.tools).toBeDefined();
    expect((agent.tools as any).search).toBeDefined();
    expect(typeof (agent.tools as any).search.execute).toBe("function");
    expect((agent.tools as any).sum).toBeDefined();
  });

  it("throws when server not configured", async () => {
    vi.resetModules();
    vi.doMock("../src/mcp/mcp-client-manager", () => {
      class MCPClientManager {
        async getNamespacedTools() {
          throw new Error("MCP server 'server-1' not configured");
        }
      }
      return { MCPClientManager };
    });

    const {
      createAgentMarkClient: createClient2,
      MastraModelRegistry: MR2,
      MastraToolRegistry: TR2,
    } = await import("../src");

    const modelRegistry2 = new MR2();
    modelRegistry2.registerModels(
      "test-model",
      () => ({ name: "test-model" } as any)
    );
    const tr2 = new TR2<any>().register(
      "sum",
      ({ a, b }: { a: number; b: number }) => a + b
    ) as any;

    const agentMark = createClient2<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry: modelRegistry2,
      toolRegistry: tr2,
      mcpServers: {},
    });

    const prompt = await agentMark.loadTextPrompt("mcp-text.prompt.mdx");
    await expect(
      prompt.formatAgent({ props: { userMessage: "hi" } })
    ).rejects.toThrow(/MCP server 'server-1' not configured/);
  });

  it("throws when tool not found", async () => {
    vi.resetModules();
    vi.doMock("../src/mcp/mcp-client-manager", () => {
      class MCPClientManager {
        async getNamespacedTools() {
          return {} as Record<string, unknown>;
        }
      }
      return { MCPClientManager };
    });

    const {
      createAgentMarkClient: createClient2,
      MastraModelRegistry: MR2,
      MastraToolRegistry: TR2,
    } = await import("../src");

    const modelRegistry2 = new MR2();
    modelRegistry2.registerModels(
      "test-model",
      () => ({ name: "test" } as any)
    );

    const tr2 = new TR2<any>();
    tr2.register("sum", ({ a, b }: { a: number; b: number }) => a + b) as any;
    const agentMark = createClient2<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry: modelRegistry2,
      toolRegistry: tr2,
      mcpServers: { "server-1": { url: "https://example.com/mcp" } },
    });

    const prompt = await agentMark.loadTextPrompt("mcp-text.prompt.mdx");
    await expect(
      prompt.formatAgent({ props: { userMessage: "hi" } })
    ).rejects.toThrow(/MCP tool not found: server-1\/web-search/);
  });
});
