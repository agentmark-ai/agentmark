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

// Stdio transport boundary — the factory's non-URL branch dynamically imports
// `@ai-sdk/mcp/mcp-stdio` and constructs a transport from the server config.
const stdioTransportCtor = vi.fn();
vi.mock("@ai-sdk/mcp/mcp-stdio", () => ({
  Experimental_StdioMCPTransport: class {
    constructor(cfg: unknown) {
      stdioTransportCtor(cfg);
    }
  },
}));

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

  it("boots stdio MCP servers via @ai-sdk/mcp/mcp-stdio with the exact server config", async () => {
    const { experimental_createMCPClient } = await import("@ai-sdk/mcp");
    const agentMark = createAgentMarkClient<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry,
      mcpServers: {
        "server-1": {
          command: "node",
          args: ["mcp-server.js", "--verbose"],
          cwd: "/srv/mcp",
          env: { MCP_TOKEN: "t-123" },
        },
      },
    });

    const prompt = await agentMark.loadTextPrompt("mcp-text.prompt.mdx");
    const result = await prompt.format({ props: { userMessage: "hi" } });

    // The stdio transport must be constructed from the server config verbatim —
    // a dropped field (e.g. env) would break real MCP server auth silently.
    expect(stdioTransportCtor).toHaveBeenCalledWith({
      command: "node",
      args: ["mcp-server.js", "--verbose"],
      cwd: "/srv/mcp",
      env: { MCP_TOKEN: "t-123" },
    });
    // And the client must be created over THAT transport (not a URL transport).
    expect(experimental_createMCPClient).toHaveBeenCalledWith({
      transport: expect.any(Object),
    });
    const resultTools = result.tools as Record<string, unknown>;
    expect(typeof (resultTools.search as { execute: unknown }).execute).toBe("function");
  });
});

