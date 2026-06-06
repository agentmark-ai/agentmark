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

// Stdio transport boundary — v4's factory dynamically imports `ai/mcp-stdio`
// (NOT `@ai-sdk/mcp/mcp-stdio`; that's a real v4/v5 delta) and constructs a
// transport from the server config.
const stdioTransportCtor = vi.fn();
vi.mock("ai/mcp-stdio", () => ({
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

  it("boots stdio MCP servers via ai/mcp-stdio with the exact server config", async () => {
    const { experimental_createMCPClient } = await import("ai");
    const mockSumTool = {
      description: "Add two numbers",
      parameters: {} as any,
      execute: vi.fn(async () => 42),
    };
    const agentMark = createAgentMarkClient<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry,
      tools: { sum: mockSumTool as any },
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
    expect((result.tools as any)["web-search"]).toBeDefined();
  });
});


