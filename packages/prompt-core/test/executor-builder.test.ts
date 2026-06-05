/**
 * Proves `createExecutor` makes a BYO-SDK executor protocol-correct BY
 * CONSTRUCTION: a raw AWS-Bedrock-style client is wrapped in ~20 lines of
 * "call my SDK, return {text|object, usage}" and passes the full conformance
 * suite (the same `runConformance` official adapters use) — no async-generator
 * plumbing, no usage/finish/error-ordering footguns.
 *
 * This is the executor-bootstrapping improvement: contrast with hand-writing
 * the ~180 LOC `Executor` (see ai-sdk-shared/src/executor-factory.ts) and
 * debugging it against conformance.
 */

import { describe, it, expect } from "vitest";
import type { ExecCtx } from "../src/executor";
import { createExecutor } from "../src/executor-builder";
import {
  assertTextStream,
  assertObjectStream,
  runConformance,
  runExecutorConformance,
} from "../src/executor-conformance";

// ── The user's PRE-EXISTING raw SDK — stands in for
//    @aws-sdk/client-bedrock-runtime's ConverseCommand. Zero AgentMark deps. ──
class FakeBedrockRuntime {
  async converse(req: {
    messages: Array<{ role: string; content: string }>;
    json?: boolean;
    wantTool?: boolean;
  }): Promise<{
    outputText: string;
    toolUse?: { id: string; name: string; input: unknown };
    usage: { inputTokens: number; outputTokens: number };
  }> {
    if (req.wantTool) {
      return {
        outputText: "",
        toolUse: { id: "tool-1", name: "lookup_order", input: { id: "A-100" } },
        usage: { inputTokens: 10, outputTokens: 4 },
      };
    }
    const outputText = req.json ? '{"answer":"42"}' : "Your refund is on its way.";
    return { outputText, usage: { inputTokens: 12, outputTokens: 8 } };
  }
}

const ctx: ExecCtx = { telemetry: { isEnabled: false } };

describe("createExecutor — BYO executor bootstrapping (raw Bedrock)", () => {
  const bedrock = new FakeBedrockRuntime();

  // ─────────────────────────────────────────────────────────────────────────
  // THIS is the entire executor a Bedrock user writes. No AgentEvent stream,
  // no finish/usage/error bookkeeping — the builder guarantees the protocol.
  // ─────────────────────────────────────────────────────────────────────────
  const executor = createExecutor({
    name: "bedrock-converse",
    text: async (formatted) => {
      const f = formatted as any;
      if (f.bad) throw new Error("ValidationException: malformed request");
      const res = await bedrock.converse({ messages: f.messages ?? [], wantTool: f.wantTool });
      if (res.toolUse) {
        return {
          toolCalls: [{ id: res.toolUse.id, name: res.toolUse.name, args: res.toolUse.input }],
          toolResults: [{ id: res.toolUse.id, name: res.toolUse.name, result: { ok: true } }],
          usage: res.usage,
        };
      }
      return { text: res.outputText, usage: res.usage };
    },
    object: async (formatted) => {
      const res = await bedrock.converse({ messages: (formatted as any).messages ?? [], json: true });
      return { object: JSON.parse(res.outputText), usage: res.usage };
    },
  });

  it("passes the full conformance suite by construction (via the one-call helper)", async () => {
    // runExecutorConformance builds the ScenarioDriver from `formatted`
    // fixtures — no hand-wiring of executeText/executeObject closures.
    await expect(
      runExecutorConformance(executor, {
        text: { messages: [{ role: "user", content: "refund?" }] },
        textWithTools: { wantTool: true },
        object: { messages: [] },
        errorInput: { bad: true },
      }),
    ).resolves.toBeUndefined();
  });

  it("derives capabilities from the handlers provided", () => {
    expect(executor.capabilities()).toEqual({
      text: true,
      object: true,
      image: false,
      speech: false,
    });
  });

  it("emits a protocol-correct text stream (text-delta + single usage on finish)", async () => {
    const events = await assertTextStream(
      executor.executeText({ messages: [{ role: "user", content: "refund?" }] }, ctx),
    );
    expect(events.find((e) => e.type === "text-delta")).toMatchObject({ text: /refund/i });
    const finish = events.find((e) => e.type === "finish") as Extract<typeof events[number], { type: "finish" }>;
    expect(finish.usage).toEqual({ inputTokens: 12, outputTokens: 8, totalTokens: 20 });
  });

  it("emits a protocol-correct object stream (object-final + usage)", async () => {
    const events = await assertObjectStream(executor.executeObject({ messages: [] }, ctx));
    expect(events.find((e) => e.type === "object-final")).toMatchObject({ value: { answer: "42" } });
  });

  it("converts a thrown SDK error into a single terminal error event (never throws)", async () => {
    const events: Array<{ type: string }> = [];
    for await (const ev of executor.executeText({ bad: true }, ctx)) events.push(ev);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", error: /ValidationException/ });
  });

  it("unsupported modality yields a terminal error, not a crash", async () => {
    const textOnly = createExecutor({
      name: "text-only",
      text: async () => ({ text: "hi", usage: { inputTokens: 1, outputTokens: 1 } }),
    });
    expect(textOnly.capabilities().object).toBe(false);
    const events: Array<{ type: string }> = [];
    for await (const ev of textOnly.executeObject({}, ctx)) events.push(ev);
    expect(events[0]).toMatchObject({ type: "error" });
  });
});

