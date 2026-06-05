/**
 * Direct unit tests for the REAL MCPClientManager.
 *
 * The existing test/mcp.test.ts fully MOCKS this class, so the production
 * implementation (server-config translation, env interpolation, lazy
 * `@mastra/mcp` import, tool caching, error paths) was previously untested.
 *
 * `@mastra/mcp` is dynamically imported inside createClient(); we mock it so
 * no real MCP SDK is required and so we can capture the constructor args the
 * manager passes through.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

// Captured constructor calls + scripted getTools behavior for the mocked
// MCPClient. The mock is hoisted, so it reads from this module-level object.
const mcpState: {
  constructorArgs: Array<{ servers: Record<string, any> }>;
  getToolsCalls: number;
  getToolsImpl: () => Promise<Record<string, unknown>>;
} = {
  constructorArgs: [],
  getToolsCalls: 0,
  getToolsImpl: async () => ({ "server-1_search": { id: "search" } }),
};

vi.mock("@mastra/mcp", () => {
  class MCPClient {
    constructor(config: { servers: Record<string, any> }) {
      mcpState.constructorArgs.push(config);
    }
    async getTools() {
      mcpState.getToolsCalls += 1;
      return mcpState.getToolsImpl();
    }
  }
  return { MCPClient };
});

import { MCPClientManager } from "../src/mcp/mcp-client-manager";

beforeEach(() => {
  mcpState.constructorArgs = [];
  mcpState.getToolsCalls = 0;
  mcpState.getToolsImpl = async () => ({ "server-1_search": { id: "search" } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MCPClientManager — getNamespacedTools", () => {
  it("returns the client's tools when given a url server config", async () => {
    const mgr = new MCPClientManager({
      "server-1": { url: "https://example.com/mcp" },
    });

    const tools = await mgr.getNamespacedTools();

    expect(tools).toEqual({ "server-1_search": { id: "search" } });
  });

  it("caches tools so a second call does not re-create the client or re-fetch", async () => {
    const mgr = new MCPClientManager({
      "server-1": { url: "https://example.com/mcp" },
    });

    const first = await mgr.getNamespacedTools();
    const second = await mgr.getNamespacedTools();

    expect(second).toBe(first);
    expect(mcpState.constructorArgs.length).toBe(1);
    expect(mcpState.getToolsCalls).toBe(1);
  });

  it("does NOT populate the cache when getTools rejects, and retries on the next call", async () => {
    let attempt = 0;
    mcpState.getToolsImpl = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("transient connect failure");
      return { "server-1_search": { id: "search" } };
    };

    const mgr = new MCPClientManager({
      "server-1": { url: "https://example.com/mcp" },
    });

    await expect(mgr.getNamespacedTools()).rejects.toThrow(
      "transient connect failure"
    );

    // Cache was cleared on failure, so the second call retries getTools.
    const tools = await mgr.getNamespacedTools();
    expect(tools).toEqual({ "server-1_search": { id: "search" } });
    expect(mcpState.getToolsCalls).toBe(2);
  });
});

describe("MCPClientManager — url server config translation", () => {
  it("converts a 'url' config into { url: URL } passed to MCPClient", async () => {
    const mgr = new MCPClientManager({
      "server-1": { url: "https://example.com/mcp" },
    });

    await mgr.getNamespacedTools();

    expect(mcpState.constructorArgs).toEqual([
      { servers: { "server-1": { url: new URL("https://example.com/mcp") } } },
    ]);
  });

  it("converts an uppercase 'URL' config into { url: URL } passed to MCPClient", async () => {
    const mgr = new MCPClientManager({
      "server-1": { URL: "https://example.com/mcp" } as any,
    });

    await mgr.getNamespacedTools();

    expect(mcpState.constructorArgs[0].servers["server-1"]).toEqual({
      url: new URL("https://example.com/mcp"),
    });
  });

  it("throws when a url config carries an unsupported extra key", async () => {
    const mgr = new MCPClientManager({
      "server-1": { url: "https://example.com/mcp", headers: { a: "b" } } as any,
    });

    await expect(mgr.getNamespacedTools()).rejects.toThrow(
      /Unsupported MCP server options for 'server-1': headers/
    );
  });
});

describe("MCPClientManager — stdio server config translation", () => {
  it("passes command, args, and env through to MCPClient", async () => {
    const mgr = new MCPClientManager({
      "server-1": {
        command: "node",
        args: ["server.js"],
        env: { TOKEN: "abc" },
      },
    });

    await mgr.getNamespacedTools();

    expect(mcpState.constructorArgs[0].servers["server-1"]).toEqual({
      command: "node",
      args: ["server.js"],
      env: { TOKEN: "abc" },
    });
  });

  it("throws when a stdio config carries an unsupported extra key", async () => {
    const mgr = new MCPClientManager({
      "server-1": { command: "node", cwd: "/tmp" } as any,
    });

    await expect(mgr.getNamespacedTools()).rejects.toThrow(
      /Unsupported MCP server options for 'server-1': cwd/
    );
  });
});

describe("MCPClientManager — invalid config", () => {
  it("throws when a server has neither url nor command", async () => {
    const mgr = new MCPClientManager({
      "server-1": { foo: "bar" } as any,
    });

    await expect(mgr.getNamespacedTools()).rejects.toThrow(
      /Invalid MCP server config: expected 'url' or 'command'/
    );
  });
});

describe("MCPClientManager — env interpolation", () => {
  it("interpolates env('VAR') tokens in server config before passing to MCPClient", async () => {
    process.env.MCP_TEST_URL = "https://interpolated.example.com/mcp";
    try {
      const mgr = new MCPClientManager({
        "server-1": { url: "env('MCP_TEST_URL')" },
      });

      await mgr.getNamespacedTools();

      expect(mcpState.constructorArgs[0].servers["server-1"]).toEqual({
        url: new URL("https://interpolated.example.com/mcp"),
      });
    } finally {
      delete process.env.MCP_TEST_URL;
    }
  });

  it("interpolates env('VAR') tokens inside stdio env values", async () => {
    process.env.MCP_TEST_TOKEN = "secret-token";
    try {
      const mgr = new MCPClientManager({
        "server-1": {
          command: "node",
          env: { TOKEN: "env('MCP_TEST_TOKEN')" },
        },
      });

      await mgr.getNamespacedTools();

      expect(mcpState.constructorArgs[0].servers["server-1"].env).toEqual({
        TOKEN: "secret-token",
      });
    } finally {
      delete process.env.MCP_TEST_TOKEN;
    }
  });
});

describe("MCPClientManager — missing @mastra/mcp dependency", () => {
  it("throws a clear install error when the @mastra/mcp import fails", async () => {
    // Reset modules so we can re-mock @mastra/mcp to fail on import for this
    // case only, then import the manager fresh.
    vi.resetModules();
    vi.doMock("@mastra/mcp", () => {
      throw new Error("Cannot find module '@mastra/mcp'");
    });

    const { MCPClientManager: FreshManager } = await import(
      "../src/mcp/mcp-client-manager"
    );
    const mgr = new FreshManager({
      "server-1": { url: "https://example.com/mcp" },
    });

    await expect(mgr.getNamespacedTools()).rejects.toThrow(
      /@mastra\/mcp is not installed/
    );

    vi.resetModules();
  });
});
