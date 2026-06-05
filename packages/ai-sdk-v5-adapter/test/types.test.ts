/**
 * Type-level tests for ai-sdk-v5-adapter tool type safety.
 *
 * These tests verify that specific tool types are preserved through the adapter
 * rather than being widened to Record<string, Tool> or Record<string, any>.
 */
import { describe, it, expectTypeOf } from "vitest";
import { tool, type Tool } from "ai";
import { z } from "zod";
import {
  VercelAIAdapter,
  VercelAIModelRegistry,
  VercelAITextParams,
  VercelAIObjectParams,
} from "../src/adapter";
import { createAgentMarkClient } from "../src";
import type { PromptShape } from "@agentmark-ai/prompt-core";

// ---- Real tool definitions for type testing ----

type WeatherTool = Tool<{ location: string }, string>;
type SearchTool = Tool<{ query: string }, { title: string; url: string }[]>;

type MyTools = {
  weather: WeatherTool;
  search: SearchTool;
};

type TestPromptShape = PromptShape<{
  "test.prompt.mdx": { input: { msg: string }; output: never };
}>;

describe("VercelAIAdapter type safety (v5)", () => {
  it("constructor accepts specific tools record without widening", () => {
    const modelRegistry = new VercelAIModelRegistry();
    const weatherTool = tool({
      description: "Get weather for a location",
      inputSchema: z.object({ location: z.string() }),
      execute: async ({ location }) => `Sunny in ${location}`,
    });
    const searchTool = tool({
      description: "Search the web",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => [{ title: `Result for ${query}`, url: "https://example.com" }],
    });

    // Should compile: specific tool record matches TTools
    const _adapter = new VercelAIAdapter<TestPromptShape, MyTools>(
      modelRegistry,
      { weather: weatherTool, search: searchTool }
    );

    expectTypeOf(_adapter).toMatchTypeOf<VercelAIAdapter<TestPromptShape, MyTools>>();
  });

  it("VercelAIAdapter defaults to Record<string, Tool> when no TTools provided", () => {
    const modelRegistry = new VercelAIModelRegistry();
    const _adapter = new VercelAIAdapter<TestPromptShape>(modelRegistry);

    expectTypeOf(_adapter).toMatchTypeOf<VercelAIAdapter<TestPromptShape, Record<string, Tool>>>();
  });

  it("adaptText return type is VercelAITextParams<TTools> with specific tools", () => {
    const modelRegistry = new VercelAIModelRegistry();
    const weatherTool = tool({
      description: "Get weather for a location",
      inputSchema: z.object({ location: z.string() }),
      execute: async ({ location }) => `Sunny in ${location}`,
    });
    const searchTool = tool({
      description: "Search the web",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => [{ title: `Result for ${query}`, url: "https://example.com" }],
    });

    const adapter = new VercelAIAdapter<TestPromptShape, MyTools>(
      modelRegistry,
      { weather: weatherTool, search: searchTool }
    );

    // The return type should be VercelAITextParams<MyTools>, not VercelAITextParams<Record<string, Tool>>
    // adaptText is no longer generic (the per-key param was phantom on the
    // interface); per-key typing flows through the prompt classes instead.
    type AdaptTextReturn = Awaited<ReturnType<typeof adapter.adaptText>>;

    expectTypeOf<AdaptTextReturn>().toMatchTypeOf<VercelAITextParams<MyTools>>();
  });

  it("VercelAITextParams tools field is typed with TTools when specific tools provided", () => {
    // When TTools = MyTools, tools field should be MyTools
    type Params = VercelAITextParams<MyTools>;
    type ToolsField = Params["tools"];

    expectTypeOf<ToolsField>().toEqualTypeOf<MyTools>();
  });

  it("VercelAITextParams tools field defaults to Record<string, Tool>", () => {
    type Params = VercelAITextParams<Record<string, Tool>>;
    type ToolsField = Params["tools"];

    expectTypeOf<ToolsField>().toEqualTypeOf<Record<string, Tool>>();
  });
});

