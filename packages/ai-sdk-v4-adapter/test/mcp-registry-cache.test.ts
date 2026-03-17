import { describe, it, expect, vi } from "vitest";
import { McpServerRegistry } from "../src/mcp/mcp-server-registry";

describe("McpServerRegistry – cache eviction on failure", () => {
  it("retries getTool after a failed resolution instead of caching the rejection", async () => {
    const registry = new McpServerRegistry();
    registry.register("test-server", { url: "https://example.com/mcp" });

    let callCount = 0;
    const mockTool = { description: "a tool", parameters: {}, execute: vi.fn() };

    // Patch createClient to fail on the first call and succeed on the second
    (registry as any).createClient = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("transient connection error");
      }
      return {
        tools: async () => ({ "my-tool": mockTool }),
      };
    });

    // First call should fail
    await expect(registry.getTool("test-server", "my-tool")).rejects.toThrow(
      "transient connection error"
    );

    // Second call should succeed — cache was NOT permanently poisoned
    const resolved = await registry.getTool("test-server", "my-tool");
    expect(resolved).toBe(mockTool);
    expect(callCount).toBe(2);
  });

  it("retries getAllTools after a failed resolution", async () => {
    const registry = new McpServerRegistry();
    registry.register("test-server", { url: "https://example.com/mcp" });

    let callCount = 0;
    const toolsMap = { "tool-a": { description: "a", parameters: {}, execute: vi.fn() } };

    (registry as any).createClient = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("transient error");
      }
      return { tools: async () => toolsMap };
    });

    // First call fails
    await expect(registry.getAllTools("test-server")).rejects.toThrow("transient error");

    // Second call succeeds
    const all = await registry.getAllTools("test-server");
    expect(all).toBe(toolsMap);
    expect(callCount).toBe(2);
  });
});
