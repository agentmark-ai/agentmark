import { describe, it, expect, afterEach } from "vitest";
import {
  parseMcpUri,
  interpolateEnvInObject,
  normalizeToolsMap,
} from "../src/mcp";
import { TextSettingsConfig } from "../src/schemas";

describe("MCP helpers", () => {
  describe("parseMcpUri", () => {
    it("parses valid URIs", () => {
      expect(parseMcpUri("mcp://server/tool")).toEqual({
        server: "server",
        tool: "tool",
      });

      expect(parseMcpUri("mcp://playwright/browser")).toEqual({
        server: "playwright",
        tool: "browser",
      });

      expect(parseMcpUri("mcp://s/a/b")).toEqual({
        server: "s",
        tool: "a/b",
      });
    });

    it("throws for invalid URIs", () => {
      expect(() => parseMcpUri("")).toThrow();
      expect(() => parseMcpUri("http://x")).toThrow();
      expect(() => parseMcpUri("mcp://onlyserver"))
        .toThrow();
      expect(() => parseMcpUri("mcp:///tool"))
        .toThrow();
      expect(() => parseMcpUri("mcp://server/"))
        .toThrow();
    });
  });

  describe("interpolateEnvInObject", () => {
    afterEach(() => {
      delete process.env.TEST_TOKEN;
    });

    it("replaces env('VAR') strings deeply", () => {
      process.env.TEST_TOKEN = "secret";
      const input = {
        a: "env('TEST_TOKEN')",
        b: ["x", { y: "env(\"TEST_TOKEN\")" }],
        c: { d: "keep" },
      };
      const out = interpolateEnvInObject(input);
      expect(out).toEqual({
        a: "secret",
        b: ["x", { y: "secret" }],
        c: { d: "keep" },
      });
    });

    it("throws in strict mode when missing", () => {
      const input = { a: "env('MISSING_VAR')" };
      expect(() => interpolateEnvInObject(input)).toThrow();
    });

    it("does not throw in non-strict mode when missing", () => {
      const input = { a: "env('MISSING_VAR')" };
      const out = interpolateEnvInObject(input, { strict: false });
      expect(out).toEqual({ a: "env('MISSING_VAR')" });
    });
  });

  describe("normalizeToolsMap", () => {
    it("normalizes MCP and inline tools", () => {
      const out = normalizeToolsMap({
        search: "mcp://server-1/web-search",
        sum: { description: "Add", parameters: {} },
      });
      expect(out).toEqual([
        { alias: "search", kind: "mcp", value: "mcp://server-1/web-search" },
        { alias: "sum", kind: "inline", value: { description: "Add", parameters: {} } },
      ]);
    });

    it("throws for invalid entries", () => {
      // @ts-expect-error invalid on purpose
      expect(() => normalizeToolsMap({ bad: 123 })).toThrow();
    });
  });
});

describe("TextSettingsConfig tools union", () => {
  it("accepts string (MCP URI) and inline objects", () => {
    const parsed = TextSettingsConfig.parse({
      model_name: "m",
      tools: {
        search: "mcp://server/tool",
        inline: { description: "X", parameters: {} },
      },
    });
    expect(parsed.tools).toBeDefined();
    expect(parsed.tools!.search).toBe("mcp://server/tool");
    // @ts-expect-error runtime check
    expect(parsed.tools!.inline.description).toBe("X");
  });

  it("rejects invalid tool shapes", () => {
    expect(() =>
      TextSettingsConfig.parse({ model_name: "m", tools: { bad: 1 } })
    ).toThrow();
  });
});