describe("VercelAIObjectParams type safety (v5)", () => {
  it("VercelAIObjectParams tools field is typed with TTools when specific tools provided", () => {
    type Params = VercelAIObjectParams<{ result: string }, MyTools>;
    type ToolsField = Params["tools"];

    // tools should be Record<string, WeatherTool | SearchTool>, not Record<string, any>
    expectTypeOf<NonNullable<ToolsField>>().toMatchTypeOf<Record<string, WeatherTool | SearchTool>>();
  });

  it("VercelAIObjectParams tools field defaults to Record<string, Tool>", () => {
    type Params = VercelAIObjectParams<{ result: string }>;
    type ToolsField = Params["tools"];

    expectTypeOf<NonNullable<ToolsField>>().toMatchTypeOf<Record<string, Tool>>();
  });

  it("adaptObject return type includes TTools in tools field", () => {
    const modelRegistry = new VercelAIModelRegistry();
    const weatherTool = tool({
      description: "Get weather for a location",
      inputSchema: z.object({ location: z.string() }),
      execute: async ({ location }) => `Sunny in ${location}`,
    });
    const searchTool = tool({
      description: "Search the web",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => [{ title: `Result for ${query}`, url: "https://example.com" }],
    });

    const adapter = new VercelAIAdapter<TestPromptShape, MyTools>(
      modelRegistry,
      { weather: weatherTool, search: searchTool }
    );

    type AdaptObjectReturn = Awaited<ReturnType<typeof adapter.adaptObject>>;
    type ToolsField = AdaptObjectReturn["tools"];

    expectTypeOf<NonNullable<ToolsField>>().toMatchTypeOf<Record<string, WeatherTool | SearchTool>>();
  });
});

describe("adaptText return type preserves scalar field types after applyParamMap", () => {
  it("numeric paramMap fields stay typed (not widened to unknown)", () => {
    // Regression guard: applyParamMap returns Record<string, unknown>.
    // If the adapter's return annotation is missing or too loose,
    // spreading it into the return literal would widen scalar fields
    // like maxTokens/temperature to `unknown`. These assertions compile
    // only if the public VercelAITextParams<TTools> preserves scalars.
    type Params = VercelAITextParams<Record<string, Tool>>;

    expectTypeOf<Params["temperature"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Params["maxTokens"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Params["topP"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Params["topK"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Params["frequencyPenalty"]>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<Params["presencePenalty"]>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<Params["seed"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Params["stopSequences"]>().toEqualTypeOf<
      string[] | undefined
    >();
  });
});

describe("createAgentMarkClient type inference (v5)", () => {
  it("infers TTools from opts.tools when specific tools provided", () => {
    const modelRegistry = new VercelAIModelRegistry();
    const weatherTool = tool({
      description: "Get weather for a location",
      inputSchema: z.object({ location: z.string() }),
      execute: async ({ location }) => `Sunny in ${location}`,
    });
    const searchTool = tool({
      description: "Search the web",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => [{ title: `Result for ${query}`, url: "https://example.com" }],
    });

    const client = createAgentMarkClient<TestPromptShape, MyTools>({
      modelRegistry,
      tools: { weather: weatherTool, search: searchTool },
    });

    // Client should be typed with MyTools
    expectTypeOf(client).not.toBeNever();
  });

  it("defaults to Record<string, Tool> when no tools provided", () => {
    const modelRegistry = new VercelAIModelRegistry();
    const client = createAgentMarkClient<TestPromptShape>({ modelRegistry });

    expectTypeOf(client).not.toBeNever();
  });

  it("tools field in opts is typed as TTools", () => {
    type ClientOpts<D extends PromptShape<D>, TTools extends Record<string, Tool>> = Parameters<
      typeof createAgentMarkClient<D, TTools>
    >[0];

    type ToolsParam = ClientOpts<TestPromptShape, MyTools>["tools"];

    // tools param should accept MyTools
    expectTypeOf<MyTools>().toMatchTypeOf<ToolsParam>();
  });
});
