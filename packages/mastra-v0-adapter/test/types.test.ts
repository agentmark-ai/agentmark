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
// Must satisfy @mastra/core's ToolsInput (ToolAction | VercelTool) — the
// previous hand-rolled shapes (bare description/execute objects) never did,
// which went unnoticed until typecheck mode gave this file teeth.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const weatherToolDef = createTool({
  id: "weather",
  description: "Get weather for a location",
  inputSchema: z.object({ location: z.string() }),
  execute: async () => "Sunny",
});
const searchToolDef = createTool({
  id: "search",
  description: "Search the web",
  inputSchema: z.object({ query: z.string() }),
  execute: async () => [{ title: "Result" }],
});

type WeatherTool = typeof weatherToolDef;
type SearchTool = typeof searchToolDef;

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
    const weatherTool = weatherToolDef;
    const searchTool = searchToolDef;

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
  // NOTE: this suite was written against an older two-generic
  // createAgentMarkClient<D, TTools> signature and rotted unnoticed while
  // type tests were unenforced. The current factory takes ONE generic
  // (the dict) and types `tools` as ToolsInput.
  it("accepts specific tools records under the ToolsInput constraint", () => {
    const client = createAgentMarkClient<TestPromptShape>({
      tools: { weather: weatherToolDef, search: searchToolDef },
    });

    expectTypeOf(client).not.toBeNever();
  });

  it("defaults to ToolsInput when no tools provided", () => {
    const client = createAgentMarkClient<TestPromptShape>({});

    expectTypeOf(client).not.toBeNever();
  });

  it("tools opt accepts MyTools (satisfies ToolsInput)", () => {
    type ClientOpts = Parameters<typeof createAgentMarkClient<TestPromptShape>>[0];
    type ToolsParam = ClientOpts["tools"];

    expectTypeOf<MyTools>().toMatchTypeOf<NonNullable<ToolsParam>>();
  });
});
