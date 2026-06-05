/**
 * Direct unit tests for the adapter's param-mapping building blocks
 * (public since the `_runnable` decoupling). Mutation testing showed the
 * declarative MASTRA_TEXT_PARAM_MAP could be emptied without any test
 * noticing — nothing pinned the snake_case → Mastra camelCase translation
 * itself. These tests are that pin.
 */
import { describe, it, expect } from "vitest";
import { MastraAdapter } from "../src/adapter";
import { MastraModelRegistry } from "../src/model-registry";

const adapter = new MastraAdapter<any>(new MastraModelRegistry());

const METADATA = { props: { userMessage: "hi" }, path: undefined, template: {} };

function textInput(settings: Record<string, unknown>) {
  return {
    name: "map-probe",
    text_config: { model_name: "test-model", ...settings },
    messages: [
      { role: "system" as const, content: "sys" },
      { role: "user" as const, content: "hi" },
    ],
  } as any;
}

describe("adaptTextMessages — param map", () => {
  it("translates every supported snake_case setting to Mastra's camelCase", () => {
    const { messages, options } = adapter.adaptTextMessages({
      input: textInput({
        temperature: 0.5,
        max_tokens: 100,
        top_p: 0.9,
        top_k: 40,
        presence_penalty: 0.1,
        frequency_penalty: 0.2,
        stop_sequences: ["END"],
        seed: 7,
        max_retries: 2,
        max_calls: 3,
        tool_choice: "auto",
      }),
      options: {},
      metadata: METADATA,
    });

    expect(options).toEqual({
      temperature: 0.5,
      maxTokens: 100,
      topP: 0.9,
      topK: 40,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
      stopSequences: ["END"],
      seed: 7,
      maxRetries: 2,
      maxSteps: 3,
      toolChoice: "auto",
      output: undefined,
      experimental_output: undefined,
    });
    // Consumed-elsewhere keys are dropped, not forwarded to agent.generate.
    expect(options).not.toHaveProperty("model_name");
    // The system message is extracted into the Agent's instructions, not
    // the per-call message list.
    expect(messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("omits unset settings entirely (no undefined-valued keys)", () => {
    const { options } = adapter.adaptTextMessages({
      input: textInput({ temperature: 0.7 }),
      options: {},
      metadata: METADATA,
    });
    expect(options).toEqual({
      temperature: 0.7,
      output: undefined,
      experimental_output: undefined,
    });
    expect(Object.keys(options)).not.toContain("maxTokens");
  });

  it("bakes telemetry metadata in when enabled", () => {
    const { options } = adapter.adaptTextMessages({
      input: textInput({}),
      options: { telemetry: { isEnabled: true, functionId: "f1" } },
      metadata: METADATA,
    });
    expect((options as any).telemetry).toEqual({
      isEnabled: true,
      functionId: "f1",
      metadata: {
        prompt_name: "map-probe",
        props: JSON.stringify({ userMessage: "hi" }),
      },
    });
  });
});

describe("adaptTextAgent — instructions extraction", () => {
  it("lifts the <System> message into instructions and resolves the model", async () => {
    const registry = new MastraModelRegistry();
    registry.registerModels("test-model", () => ({ name: "test-model" }) as any);
    const withRegistry = new MastraAdapter<any>(registry);

    const agent = await withRegistry.adaptTextAgent(
      textInput({}),
      {}
    );
    expect(agent.instructions).toBe("sys");
    expect(agent.name).toBe("map-probe");
    expect(agent.tools).toEqual({});
  });
});

describe("adaptObjectMessages — schema transform", () => {
  it("converts the JSON schema to a Zod `output` and maps settings", () => {
    const { options } = adapter.adaptObjectMessages(
      {
        name: "obj-probe",
        object_config: {
          model_name: "test-model",
          temperature: 0.3,
          max_calls: 2,
          schema: {
            type: "object",
            properties: { answer: { type: "string" } },
            required: ["answer"],
          },
        },
        messages: [{ role: "user", content: "hi" }],
      } as any,
      {},
      METADATA
    );

    expect(options.temperature).toBe(0.3);
    expect((options as any).maxSteps).toBe(2);
    // The map's transform turned `schema` into a live Zod schema on `output`.
    expect(options).not.toHaveProperty("schema");
    const zodOutput = options.output as {
      safeParse: (v: unknown) => { success: boolean };
    };
    expect(typeof zodOutput.safeParse).toBe("function");
    expect(zodOutput.safeParse({ answer: "8" }).success).toBe(true);
    expect(zodOutput.safeParse({ answer: 8 }).success).toBe(false);
  });
});
