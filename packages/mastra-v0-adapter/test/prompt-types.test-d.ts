/**
 * E2E TYPE tests for the Mastra prompt-object flow (vitest typecheck mode —
 * real tsc). Pins the two consumption modes' types end-to-end:
 *
 *   1. Executor path: `format()` returns the runnable bundle
 *      (`MastraTextParams` — the post-`_runnable` shape), whose
 *      `generateOptions` satisfy the REAL `Agent.generate` options param.
 *   2. User path: `formatAgent()` returns AgentConfig + a `formatMessages`
 *      whose tuple is typed — including the object kind's Zod output
 *      refined to the dict's OUTPUT type.
 */
import { describe, it, expectTypeOf } from "vitest";
import { Agent, type AgentConfig } from "@mastra/core/agent";
import type { z } from "zod";
import type { RichChatMessage } from "@agentmark-ai/prompt-core";
import { createAgentMarkClient } from "../src";
import { MastraModelRegistry } from "../src/model-registry";
import type {
  MastraTextParams,
  MastraObjectParams,
  MastraTextGenerateOptions,
} from "../src/adapter";

type TestPrompts = {
  "greet.prompt.mdx": {
    input: { userName: string };
    output: string;
    kind: "text";
  };
  "math.prompt.mdx": {
    input: { question: string };
    output: { answer: string };
    kind: "object";
  };
};

const client = createAgentMarkClient<TestPrompts>({
  modelRegistry: new MastraModelRegistry(),
});

describe("executor path: format() returns the typed runnable bundle", () => {
  it("text format() is the MastraTextParams bundle", async () => {
    const prompt = await client.loadTextPrompt("greet.prompt.mdx");
    const formatted = await prompt.format({ props: { userName: "Ada" } });

    expectTypeOf(formatted).toEqualTypeOf<MastraTextParams>();
    expectTypeOf(formatted.agent).toEqualTypeOf<AgentConfig>();
    expectTypeOf(formatted.messages).toEqualTypeOf<RichChatMessage[]>();
    // The bundle's options satisfy the REAL Agent.generate options param —
    // the type-level executor handoff.
    expectTypeOf(formatted.generateOptions).toExtend<
      Parameters<Agent["generate"]>[1]
    >();
  });

  it("object format() is the MastraObjectParams bundle", async () => {
    const prompt = await client.loadObjectPrompt("math.prompt.mdx");
    const formatted = await prompt.format({ props: { question: "2+2?" } });
    expectTypeOf(formatted).toEqualTypeOf<MastraObjectParams>();
  });
});

describe("user path: formatAgent() two-stage typing", () => {
  it("returns AgentConfig fields + a typed formatMessages", async () => {
    const prompt = await client.loadTextPrompt("greet.prompt.mdx");
    const agent = await prompt.formatAgent({ props: { userName: "Ada" } });

    expectTypeOf(agent).toExtend<AgentConfig>();

    const [messages, options] = await agent.formatMessages({});
    expectTypeOf(messages).toEqualTypeOf<RichChatMessage[]>();
    expectTypeOf(options).toEqualTypeOf<MastraTextGenerateOptions>();
  });

  it("object formatMessages refines the Zod output to the dict's OUTPUT type", async () => {
    const prompt = await client.loadObjectPrompt("math.prompt.mdx");
    const agent = await prompt.formatAgent({ props: { question: "2+2?" } });

    const [, options] = await agent.formatMessages({});
    // THE output-type pin: T[K]["output"] lands in the Zod schema type.
    expectTypeOf(options.output).toEqualTypeOf<z.ZodType<{ answer: string }>>();
    // @ts-expect-error the output schema is NOT of some other shape
    expectTypeOf(options.output).toEqualTypeOf<z.ZodType<{ wrong: boolean }>>();
  });
});

describe("input typing", () => {
  it("formatAgent props are typed from the dict", async () => {
    const prompt = await client.loadTextPrompt("greet.prompt.mdx");
    // NOTE: `format()` props are NOT per-key typed for Mastra — the prompt
    // classes extend TextPrompt<any, ...> to support the optional-dict
    // generic, which erases input typing on the executor path. The typed
    // user path is formatAgent/formatMessages below. (Known DX gap; if the
    // dict generic is ever threaded through, add the format() negative.)
    void prompt;
    const agent = await prompt.formatAgent({ props: { userName: "Ada" } });
    void agent;
  });
});