describe("createExecutor — streaming handlers (raw Bedrock ConverseStream)", () => {
  // A streaming SDK: yields native chunks token-by-token, then a usage event.
  async function* fakeConverseStream(): AsyncIterable<
    { kind: "delta"; text: string } | { kind: "usage"; inputTokens: number; outputTokens: number }
  > {
    yield { kind: "delta", text: "Your " };
    yield { kind: "delta", text: "refund " };
    yield { kind: "delta", text: "is on its way." };
    yield { kind: "usage", inputTokens: 12, outputTokens: 8 };
  }

  // The whole streaming executor — no finish/usage/error bookkeeping.
  const executor = createExecutor({
    name: "bedrock-converse-stream",
    streamText: async function* (formatted) {
      if ((formatted as any).bad) throw new Error("ThrottlingException");
      for await (const chunk of fakeConverseStream()) {
        if (chunk.kind === "delta") yield { type: "text-delta", text: chunk.text };
        else yield { type: "finish", reason: "stop", usage: { inputTokens: chunk.inputTokens, outputTokens: chunk.outputTokens } };
      }
    },
    streamObject: async function* () {
      yield { type: "object-delta", partial: { partial: true } };
      yield { type: "object-final", value: { answer: "42" } };
      yield { type: "finish", reason: "stop", usage: { inputTokens: 5, outputTokens: 3 } };
    },
  });

  it("passes conformance for streamed text + object by construction", async () => {
    await expect(
      runConformance({
        text: () => executor.executeText({}, ctx),
        object: () => executor.executeObject({}, ctx),
        errorPath: () => executor.executeText({ bad: true }, ctx),
      }),
    ).resolves.toBeUndefined();
  });

  it("emits per-token text-deltas + a single accumulated usage on finish", async () => {
    const events = await assertTextStream(executor.executeText({}, ctx));
    const deltas = events.filter((e) => e.type === "text-delta");
    expect(deltas.length).toBe(3); // streamed token-by-token, not buffered
    const finish = events.find((e) => e.type === "finish") as Extract<typeof events[number], { type: "finish" }>;
    expect(finish.usage).toEqual({ inputTokens: 12, outputTokens: 8, totalTokens: 20 });
  });

  it("preserves a streamed finishReason instead of flattening to 'stop'", async () => {
    const stopped = createExecutor({
      name: "finish-reason-stream",
      streamText: async function* () {
        yield { type: "text-delta", text: "partial..." };
        yield { type: "finish", reason: "length", usage: { inputTokens: 1, outputTokens: 100 } };
      },
    });
    const events = await assertTextStream(stopped.executeText({}, ctx));
    const finish = events.find((e) => e.type === "finish") as Extract<typeof events[number], { type: "finish" }>;
    expect(finish.reason).toBe("length");
  });

  it("ends a deltas-only object stream with object-final = the last delta (contract)", async () => {
    // The SDK streams cumulative partials and never emits an explicit final —
    // the Executor contract still requires a terminal object-final, and the
    // last cumulative delta IS the resolved value.
    const deltaOnly = createExecutor({
      name: "object-delta-only",
      streamObject: async function* () {
        yield { type: "object-delta", partial: { answer: null } };
        yield { type: "object-delta", partial: { answer: "4" } };
        yield { type: "object-delta", partial: { answer: "42" } };
        yield { type: "finish", reason: "stop", usage: { inputTokens: 5, outputTokens: 3 } };
      },
    });
    const events = await assertObjectStream(deltaOnly.executeObject({}, ctx));
    const final = events.find((e) => e.type === "object-final") as Extract<typeof events[number], { type: "object-final" }>;
    expect(final).toBeDefined();
    expect(final.value).toEqual({ answer: "42" }); // last delta, not undefined
  });
});

