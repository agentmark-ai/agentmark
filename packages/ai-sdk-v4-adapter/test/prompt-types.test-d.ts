/**
 * E2E TYPE tests for the v4 prompt-object flow (vitest typecheck mode —
 * real tsc). See the v5 twin for the full rationale. Importing the
 * contract-assertion module pulls the upstream-rename tripwires through
 * real tsc (tsup's dts bundling only follows the entry import graph).
 */
import { describe, it, expectTypeOf } from "vitest";
import * as ai from "ai";
import type { Schema, Tool, LanguageModel } from "ai";
import type { RichChatMessage } from "@agentmark-ai/prompt-core";
import { createAgentMarkClient } from "../src";
import {
  VercelAIModelRegistry,
  type VercelAITextParams,
  type VercelAIObjectParams,
} from "../src/adapter";
import type { SdkContractAsserted } from "../src/sdk-contract-assertions";

export type _TripwiresChecked = SdkContractAsserted;

type TestPrompts = {
  "greet.prompt.mdx": {
    input: { userName: string };
    output: string;
    kind: "text";
  };
  "math.prompt.mdx": {
    input: { question: string };
    output: { answer: string; confidence: number };
    kind: "object";
  };
};

const client = createAgentMarkClient<TestPrompts>({
  modelRegistry: new VercelAIModelRegistry(),
});

describe("prompt dict → loader kind-gating", () => {
  it("only matching kinds load", () => {
    // @ts-expect-error object prompts cannot be loaded as text prompts
    void client.loadTextPrompt("math.prompt.mdx");
    // @ts-expect-error text prompts cannot be loaded as object prompts
    void client.loadObjectPrompt("greet.prompt.mdx");
  });
});

describe("format(): per-key INPUT and OUTPUT typing", () => {
  it("props are typed from the dict; wrong shapes rejected", async () => {
    const prompt = await client.loadTextPrompt("greet.prompt.mdx");
    expectTypeOf(prompt.format)
      .parameter(0)
      .toExtend<{ props?: { userName: string } }>();
    // @ts-expect-error wrong prop value type must be rejected
    void prompt.format({ props: { userName: 42 } });
  });

  it("text prompts format to v4-native params (RichChatMessage messages)", async () => {
    const prompt = await client.loadTextPrompt("greet.prompt.mdx");
    const formatted = await prompt.format({ props: { userName: "Ada" } });

    expectTypeOf(formatted).toExtend<VercelAITextParams<Record<string, Tool>>>();
    expectTypeOf(formatted.model).toEqualTypeOf<LanguageModel>();
    expectTypeOf(formatted.messages).toEqualTypeOf<RichChatMessage[]>();
  });

  it("object prompts carry the dict's OUTPUT type into the schema", async () => {
    const prompt = await client.loadObjectPrompt("math.prompt.mdx");
    const formatted = await prompt.format({ props: { question: "2+2?" } });

    expectTypeOf(formatted).toExtend<
      VercelAIObjectParams<{ answer: string; confidence: number }>
    >();
    expectTypeOf(formatted.schema).toEqualTypeOf<
      Schema<{ answer: string; confidence: number }>
    >();
    // @ts-expect-error the schema is NOT a schema of some other shape
    expectTypeOf(formatted.schema).toEqualTypeOf<Schema<{ wrong: boolean }>>();
  });
});

describe("formatted params → real ai function params", () => {
  it("text params satisfy ai.generateText's params", async () => {
    const prompt = await client.loadTextPrompt("greet.prompt.mdx");
    const formatted = await prompt.format({ props: { userName: "Ada" } });
    expectTypeOf(formatted).toExtend<Parameters<typeof ai.generateText>[0]>();
  });
});
