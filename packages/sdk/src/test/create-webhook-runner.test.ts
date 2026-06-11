/**
 * Proves the one-call webhook wiring: `createAgentMark` (loader/evals
 * registered ONCE) + `createWebhookRunner({ client, executor })` give a
 * Bedrock-style SDK the full webhook/runPrompt path (the shape the
 * cloud/managed runner dispatches to) end-to-end, with no Adapter and no
 * SDK-specific glue. Parses an inline prompt → renders via the neutral
 * DefaultAdapter → executes through the custom executor → returns output.
 * The runner sources BOTH the loader and the eval registry from the single
 * client it is handed — there is no second registration point to drift.
 */

import { describe, it, expect } from "vitest";
import { createAgentMark, createExecutor, getTemplateDXInstance } from "@agentmark-ai/prompt-core";
import { createWebhookRunner } from "../create-webhook-runner";

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

describe("createWebhookRunner — client + executor → cloud-dispatched webhook path", () => {
  it("loads → renders (DefaultAdapter) → executes (custom executor) → returns output", async () => {
    const bedrock = new FakeBedrockRuntime();

    // The whole integration: an executor + one client + one wiring call.
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

    const runner = createWebhookRunner({ client: createAgentMark({}), executor });
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

  it("evals registered on the client → runner.dispatch lists them for get-evals", async () => {
    const executor = createExecutor({
      name: "noop",
      text: async () => ({ text: "x", usage: { inputTokens: 1, outputTokens: 1 } }),
    });
    // Register evals ONCE, on the client — the runner sources its registry
    // from there, so they both run in experiments and list in the New
    // Experiment dialog (the regression that used to leave it empty).
    const client = createAgentMark({
      evals: {
        acc: () => ({ score: 1 }),
        safety: () => ({ score: 1 }),
      },
    });
    const runner = createWebhookRunner({ client, executor });

    const res = await runner.dispatch({ type: "get-evals", data: {} });
    expect(res).toEqual({
      type: "json",
      data: { type: "evals", result: '["acc","safety"]', traceId: "" },
      status: 200,
    });
  });

  it("without evals on the client, get-evals lists none", async () => {
    const executor = createExecutor({
      name: "noop",
      text: async () => ({ text: "x", usage: { inputTokens: 1, outputTokens: 1 } }),
    });
    const runner = createWebhookRunner({ client: createAgentMark({}), executor });
    const res = (await runner.dispatch({ type: "get-evals", data: {} })) as {
      data: { result: string };
    };
    expect(res.data.result).toBe("[]");
  });
});
