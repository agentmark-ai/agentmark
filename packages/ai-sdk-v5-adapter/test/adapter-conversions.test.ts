/**
 * Behavior tests for the v5 adapter's conversion seams — written from the
 * coverage-gate report after the registry dedup shrank this package's
 * covered-line denominator and exposed these as never-tested:
 *
 *   - `max_calls` → `stopWhen: stepCountIs(n)` (the param-map transform
 *     that DIFFERS from v4's plain `maxSteps` rename)
 *   - `convertMessages` rich-content handling (v5 renamed file parts'
 *     `mimeType` to `mediaType`; text parts pass through; plain-string
 *     user content stays a string)
 */
import { describe, it, expect } from "vitest";
import { stepCountIs, type StepResult, type ToolSet } from "ai";
import { VercelAIAdapter, VercelAIModelRegistry } from "../src/adapter";

const registry = new VercelAIModelRegistry();
registry.registerModels("test-model", () => ({ modelId: "test-model" }) as never);

const adapter = new VercelAIAdapter<never>(registry);

const METADATA = { props: {}, path: undefined, template: {} };

function textInput(
  settings: Record<string, unknown>,
  messages: Array<Record<string, unknown>>
) {
  return {
    name: "conv-probe",
    text_config: { model_name: "test-model", ...settings },
    messages,
  } as never;
}

describe("param map: max_calls → stopWhen", () => {
  it("wraps max_calls in stepCountIs (v5 semantics, not v4's maxSteps)", async () => {
    const formatted = await adapter.adaptText(
      textInput({ max_calls: 3 }, [{ role: "user", content: "hi" }]),
      {},
      METADATA
    );

    expect(formatted).not.toHaveProperty("maxSteps");

    // stepCountIs returns a predicate — pin its BEHAVIOR (n=3 semantics)
    // against the reference rather than comparing function identity.
    const stop = (formatted as Record<string, unknown>).stopWhen as (o: {
      steps: unknown[];
    }) => boolean | PromiseLike<boolean>;
    const reference = stepCountIs(3);
    expect(typeof stop).toBe("function");
    for (const length of [2, 3, 4]) {
      // The predicate only reads steps.length — minimal fakes, typed as
      // StepResult so the reference's signature is satisfied under every
      // TS/ai resolution (CI's standalone OSS layout typechecks stricter
      // than the workspace did).
      const steps = Array.from(
        { length },
        () => ({}) as StepResult<ToolSet>
      );
      expect(await stop({ steps }), `at ${length} steps`).toBe(
        await reference({ steps })
      );
    }
  });
});

describe("convertMessages: rich content", () => {
  it("renames file parts' mimeType to mediaType and passes text parts through", async () => {
    const formatted = await adapter.adaptText(
      textInput({}, [
        { role: "system", content: "sys" },
        {
          role: "user",
          content: [
            { type: "text", text: "look at this" },
            { type: "file", data: "BASE64", mimeType: "application/pdf" },
          ],
        },
        { role: "assistant", content: "ok" },
      ]),
      {},
      METADATA
    );

    expect(formatted.messages).toEqual([
      { role: "system", content: "sys" },
      {
        role: "user",
        content: [
          { type: "text", text: "look at this" },
          // The v5 conversion: mimeType → mediaType, data preserved.
          { type: "file", data: "BASE64", mediaType: "application/pdf" },
        ],
      },
      { role: "assistant", content: "ok" },
    ]);
  });

  it("keeps plain-string user content as a string", async () => {
    const formatted = await adapter.adaptText(
      textInput({}, [{ role: "user", content: "just text" }]),
      {},
      METADATA
    );
    expect(formatted.messages).toEqual([
      { role: "user", content: "just text" },
    ]);
  });
});

describe("convertMessages: unknown-role fall-through", () => {
  it("forwards messages with roles outside the typed union untouched", async () => {
    // RichChatMessage's union is system|user|assistant, but untyped JS callers
    // can hand the adapter anything — the conversion must pass unknown roles
    // through verbatim rather than dropping or mangling them, so the SDK (not
    // the adapter) decides whether to reject them.
    const formatted = await adapter.adaptText(
      textInput({}, [
        { role: "user", content: "hi" },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "t1" }] },
      ]),
      {},
      METADATA
    );

    expect(formatted.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "t1" }] },
    ]);
  });
});