describe("runExecutorConformance — exercises both stream and one-shot branches", () => {
  it("catches a broken one-shot path even when a valid streaming path exists", async () => {
    // A dual-handler executor: streaming text is fine, but the one-shot text
    // handler is broken (emits no usage-bearing finish — simulated by throwing
    // a non-Error that the builder still terminalizes... here we make it emit
    // zero content AND zero usage by violating the result shape).
    const brokenOneShot = createExecutor({
      name: "broken-one-shot",
      // valid streaming path
      streamText: async function* (formatted) {
        if ((formatted as any).bad) throw new Error("ValidationException");
        yield { type: "text-delta", text: "ok" };
        yield { type: "finish", reason: "stop", usage: { inputTokens: 1, outputTokens: 1 } };
      },
      // BROKEN one-shot: returns empty text and no tool calls -> empty stream,
      // which assertTextStream rejects ("no text-delta or tool-call produced").
      text: async (formatted) => {
        if ((formatted as any).bad) throw new Error("ValidationException");
        return { text: "", usage: { inputTokens: 1, outputTokens: 1 } };
      },
      object: async () => ({ object: { ok: true }, usage: { inputTokens: 1, outputTokens: 1 } }),
      streamObject: async function* () {
        yield { type: "object-final", value: { ok: true } };
        yield { type: "finish", reason: "stop", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    });
    // Before the both-modes fix this passed (default ctx selected streaming).
    await expect(
      runExecutorConformance(brokenOneShot, {
        text: {},
        object: {},
        errorInput: { bad: true },
      }),
    ).rejects.toThrow(/no text-delta or tool-call/);
  });

  it("a pinned ctx runs exactly that mode (caller override respected)", async () => {
    const streamOnly = createExecutor({
      name: "stream-only",
      streamText: async function* (formatted) {
        if ((formatted as any).bad) throw new Error("ThrottlingException");
        yield { type: "text-delta", text: "hi" };
        yield { type: "finish", reason: "stop", usage: { inputTokens: 1, outputTokens: 1 } };
      },
      streamObject: async function* () {
        yield { type: "object-final", value: { ok: true } };
        yield { type: "finish", reason: "stop", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    });
    await expect(
      runExecutorConformance(streamOnly, {
        text: {},
        object: {},
        errorInput: { bad: true },
        ctx: { telemetry: { isEnabled: false }, shouldStream: true },
      }),
    ).resolves.toBeUndefined();
  });
});

describe("createExecutor — image/speech traceId is optional for BYO authors", () => {
  it("fills traceId='' when the handler omits it", async () => {
    const exec = createExecutor({
      name: "image-gen",
      image: async () => ({
        // a raw image SDK returns just the artifacts + usage; no traceId
        images: [{ base64: "iVBORw0KG..." }],
        usage: { inputTokens: 0, outputTokens: 0 },
      }) as any,
      speech: async () => ({ audio: { base64: "UklGR..." }, usage: { inputTokens: 0, outputTokens: 0 } }) as any,
    });
    expect(exec.capabilities()).toMatchObject({ image: true, speech: true });
    const img = await exec.executeImage!({}, ctx);
    expect(img.traceId).toBe("");
    const speech = await exec.executeSpeech!({}, ctx);
    expect(speech.traceId).toBe("");
  });
});
