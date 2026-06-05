import { describe, it, expect, vi } from "vitest";
import { McpServerRegistry } from "./mcp-registry";

describe("McpServerRegistry – cache eviction on failure", () => {
  it("retries getTool after a failed resolution instead of caching the rejection", async () => {
    // Factory is unused — test overrides createClient directly.
    const registry = new McpServerRegistry(async () => {
      throw new Error("factory-unused");
    });
    registry.register("test-server", { url: "https://example.com/mcp" });

    let callCount = 0;
    const mockTool = { description: "a tool", parameters: {}, execute: vi.fn() };

    (registry as any).createClient = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("transient connection error");
      }
      return {
        tools: async () => ({ "my-tool": mockTool }),
      };
    });

    await expect(registry.getTool("test-server", "my-tool")).rejects.toThrow(
      "transient connection error"
    );

    const resolved = await registry.getTool("test-server", "my-tool");
    expect(resolved).toBe(mockTool);
    expect(callCount).toBe(2);
  });

  it("retries getAllTools after a failed resolution", async () => {
    const registry = new McpServerRegistry(async () => {
      throw new Error("factory-unused");
    });
    registry.register("test-server", { url: "https://example.com/mcp" });

    let callCount = 0;
    const toolsMap = {
      "tool-a": { description: "a", parameters: {}, execute: vi.fn() },
    };

    (registry as any).createClient = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("transient error");
      }
      return { tools: async () => toolsMap };
    });

    await expect(registry.getAllTools("test-server")).rejects.toThrow(
      "transient error"
    );

    const all = await registry.getAllTools("test-server");
    expect(all).toBe(toolsMap);
    expect(callCount).toBe(2);
  });
});

describe("McpServerRegistry – registration", () => {
  it("registers a server via register and reports it through has/getConfig", () => {
    const registry = new McpServerRegistry(async () => ({
      tools: async () => ({}),
    }));
    const config = { url: "https://example.com/mcp" };

    registry.register("docs", config);

    expect(registry.has("docs")).toBe(true);
    expect(registry.has("missing")).toBe(false);
    expect(registry.getConfig("docs")).toEqual(config);
    expect(registry.getConfig("missing")).toBeUndefined();
  });

  it("registers multiple servers via registerServers", () => {
    const registry = new McpServerRegistry(async () => ({
      tools: async () => ({}),
    }));

    registry.registerServers({
      a: { url: "https://a.example.com/mcp" },
      b: { command: "node", args: ["server.js"] },
    });

    expect(registry.has("a")).toBe(true);
    expect(registry.has("b")).toBe(true);
    expect(registry.getConfig("b")).toEqual({
      command: "node",
      args: ["server.js"],
    });
  });
});

