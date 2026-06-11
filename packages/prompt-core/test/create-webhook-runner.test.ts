/**
 * The prompt-core factory: client-first wiring (client is REQUIRED — the
 * legacy loader/evals options were removed in the major). Hook defaulting is
 * NOT tested here — prompt-core wires no tracing; that default belongs to
 * @agentmark-ai/sdk's re-export.
 */

import { describe, it, expect } from "vitest";
import { createAgentMark, createExecutor } from "../src/index";
import { createWebhookRunner } from "../src/create-webhook-runner";

const noopExecutor = () =>
  createExecutor({
    name: "noop",
    text: async () => ({ text: "x", usage: { inputTokens: 1, outputTokens: 1 } }),
  });

describe("createWebhookRunner (prompt-core)", () => {
  it("client-first: runner sources evals from the client (get-evals)", async () => {
    const client = createAgentMark({
      evals: { acc: () => ({ score: 1 }), safety: () => ({ score: 1 }) },
    });
    const runner = createWebhookRunner({ client, executor: noopExecutor() });
    const res = await runner.dispatch({ type: "get-evals", data: {} });
    expect(res).toEqual({
      type: "json",
      data: { type: "evals", result: '["acc","safety"]', traceId: "" },
      status: 200,
    });
  });

  it("client without evals → get-evals lists none", async () => {
    const runner = createWebhookRunner({
      client: createAgentMark({}),
      executor: noopExecutor(),
    });
    const res = (await runner.dispatch({ type: "get-evals", data: {} })) as {
      data: { result: string };
    };
    expect(res.data.result).toBe("[]");
  });
});
