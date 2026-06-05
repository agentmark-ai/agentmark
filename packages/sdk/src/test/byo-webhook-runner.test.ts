/**
 * Proves the one-call BYO wiring: `createWebhookRunner({ executor })` +
 * `createExecutor` give a Bedrock-style SDK the full webhook/runPrompt path
 * (the shape the cloud/managed runner dispatches to) end-to-end, with no
 * Adapter and no hand-assembly. Parses an inline prompt → renders via the
 * neutral DefaultAdapter → executes through the BYO executor → returns output.
 */

import { describe, it, expect } from "vitest";
import { createExecutor, getTemplateDXInstance } from "@agentmark-ai/prompt-core";
import { createWebhookRunner } from "../byo";

const PROMPT = `---
name: support
text_config:
  model_name: my-bedrock-model
---

<System>You are a support agent.</System>
<User>How do I get a refund?</User>
`;

class FakeBedrockRuntime {
  public calls = 0;
  async converse(messages: Array<{ role: string; content: unknown }>) {
    this.calls++;
    const user = messages.find((m) => m.role === "user");
    return { outputText: `answered: ${JSON.stringify(user?.content)}`, usage: { inputTokens: 7, outputTokens: 5 } };
  }
}

describe("createWebhookRunner — one-call BYO webhook path", () => {
  it("loads → renders (DefaultAdapter) → executes (BYO executor) → returns output", async () => {
    const bedrock = new FakeBedrockRuntime();

    // The whole BYO integration: an executor + one wiring call.
    const executor = createExecutor({
      name: "bedrock-converse",
      // `formatted` is the neutral rendered prompt (DefaultAdapter) — messages
      // + text_config — which the executor feeds straight to Bedrock.
      text: async (formatted) => {
        const f = formatted as { messages: Array<{ role: string; content: unknown }> };
        const res = await bedrock.converse(f.messages);
        return { text: res.outputText, usage: res.usage };
      },
    });

    const runner = createWebhookRunner({ executor });
    expect(typeof runner.runPrompt).toBe("function");
    expect(typeof runner.runExperiment).toBe("function");

    // Parse an inline prompt to an AST (no loader/files needed for runPrompt).
    const templateDX = getTemplateDXInstance("language");
    const ast = await templateDX.parse(PROMPT, process.cwd(), async () => "");

    const res = (await runner.runPrompt(ast, { shouldStream: false })) as {
      type: string;
      result: string;
      usage?: { totalTokens?: number };
    };

    expect(bedrock.calls).toBe(1); // the prompt actually executed through Bedrock
    expect(res.type).toBe("text");
    expect(res.result).toContain("answered:");
    expect(res.result).toContain("refund"); // the rendered user message reached Bedrock
  });
});