describe("McpServerRegistry – createClient factory dispatch", () => {
  it("throws listing available servers when resolving an unregistered server", async () => {
    const registry = new McpServerRegistry(async () => ({
      tools: async () => ({}),
    }));
    registry.register("known", { url: "https://known.example.com/mcp" });

    await expect(registry.getClient("ghost")).rejects.toThrow(
      "MCP server 'ghost' not registered. Available servers: known"
    );
  });

  it("invokes the factory with the url config for a url server", async () => {
    const tool = { name: "t" };
    const factory = vi.fn(async () => ({ tools: async () => ({ t: tool }) }));
    const registry = new McpServerRegistry(factory);
    registry.register("docs", { url: "https://example.com/mcp" });

    await registry.getClient("docs");

    expect(factory).toHaveBeenCalledWith({ url: "https://example.com/mcp" });
  });

  it("invokes the factory with the command config for a stdio server", async () => {
    const factory = vi.fn(async () => ({ tools: async () => ({}) }));
    const registry = new McpServerRegistry(factory);
    registry.register("local", { command: "node", args: ["mcp.js"] });

    await registry.getClient("local");

    expect(factory).toHaveBeenCalledWith({
      command: "node",
      args: ["mcp.js"],
    });
  });

  it("throws Invalid MCP server config when the config has neither url nor command", async () => {
    const factory = vi.fn(async () => ({ tools: async () => ({}) }));
    const registry = new McpServerRegistry(factory);
    // Bypass the typed register signature to register a malformed config.
    (registry as any).servers.set("broken", { foo: "bar" });

    await expect(registry.getClient("broken")).rejects.toThrow(
      "Invalid MCP server config: expected 'url' or 'command'"
    );
    expect(factory).not.toHaveBeenCalled();
  });

  it("caches the in-flight client so the factory runs only once across concurrent getClient calls", async () => {
    const factory = vi.fn(async () => ({ tools: async () => ({}) }));
    const registry = new McpServerRegistry(factory);
    registry.register("docs", { url: "https://example.com/mcp" });

    const [first, second] = await Promise.all([
      registry.getClient("docs"),
      registry.getClient("docs"),
    ]);

    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("interpolates env() placeholders in the config before handing it to the factory", async () => {
    const factory = vi.fn(async () => ({ tools: async () => ({}) }));
    const registry = new McpServerRegistry(factory);
    process.env.MCP_TEST_TOKEN = "secret-token-123";
    registry.register("docs", {
      url: "https://example.com/mcp",
      headers: { Authorization: "env('MCP_TEST_TOKEN')" },
    });

    try {
      await registry.getClient("docs");
    } finally {
      delete process.env.MCP_TEST_TOKEN;
    }

    expect(factory).toHaveBeenCalledWith({
      url: "https://example.com/mcp",
      headers: { Authorization: "secret-token-123" },
    });
  });
});

describe("McpServerRegistry – getTool / getAllTools caching", () => {
  it("serves getTool from the tools cache without re-invoking the client on a second call", async () => {
    const tool = { name: "search" };
    const toolsFn = vi.fn(async () => ({ search: tool }));
    const factory = vi.fn(async () => ({ tools: toolsFn }));
    const registry = new McpServerRegistry(factory);
    registry.register("docs", { url: "https://example.com/mcp" });

    const first = await registry.getTool("docs", "search");
    const second = await registry.getTool("docs", "search");

    expect(first).toBe(tool);
    expect(second).toBe(tool);
    expect(toolsFn).toHaveBeenCalledTimes(1);
  });

  it("throws listing available tools when the requested tool is absent from the server", async () => {
    const factory = vi.fn(async () => ({
      tools: async () => ({ alpha: { name: "alpha" }, beta: { name: "beta" } }),
    }));
    const registry = new McpServerRegistry(factory);
    registry.register("docs", { url: "https://example.com/mcp" });

    await expect(registry.getTool("docs", "missing")).rejects.toThrow(
      "MCP tool not found: docs/missing. Available tools: alpha, beta"
    );
  });

  it("serves getAllTools from the cache without re-invoking the client on a second call", async () => {
    const toolsMap = { a: { name: "a" }, b: { name: "b" } };
    const toolsFn = vi.fn(async () => toolsMap);
    const factory = vi.fn(async () => ({ tools: toolsFn }));
    const registry = new McpServerRegistry(factory);
    registry.register("docs", { url: "https://example.com/mcp" });

    const first = await registry.getAllTools("docs");
    const second = await registry.getAllTools("docs");

    expect(first).toEqual(toolsMap);
    expect(second).toBe(first);
    expect(toolsFn).toHaveBeenCalledTimes(1);
  });
});

describe("McpServerRegistry – getClient failure eviction", () => {
  it("evicts the cached client and re-invokes the factory after a connection failure", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let attempt = 0;
    const factory = vi.fn(async () => {
      attempt++;
      if (attempt === 1) throw new Error("connect failed");
      return { tools: async () => ({}) };
    });
    const registry = new McpServerRegistry(factory);
    registry.register("docs", { url: "https://example.com/mcp" });

    await expect(registry.getClient("docs")).rejects.toThrow("connect failed");
    // Second call must hit the factory again, proving the rejected promise
    // was evicted rather than cached.
    await registry.getClient("docs");

    expect(factory).toHaveBeenCalledTimes(2);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[McpServerRegistry] Failed to connect to MCP server 'docs':",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});
