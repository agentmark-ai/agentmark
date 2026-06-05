import { describe, it, expect, vi } from "vitest";
import {
  applyParamMap,
  buildTelemetryMetadata,
  BaseAdapter,
  type ParamMap,
} from "./base-adapter";
import type { McpClientFactory } from "./mcp-registry";

describe("applyParamMap", () => {
  it("returns an empty object when input is undefined", () => {
    expect(applyParamMap(undefined, { foo: "bar" })).toEqual({});
  });

  it("renames a key when the entry is a string", () => {
    const result = applyParamMap({ max_tokens: 100 }, { max_tokens: "maxTokens" });
    expect(result).toEqual({ maxTokens: 100 });
  });

  it("drops the field when the entry is null", () => {
    const result = applyParamMap(
      { temperature: 0.5, unsupported: 1 },
      { temperature: "temperature", unsupported: null }
    );
    expect(result).toEqual({ temperature: 0.5 });
  });

  it("drops the field when the key is not present in the map (entry undefined)", () => {
    const result = applyParamMap({ known: 1, unknown: 2 }, { known: "known" });
    expect(result).toEqual({ known: 1 });
  });

  it("skips a field whose value is undefined", () => {
    const result = applyParamMap(
      { a: undefined, b: 2 },
      { a: "a", b: "b" }
    );
    expect(result).toEqual({ b: 2 });
  });

  it("renames and transforms the value when the entry is an object", () => {
    const map: ParamMap = {
      max_calls: { key: "stopWhen", transform: (v) => `stepCountIs(${v})` },
    };
    const result = applyParamMap({ max_calls: 3 }, map);
    expect(result).toEqual({ stopWhen: "stepCountIs(3)" });
  });
});

describe("buildTelemetryMetadata", () => {
  it("returns undefined when telemetry is undefined", () => {
    expect(
      buildTelemetryMetadata(undefined, { a: 1 }, "my-prompt")
    ).toBeUndefined();
  });

  it("merges telemetry with prompt_name and stringified props", () => {
    const result = buildTelemetryMetadata(
      { isEnabled: true },
      { userId: "u1" },
      "greeting"
    );
    expect(result).toEqual({
      isEnabled: true,
      metadata: {
        prompt_name: "greeting",
        props: JSON.stringify({ userId: "u1" }),
      },
    });
  });

  it("merges existing telemetry.metadata with prompt fields", () => {
    const result = buildTelemetryMetadata(
      { isEnabled: true, metadata: { traceId: "t1" } },
      { x: 2 },
      "p"
    );
    expect(result).toEqual({
      isEnabled: true,
      metadata: {
        traceId: "t1",
        prompt_name: "p",
        props: JSON.stringify({ x: 2 }),
      },
    });
  });

  it("includes the agentmarkMeta block when provided", () => {
    const result = buildTelemetryMetadata(
      { isEnabled: true },
      {},
      "p",
      { version: "1.2.3", env: "prod" }
    );
    expect(result).toEqual({
      isEnabled: true,
      metadata: {
        prompt_name: "p",
        props: JSON.stringify({}),
        version: "1.2.3",
        env: "prod",
      },
    });
  });
});

type FakeTool = { name: string };

/**
 * Concrete subclass exposing the protected resolveTools so we can test the
 * shared resolution logic directly.
 */
class TestAdapter extends BaseAdapter<FakeTool> {
  public resolve(toolNames: string[]): Promise<Record<string, FakeTool>> {
    return this.resolveTools(toolNames);
  }
}

describe("BaseAdapter.resolveTools", () => {
  const unusedFactory: McpClientFactory<FakeTool> = async () => {
    throw new Error("factory should not be called");
  };

  it("resolves a plain tool name found in the tools record", async () => {
    const weather: FakeTool = { name: "weather" };
    const adapter = new TestAdapter(unusedFactory, { weather });

    const resolved = await adapter.resolve(["weather"]);

    expect(resolved).toEqual({ weather });
  });

  it("throws listing available tools when a plain name is missing", async () => {
    const adapter = new TestAdapter(unusedFactory, {
      weather: { name: "weather" },
      clock: { name: "clock" },
    });

    await expect(adapter.resolve(["unknown"])).rejects.toThrow(
      "Tool 'unknown' referenced in prompt config was not found in the provided tools record. Available tools: weather, clock"
    );
  });

  it("throws with '(none)' available when the tools record is undefined", async () => {
    const adapter = new TestAdapter(unusedFactory);

    await expect(adapter.resolve(["whatever"])).rejects.toThrow(
      "Available tools: (none)"
    );
  });

  it("resolves a single mcp:// tool via the client factory", async () => {
    const remoteTool: FakeTool = { name: "search" };
    const factory: McpClientFactory<FakeTool> = vi.fn(async () => ({
      tools: async () => ({ search: remoteTool, other: { name: "other" } }),
    }));
    const adapter = new TestAdapter(factory, undefined, {
      docs: { url: "https://example.com/mcp" },
    });

    const resolved = await adapter.resolve(["mcp://docs/search"]);

    expect(resolved).toEqual({ search: remoteTool });
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/mcp" })
    );
  });

  it("expands an mcp://server/* wildcard to all tools from the server", async () => {
    const toolA: FakeTool = { name: "a" };
    const toolB: FakeTool = { name: "b" };
    const factory: McpClientFactory<FakeTool> = async () => ({
      tools: async () => ({ a: toolA, b: toolB }),
    });
    const adapter = new TestAdapter(factory, undefined, {
      docs: { url: "https://example.com/mcp" },
    });

    const resolved = await adapter.resolve(["mcp://docs/*"]);

    expect(resolved).toEqual({ a: toolA, b: toolB });
  });
});
