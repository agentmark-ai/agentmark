/**
 * Phase 5: AgentMarkObservation hook wiring.
 *
 * Asserts that WebhookRunner synthesizes an OTel-GenAI-aligned Observation
 * from the AgentEvent stream and hands it to the configured hook, once
 * per run, with all the populated fields we promise (tool calls paired by
 * id, finalized usage, finishReason, duration).
 */
import { describe, it, expect } from "vitest";
import type {
  ExecCtx,
  ExecutorCapabilities,
  AgentEvent,
  AgentMarkObservation,
  Executor,
} from "../src/index";
import { WebhookRunner } from "../src/webhook-runner";

class StubExecutor implements Executor {
  readonly name = "stub";
  capabilities(): ExecutorCapabilities {
    return { text: true, object: true };
  }
  async *executeText(_f: unknown, _ctx: ExecCtx): AsyncIterable<AgentEvent> {
    yield { type: "text-delta", text: "Hello " };
    yield { type: "text-delta", text: "world." };
    yield {
      type: "tool-call",
      id: "call_1",
      name: "search",
      args: { q: "cats" },
    };
    yield {
      type: "tool-result",
      id: "call_1",
      name: "search",
      result: ["kitten", "feline"],
    };
    yield {
      type: "finish",
      reason: "stop",
      usage: { inputTokens: 17, outputTokens: 3, totalTokens: 20 },
    };
  }
  async *executeObject(_f: unknown, _ctx: ExecCtx): AsyncIterable<AgentEvent> {
    yield { type: "object-final", value: { answer: 42 } };
    yield {
      type: "finish",
      reason: "stop",
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
    };
  }
}

class StubPrompt {
  async format() {
    return { _fake: true };
  }
  async formatWithTestProps() {
    return { _fake: true };
  }
}

class StubClient {
  private readonly prompt = new StubPrompt();
  async loadTextPrompt() {
    return this.prompt;
  }
  async loadObjectPrompt() {
    return this.prompt;
  }
  async loadImagePrompt() {
    return this.prompt;
  }
  async loadSpeechPrompt() {
    return this.prompt;
  }
  getEvalRegistry() {
    return undefined;
  }
}

describe("WebhookRunner — observationHook", () => {
  it("synthesizes a full observation from the text event stream", async () => {
    const observations: AgentMarkObservation[] = [];
    const runner = new WebhookRunner(
      new StubClient() as any,
      new StubExecutor(),
      { observationHook: (o) => void observations.push(o) }
    );

    const ast = {
      children: [{ type: "yaml", value: "text_config:\n  model_name: test\n" }],
    };

    const res = await runner.runPrompt(ast as any, { shouldStream: false });
    expect(res.type).toBe("text");

    expect(observations).toHaveLength(1);
    const obs = observations[0]!;
    expect(obs.kind).toBe("text");
    expect(obs.executorName).toBe("stub");
    expect(obs.output).toBe("Hello world.");
    expect(obs.finishReason).toBe("stop");
    expect(obs.usage).toEqual({ inputTokens: 17, outputTokens: 3, totalTokens: 20 });
    expect(obs.toolCalls).toEqual([
      {
        id: "call_1",
        name: "search",
        input: { q: "cats" },
        output: ["kitten", "feline"],
      },
    ]);
    expect(typeof obs.durationMs).toBe("number");
    expect(obs.error).toBeUndefined();
  });

  it("synthesizes an observation for object runs with the final value", async () => {
    const observations: AgentMarkObservation[] = [];
    const runner = new WebhookRunner(
      new StubClient() as any,
      new StubExecutor(),
      { observationHook: (o) => void observations.push(o) }
    );

    const ast = {
      children: [
        { type: "yaml", value: "object_config:\n  model_name: test\n" },
      ],
    };

    await runner.runPrompt(ast as any, { shouldStream: false });

    expect(observations).toHaveLength(1);
    const obs = observations[0]!;
    expect(obs.kind).toBe("object");
    expect(obs.output).toEqual({ answer: 42 });
    expect(obs.usage?.totalTokens).toBe(7);
  });

  it("omits hook invocation entirely when no observationHook is configured", async () => {
    let threw = false;
    const runner = new WebhookRunner(
      new StubClient() as any,
      new StubExecutor()
    );
    const ast = {
      children: [{ type: "yaml", value: "text_config:\n  model_name: test\n" }],
    };
    try {
      await runner.runPrompt(ast as any, { shouldStream: false });
    } catch {
      threw = true;
    }
    // No hook = no failure; runner just doesn't call emitObservation.
    expect(threw).toBe(false);
  });

  it("survives a throwing observationHook — never propagates to the run", async () => {
    const runner = new WebhookRunner(
      new StubClient() as any,
      new StubExecutor(),
      {
        observationHook: () => {
          throw new Error("observer blew up");
        },
      }
    );
    const ast = {
      children: [{ type: "yaml", value: "text_config:\n  model_name: test\n" }],
    };
    // The run must complete normally — observations are best-effort.
    const res = await runner.runPrompt(ast as any, { shouldStream: false });
    expect(res.type).toBe("text");
  });
});
