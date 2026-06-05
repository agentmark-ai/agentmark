/**
 * E2E TYPE tests for the prompt-object flow — run by vitest's typecheck
 * mode (real tsc), not at runtime.
 *
 * What "e2e" means at the type level: the generated PromptShape dict
 * (what `agentmark generate-types` emits) flows through
 * `createAgentMarkClient<Dict>` → `loadTextPrompt`/`loadObjectPrompt`
 * (kind-gated keys) → `format({props})` (per-key input typing) → the
 * SDK-native param bag (per-key OUTPUT typing — the object schema lands as
 * `Schema<T[K]["output"]>`) → assignable to the REAL `ai` function params
 * the executor ultimately spreads into.
 *
 * Importing the contract-assertion modules below ALSO pulls them through
 * real tsc — tsup's dts bundling only follows the entry import graph, so
 * this import is what makes the upstream-rename tripwires enforceable.
 */
import { describe, it, expectTypeOf } from "vitest";
import * as ai from "ai";
import type { Schema, Tool, ModelMessage, LanguageModel } from "ai";
import { createAgentMarkClient } from "../src";
import {
  VercelAIModelRegistry,
  type VercelAITextParams,
  type VercelAIObjectParams,
} from "../src/adapter";
// Pull the SDK contract tripwires through real tsc (see module docs).
import type { SdkContractAsserted } from "../src/sdk-contract-assertions";

export type _TripwiresChecked = SdkContractAsserted;

/** Hand-written stand-in for `agentmark generate-types` output. */
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
  it("only text-kind keys load as text prompts (and vice versa)", () => {
    expectTypeOf(client.loadTextPrompt<"greet.prompt.mdx">)
      .parameter(0)
      .toMatchTypeOf<"greet.prompt.mdx" | import("mdast").Root>();

    // @ts-expect-error object prompts cannot be loaded as text prompts
    void client.loadTextPrompt("math.prompt.mdx");
    // @ts-expect-error text prompts cannot be loaded as object prompts
    void client.loadObjectPrompt("greet.prompt.mdx");
  });
});

describe("format(): per-key INPUT typing", () => {
  it("props are typed from the dict's input shape", async () => {
    const prompt = await client.loadTextPrompt("greet.prompt.mdx");

    expectTypeOf(prompt.format)
      .parameter(0)
      .toMatchTypeOf<{ props?: { userName: string } }>();

    // @ts-expect-error wrong prop value type must be rejected
    void prompt.format({ props: { userName: 42 } });
    // @ts-expect-error unknown prop keys must be rejected
    void prompt.format({ props: { userName: "a", extra: true } });
  });
});

describe("format(): per-key OUTPUT typing (SDK-native params)", () => {
  it("text prompts format to v5-native text params", async () => {
    const prompt = await client.loadTextPrompt("greet.prompt.mdx");
    const formatted = await prompt.format({ props: { userName: "Ada" } });

    expectTypeOf(formatted).toMatchTypeOf<
      VercelAITextParams<Record<string, Tool>>
    >();
    expectTypeOf(formatted.model).toEqualTypeOf<LanguageModel>();
    expectTypeOf(formatted.messages).toEqualTypeOf<ModelMessage[]>();
  });

  it("object prompts carry the dict's OUTPUT type into the schema", async () => {
    const prompt = await client.loadObjectPrompt("math.prompt.mdx");
    const formatted = await prompt.format({ props: { question: "2+2?" } });

    expectTypeOf(formatted).toMatchTypeOf<
      VercelAIObjectParams<{ answer: string; confidence: number }>
    >();
    // THE output-type pin: T[K]["output"] lands in the ai Schema generic.
    expectTypeOf(formatted.schema).toEqualTypeOf<
      Schema<{ answer: string; confidence: number }>
    >();
    // @ts-expect-error the schema is NOT a schema of some other shape
    expectTypeOf(formatted.schema).toEqualTypeOf<Schema<{ wrong: boolean }>>();
  });
});

describe("formatted params → real ai function params (the executor handoff)", () => {
  it("text params satisfy ai.generateText's params", async () => {
    const prompt = await client.loadTextPrompt("greet.prompt.mdx");
    const formatted = await prompt.format({ props: { userName: "Ada" } });

    // The shared executor spreads `formatted` into ai.generateText — the
    // type-level proof that the spread is sound end-to-end.
    expectTypeOf(formatted).toMatchTypeOf<
      Parameters<typeof ai.generateText>[0]
    >();
  });

  it("object params satisfy ai.generateObject's schema-bearing params", async () => {
    const prompt = await client.loadObjectPrompt("math.prompt.mdx");
    const formatted = await prompt.format({ props: { question: "2+2?" } });

    expectTypeOf(formatted.schema).toMatchTypeOf<
      Schema<{ answer: string; confidence: number }>
    >();
    expectTypeOf(formatted.messages).toEqualTypeOf<ModelMessage[]>();
  });
});
