import { describe, it, expect, afterEach } from "vitest";
import {
  parseMcpUri,
  interpolateEnvInObject,
  normalizeToolsList,
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

  describe("normalizeToolsList", () => {
    it("normalizes MCP URIs and plain tool names", () => {
      const out = normalizeToolsList([
        "mcp://server-1/web-search",
        "get_weather",
      ]);
      expect(out).toEqual([
        { name: "mcp://server-1/web-search", kind: "mcp", server: "server-1", tool: "web-search" },
        { name: "get_weather", kind: "plain" },
      ]);
    });

    it("handles empty array", () => {
      expect(normalizeToolsList([])).toEqual([]);
    });

    it("throws for non-string entries", () => {
      // @ts-expect-error invalid on purpose
      expect(() => normalizeToolsList([123])).toThrow();
    });
  });
});

describe("TextSettingsConfig tools array", () => {
  it("accepts an array of tool name strings and MCP URIs", () => {
    const parsed = TextSettingsConfig.parse({
      model_name: "m",
      tools: ["mcp://server/tool", "get_weather"],
    });
    expect(parsed.tools).toBeDefined();
    expect(parsed.tools).toEqual(["mcp://server/tool", "get_weather"]);
  });

  it("rejects non-array tools", () => {
    expect(() =>
      TextSettingsConfig.parse({ model_name: "m", tools: { bad: 1 } })
    ).toThrow();
  });

  it("rejects arrays with non-string elements", () => {
    expect(() =>
      TextSettingsConfig.parse({ model_name: "m", tools: [123] })
    ).toThrow();
  });
});
