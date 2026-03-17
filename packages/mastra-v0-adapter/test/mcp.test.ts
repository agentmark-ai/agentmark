import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import path from "path";
import { FileLoader } from "@agentmark-ai/loader-file";
import {
  createAgentMarkClient,
  MastraModelRegistry,
} from "../src";
import type { ToolsInput } from "@mastra/core/agent";
import { z } from "zod";
import { setupFixtures, cleanupFixtures, buildFixture } from "./setup-fixtures";

vi.mock("../src/mcp/mcp-client-manager", () => {
  class MockTool {
    id = "mock";
    description = "mock tool";
    inputSchema = {};
    outputSchema = undefined;
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
  let fileLoader: FileLoader;
  let tools: ToolsInput;

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
    modelRegistry = new MastraModelRegistry();
    modelRegistry.registerModels(
      "test-model",
      () =>
        ({
          name: "test-model",
        } as any)
    );

    tools = {
      sum: {
        id: "sum",
        description: "Add two numbers",
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        outputSchema: undefined,
        execute: async ({ a, b }: { a: number; b: number }) => a + b,
      },
    };
  });

  it("expands mcp://server/* wildcard to all matching tools", async () => {
    vi.resetModules();
    vi.doMock("../src/mcp/mcp-client-manager", () => {
      class MockTool {
        id = "mock";
        description = "mock tool";
        inputSchema = {};
        outputSchema = undefined;
        execute = vi.fn(async () => ({ ok: true }));
      }

      class MCPClientManager {
        async getNamespacedTools() {
          return {
            "server-1_tool-a": new MockTool(),
            "server-1_tool-b": new MockTool(),
            "server-2_tool-c": new MockTool(), // Different server — should NOT appear
          } as Record<string, unknown>;
        }
      }

      return { MCPClientManager };
    });

    // Create a fixture with a wildcard MCP URI
    const wildcardFixturePath = path.resolve(__dirname, "./fixtures/mcp-wildcard.prompt.mdx");
    const wildcardJsonPath = path.resolve(__dirname, "./fixtures/mcp-wildcard.prompt.json");
    const fs = await import("fs");
    fs.writeFileSync(
      wildcardFixturePath,
      `---
name: mcp-wildcard
text_config:
  model_name: test-model
  tools:
    - mcp://server-1/*
input_schema:
  type: object
  properties:
    userMessage:
      type: string
  required:
    - userMessage
---

<System>You are a helpful assistant.</System>
<User>{props.userMessage}</User>
`
    );

    // Build the MDX to JSON so FileLoader can find it
    await buildFixture(wildcardFixturePath);

    try {
      const {
        createAgentMarkClient: createClient,
        MastraModelRegistry: MR,
      } = await import("../src");

      const mr = new MR();
      mr.registerModels("test-model", () => ({ name: "test-model" } as any));

      const fl = new (await import("@agentmark-ai/loader-file")).FileLoader(
        path.resolve(__dirname, "./fixtures")
      );

      const agentMark = createClient({
        loader: fl,
        modelRegistry: mr,
        mcpServers: { "server-1": { url: "https://example.com/mcp" } },
      });

      const prompt = await agentMark.loadTextPrompt("mcp-wildcard.prompt.mdx" as any);
      const agent = await (prompt as any).formatAgent({ props: { userMessage: "hi" } });

      // Both server-1 tools should be included
      const agentTools = agent.tools as Record<string, unknown>;
      expect(agentTools["mcp://server-1/tool-a"]).toBeDefined();
      expect(agentTools["mcp://server-1/tool-b"]).toBeDefined();
      // Different server should NOT be included
      expect(agentTools["mcp://server-2/tool-c"]).toBeUndefined();
    } finally {
      fs.unlinkSync(wildcardFixturePath);
      if (fs.existsSync(wildcardJsonPath)) fs.unlinkSync(wildcardJsonPath);
      vi.resetModules();
    }
  });

  it("resolves MCP tools from URIs and returns them in tools map", async () => {
    const agentMark = createAgentMarkClient<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry,
      tools,
      mcpServers: {
        "server-1": { url: "https://example.com/mcp" },
      },
    });

    const prompt = await agentMark.loadTextPrompt("mcp-text.prompt.mdx");
    const agent = await prompt.formatAgent({ props: { userMessage: "hi" } });
    expect(agent.tools).toBeDefined();
    const agentTools = agent.tools as Record<string, unknown>;
    expect(agentTools["mcp://server-1/web-search"]).toBeDefined();
    expect(typeof (agentTools["mcp://server-1/web-search"] as { execute: unknown }).execute).toBe("function");
    expect(agentTools.sum).toBeDefined();
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
    } = await import("../src");

    const modelRegistry2 = new MR2();
    modelRegistry2.registerModels(
      "test-model",
      () => ({ name: "test-model" } as any)
    );
    const tools2 = {
      sum: {
        id: "sum",
        description: "Add two numbers",
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        outputSchema: undefined,
        execute: async ({ a, b }: { a: number; b: number }) => a + b,
      },
    };

    const agentMark = createClient2<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry: modelRegistry2,
      tools: tools2,
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
    } = await import("../src");

    const modelRegistry2 = new MR2();
    modelRegistry2.registerModels(
      "test-model",
      () => ({ name: "test" } as any)
    );

    const tools2 = {
      sum: {
        id: "sum",
        description: "Add two numbers",
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        outputSchema: undefined,
        execute: async ({ a, b }: { a: number; b: number }) => a + b,
      },
    };
    const agentMark = createClient2<TestPromptTypes>({
      loader: fileLoader,
      modelRegistry: modelRegistry2,
      tools: tools2,
      mcpServers: { "server-1": { url: "https://example.com/mcp" } },
    });

    const prompt = await agentMark.loadTextPrompt("mcp-text.prompt.mdx");
    await expect(
      prompt.formatAgent({ props: { userMessage: "hi" } })
    ).rejects.toThrow(/MCP tool not found: server-1\/web-search/);
  });
});
