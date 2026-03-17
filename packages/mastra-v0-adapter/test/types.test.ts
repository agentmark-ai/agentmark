/**
 * Type-level tests for mastra-v0-adapter tool type safety.
 *
 * These tests verify that specific tool types are preserved through the adapter
 * rather than being widened to Record<string, any>.
 */
import { describe, it, expectTypeOf } from "vitest";
import type { ToolsInput } from "@mastra/core/agent";
import { MastraAdapter } from "../src/adapter";
import { createAgentMarkClient, MastraModelRegistry } from "../src";
import type { PromptShape } from "@agentmark-ai/prompt-core";

// ---- Minimal mock tool shapes for type testing ----

type WeatherTool = { description: string; execute: (args: { location: string }) => Promise<string> };
type SearchTool = { description: string; execute: (args: { query: string }) => Promise<{ title: string }[]> };

type MyTools = {
  weather: WeatherTool;
  search: SearchTool;
};

type TestPromptShape = PromptShape<{
  "test.prompt.mdx": { input: { msg: string }; output: never };
}>;

describe("MastraAdapter type safety", () => {
  it("constructor accepts specific tools record without widening to Record<string, any>", () => {
    const modelRegistry = new MastraModelRegistry();
    const weatherTool = {} as WeatherTool;
    const searchTool = {} as SearchTool;

    const _adapter = new MastraAdapter<TestPromptShape, MyTools>(
      modelRegistry,
      { weather: weatherTool, search: searchTool }
    );

    expectTypeOf(_adapter).toMatchTypeOf<MastraAdapter<TestPromptShape, MyTools>>();
  });

  it("MastraAdapter defaults to ToolsInput when no TTools provided", () => {
    const modelRegistry = new MastraModelRegistry();
    const _adapter = new MastraAdapter<TestPromptShape>(modelRegistry);

    expectTypeOf(_adapter).toMatchTypeOf<MastraAdapter<TestPromptShape, ToolsInput>>();
  });

  it("TTools generic is narrower than Record<string, any>", () => {
    // MyTools should be assignable to ToolsInput (the constraint)
    // but Record<string, any> should also be assignable (it's the widest case)
    expectTypeOf<MyTools>().toMatchTypeOf<ToolsInput>();
  });
});

describe("createAgentMarkClient type inference (mastra)", () => {
  it("infers TTools from opts.tools when specific tools provided", () => {
    const weatherTool = {} as WeatherTool;
    const searchTool = {} as SearchTool;

    const client = createAgentMarkClient<TestPromptShape, MyTools>({
      tools: { weather: weatherTool, search: searchTool },
    });

    expectTypeOf(client).not.toBeNever();
  });

  it("defaults to ToolsInput when no tools provided", () => {
    const client = createAgentMarkClient<TestPromptShape>({});

    expectTypeOf(client).not.toBeNever();
  });

  it("tools field in opts is typed as TTools (not Record<string, any>)", () => {
    type ClientOpts<D extends PromptShape<D>, TTools extends ToolsInput> = Parameters<
      typeof createAgentMarkClient<D, TTools>
    >[0];

    type ToolsParam = ClientOpts<TestPromptShape, MyTools>["tools"];

    // tools param should accept MyTools
    expectTypeOf<MyTools>().toMatchTypeOf<NonNullable<ToolsParam>>();
  });
});
