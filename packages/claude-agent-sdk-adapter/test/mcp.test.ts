import { describe, it, expect, vi } from "vitest";
import {
  createAgentMarkMcpServer,
  toClaudeAgentMcpServer,
} from "../src/mcp/agentmark-mcp-bridge";
import type { AgentMarkToolDefinition } from "../src/types";

describe("MCP Bridge", () => {
  describe("createAgentMarkMcpServer", () => {
    it("should create an MCP server configuration from tools", () => {
      const tools: AgentMarkToolDefinition[] = [
        {
          name: "search",
          description: "Search for information",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
            },
            required: ["query"],
          },
          execute: vi.fn(async () => ({ results: [] })),
        },
      ];

      const serverConfig = createAgentMarkMcpServer("test-server", tools);

      expect(serverConfig.name).toBe("test-server");
      expect(serverConfig.version).toBe("1.0.0"); // Default package version
      expect(serverConfig.tools).toHaveLength(1);
      expect(serverConfig.tools[0].name).toBe("search");
      expect(serverConfig.tools[0].description).toBe("Search for information");
    });

    it("should accept custom version option", () => {
      const tools: AgentMarkToolDefinition[] = [
        {
          name: "test",
          description: "Test tool",
          parameters: { type: "object", properties: {} },
          execute: vi.fn(async () => ({})),
        },
      ];

      const serverConfig = createAgentMarkMcpServer("test-server", tools, {
        version: "2.5.0",
      });

      expect(serverConfig.version).toBe("2.5.0");
    });

    it("should store tool parameters from definition", () => {
      const inputSchema = {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results" },
        },
        required: ["query"],
      };

      const tools: AgentMarkToolDefinition[] = [
        {
          name: "search",
          description: "Search",
          parameters: inputSchema,
          execute: async () => ({}),
        },
      ];

      const serverConfig = createAgentMarkMcpServer("test-server", tools);

      expect(serverConfig.tools[0].parameters).toEqual(inputSchema);
    });
  });

  describe("toClaudeAgentMcpServer", () => {
    it("should convert MCP server config to Claude Agent SDK format", () => {
      const tools: AgentMarkToolDefinition[] = [
        {
          name: "tool1",
          description: "First tool",
          parameters: { type: "object", properties: {} },
          execute: async () => ({}),
        },
        {
          name: "tool2",
          description: "Second tool",
          parameters: { type: "object", properties: {} },
          execute: async () => ({}),
        },
      ];

      const serverConfig = createAgentMarkMcpServer("test-server", tools);
      const claudeConfig = toClaudeAgentMcpServer(serverConfig);

      // SDK MCP servers have type 'sdk' and an 'instance' property
      expect(claudeConfig.type).toBe("sdk");
      expect(claudeConfig.instance).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty tools array", () => {
      const serverConfig = createAgentMarkMcpServer("empty-server", []);

      expect(serverConfig.tools).toHaveLength(0);
    });

    it("should handle tools with complex nested schemas", () => {
      const complexSchema = {
        type: "object" as const,
        properties: {
          nested: {
            type: "object",
            properties: {
              deep: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
      };

      const tools: AgentMarkToolDefinition[] = [
        {
          name: "complex",
          description: "Complex tool",
          parameters: complexSchema,
          execute: async () => ({}),
        },
      ];

      const serverConfig = createAgentMarkMcpServer("test-server", tools);
      expect(serverConfig.tools[0].parameters).toEqual(complexSchema);
    });

    it("should store execute function from tool definition", () => {
      const mockExecute = vi.fn(async () => ({ result: "success" }));

      const tools: AgentMarkToolDefinition[] = [
        {
          name: "test-tool",
          description: "Test",
          parameters: { type: "object", properties: {} },
          execute: mockExecute,
        },
      ];

      const serverConfig = createAgentMarkMcpServer("test-server", tools);
      expect(serverConfig.tools[0].execute).toBe(mockExecute);
    });
  });
});
