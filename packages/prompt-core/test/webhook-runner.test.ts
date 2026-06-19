/**
 * Direct unit tests for the shared WebhookRunner driven by SYNTHETIC executors
 * (no real SDK adapter). Closes the gap where the runner's branching — streaming
 * error chunks, tool-call/tool-result wire envelopes, the single usage-on-finish
 * channel for BYO object streams, per-row experiment error isolation, and abort
 * signal propagation — was only ever exercised indirectly (and only on the happy
 * path) through the v4/v5 adapter mocks.
 *
 * Each test pins the exact NDJSON the runner emits, so a regression in the
 * AgentEvent→wire translation fails loudly here rather than slipping through to
 * the cloud contract.
 */
import { describe, it, expect, vi } from "vitest";
import type {
  ExecCtx,
  ExecutorCapabilities,
  Executor,
  TextStreamEvent,
  ObjectStreamEvent,
  DatasetStreamChunk,
  SpanLike,
  ExperimentItemSpanHook,
  PromptSpanHook,
} from "../src/index";
import { WebhookRunner } from "../src/webhook-runner";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Drain an NDJSON ReadableStream into parsed objects. */
async function drain(stream: ReadableStream): Promise<any[]> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += typeof value === "string" ? value : dec.decode(value);
  }
  return buf
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

const TEXT_AST = {
  children: [{ type: "yaml", value: "text_config:\n  model_name: test\n" }],
} as any;
const OBJECT_AST = {
  children: [{ type: "yaml", value: "object_config:\n  model_name: test\n" }],
} as any;
const IMAGE_AST = {
  children: [{ type: "yaml", value: "image_config:\n  model_name: test\n" }],
} as any;
const SPEECH_AST = {
  children: [{ type: "yaml", value: "speech_config:\n  model_name: test\n" }],
} as any;
const EMPTY_AST = {
  children: [{ type: "yaml", value: "name: nope\n" }],
} as any;

/** Build an Executor from per-kind async generators (or text/object yields). */
function makeExecutor(impl: {
  text?: (formatted: unknown, ctx: ExecCtx) => AsyncIterable<TextStreamEvent>;
  object?: (formatted: unknown, ctx: ExecCtx) => AsyncIterable<ObjectStreamEvent>;
}): Executor & { lastCtx?: ExecCtx } {
  const exec: Executor & { lastCtx?: ExecCtx } = {
    name: "fake",
    capabilities: (): ExecutorCapabilities => ({
      text: !!impl.text,
      object: !!impl.object,
      image: false,
      speech: false,
    }),
    async *executeText(formatted, ctx) {
      exec.lastCtx = ctx;
      if (!impl.text) {
        yield { type: "error", error: "no text" };
        return;
      }
      yield* impl.text(formatted, ctx);
    },
    async *executeObject(formatted, ctx) {
      exec.lastCtx = ctx;
      if (!impl.object) {
        yield { type: "error", error: "no object" };
        return;
      }
      yield* impl.object(formatted, ctx);
    },
  };
  return exec;
}

/** Minimal client whose prompts format to a fixed value + stream a dataset. */
function makeClient(datasetItems: Array<DatasetStreamChunk<unknown> | { type: "error"; error: string }>) {
  const prompt = {
    async format() {
      return { _formatted: true };
    },
    async formatWithTestProps() {
      return { _formatted: true };
    },
    async formatWithDataset() {
      let i = 0;
      return new ReadableStream({
        pull(controller) {
          if (i < datasetItems.length) controller.enqueue(datasetItems[i++]);
          else controller.close();
        },
      });
    },
  };
  return {
    getLoader: () => ({}),
    getEvalRegistry: () => undefined,
    loadTextPrompt: async () => prompt,
    loadObjectPrompt: async () => prompt,
    loadImagePrompt: async () => prompt,
    loadSpeechPrompt: async () => prompt,
  } as any;
}

// ── HIGH #4: streaming text — tool-call / tool-result / finish wire + order ───

describe("WebhookRunner — streaming text wire (synthetic executor)", () => {
  it("emits the exact ordered NDJSON for delta + tool-call + tool-result + finish", async () => {
    const exec = makeExecutor({
      async *text() {
        yield { type: "text-delta", text: "Hi " };
        yield { type: "tool-call", id: "c1", name: "search", args: { q: "x" } };
        yield { type: "tool-result", id: "c1", name: "search", result: ["hit"] };
        yield { type: "text-delta", text: "done" };
        yield {
          type: "finish",
          reason: "stop",
          usage: { inputTokens: 3, outputTokens: 7, totalTokens: 10 },
        };
      },
    });
    const runner = new WebhookRunner(makeClient([]), exec);
    const res: any = await runner.runPrompt(TEXT_AST, { shouldStream: true });
    expect(res.type).toBe("stream");
    const lines = await drain(res.stream);
    // Positional: order is the contract (tool-call before tool-result, finish last).
    expect(lines).toEqual([
      { type: "text", result: "Hi " },
      { type: "text", toolCall: { toolCallId: "c1", toolName: "search", args: { q: "x" } } },
      { type: "text", toolResult: { toolCallId: "c1", toolName: "search", result: ["hit"] } },
      { type: "text", result: "done" },
      {
        type: "text",
        finishReason: "stop",
        usage: {
          inputTokens: 3,
          outputTokens: 7,
          totalTokens: 10,
          promptTokens: 3,
          completionTokens: 7,
        },
      },
    ]);
  });

  it("a yielded error becomes a terminal {type:error} chunk and closes the stream", async () => {
    const exec = makeExecutor({
      async *text() {
        yield { type: "text-delta", text: "partial" };
        yield { type: "error", error: "ThrottlingException" };
        // Anything after the error must NOT reach the wire.
        yield { type: "text-delta", text: "SHOULD NOT APPEAR" };
      },
    });
    const runner = new WebhookRunner(makeClient([]), exec);
    const res: any = await runner.runPrompt(TEXT_AST, { shouldStream: true });
    const lines = await drain(res.stream);
    expect(lines).toEqual([
      { type: "text", result: "partial" },
      { type: "error", error: "ThrottlingException" },
    ]);
  });

  it("a THROWN executor surfaces the extracted message as a terminal error chunk", async () => {
    const exec = makeExecutor({
      // eslint-disable-next-line require-yield
      async *text() {
        throw new Error("boom-from-iterator");
      },
    });
    const runner = new WebhookRunner(makeClient([]), exec);
    const res: any = await runner.runPrompt(TEXT_AST, { shouldStream: true });
    const lines = await drain(res.stream);
    expect(lines).toEqual([{ type: "error", error: "boom-from-iterator" }]);
  });
});

// ── HIGH #4 (C2): streaming OBJECT usage rides on finish ──────────────────────

describe("WebhookRunner — streaming object usage-on-finish (BYO regression guard)", () => {
  it("emits the usage chunk from finish.usage (not a standalone usage event)", async () => {
    const exec = makeExecutor({
      async *object() {
        yield { type: "object-delta", partial: { a: null } };
        yield { type: "object-delta", partial: { a: 1 } };
        yield { type: "object-final", value: { a: 1 } };
        yield {
          type: "finish",
          reason: "stop",
          usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
        };
      },
    });
    const runner = new WebhookRunner(makeClient([]), exec);
    const res: any = await runner.runPrompt(OBJECT_AST, { shouldStream: true });
    const lines = await drain(res.stream);
    expect(lines).toEqual([
      { type: "object", result: { a: null } },
      { type: "object", result: { a: 1 } },
      { type: "object", result: { a: 1 } },
      {
        type: "object",
        usage: {
          inputTokens: 5,
          outputTokens: 10,
          totalTokens: 15,
          promptTokens: 5,
          completionTokens: 10,
        },
      },
    ]);
  });

  it("emits NO usage chunk when finish carries no usage (false branch)", async () => {
    const exec = makeExecutor({
      async *object() {
        yield { type: "object-final", value: { a: 1 } };
        yield { type: "finish", reason: "stop" }; // no usage
      },
    });
    const runner = new WebhookRunner(makeClient([]), exec);
    const res: any = await runner.runPrompt(OBJECT_AST, { shouldStream: true });
    const lines = await drain(res.stream);
    expect(lines).toEqual([{ type: "object", result: { a: 1 } }]);
    expect(lines.some((l) => "usage" in l)).toBe(false);
  });
});

// ── CRITICAL #1 (partial): abort signal propagation ──────────────────────────

describe("WebhookRunner — abort signal propagation", () => {
  it("threads options.signal into the executor's ExecCtx for streaming runPrompt", async () => {
    const controller = new AbortController();
    const exec = makeExecutor({
      async *text() {
        yield { type: "text-delta", text: "ok" };
        yield { type: "finish", reason: "stop", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    });
    const runner = new WebhookRunner(makeClient([]), exec);
    const res: any = await runner.runPrompt(TEXT_AST, {
      shouldStream: true,
      signal: controller.signal,
    });
    await drain(res.stream);
    // Deleting `signal: options?.signal` in the runner would null this out.
    expect(exec.lastCtx?.signal).toBe(controller.signal);
  });
});

// ── CRITICAL #3 + MEDIUM #6: experiment per-row isolation + attribution ──────

describe("WebhookRunner — runExperiment (synthetic executor)", () => {
  const datasetItem = (input: Record<string, unknown>): DatasetStreamChunk<unknown> => ({
    type: "dataset",
    dataset: { input },
    formatted: input,
    evals: [],
  });

  it("isolates a per-row failure: a throwing row emits {type:error}, siblings still produce dataset rows", async () => {
    const exec = makeExecutor({
      async *text(formatted) {
        const f = formatted as { id: number };
        if (f.id === 1) {
          yield { type: "error", error: "row-1-failed" };
          return;
        }
        yield { type: "text-delta", text: `out-${f.id}` };
        yield { type: "finish", reason: "stop", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    });
    const client = makeClient([
      datasetItem({ id: 0 }),
      datasetItem({ id: 1 }), // this row errors
      datasetItem({ id: 2 }),
    ]);
    const runner = new WebhookRunner(client, exec);
    // Must NOT reject the whole pool on the bad row.
    const res = await runner.runExperiment(TEXT_AST, "run-iso", { datasetPath: "ds.jsonl" });
    const lines = await drain(res.stream);

    const datasets = lines.filter((l) => l.type === "dataset");
    const errors = lines.filter((l) => l.type === "error");
    expect(datasets).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toContain("row-1-failed");
    // Self-describing rows: each output corresponds to its OWN input (no swap).
    const byInput = new Map(datasets.map((d) => [d.result.input.id, d.result.actualOutput]));
    expect(byInput.get(0)).toBe("out-0");
    expect(byInput.get(2)).toBe("out-2");
  });

  it("attributes each output to its own input under varied per-row latency (no cross-talk)", async () => {
    // Later indices resolve FIRST, so completion-order != dataset-order. Each
    // dataset chunk must still carry its own input↔output pairing.
    const exec = makeExecutor({
      async *text(formatted) {
        const f = formatted as { id: number };
        // id 0 is slowest, id 2 fastest → completion order is 2,1,0.
        await new Promise((r) => setTimeout(r, (3 - f.id) * 5));
        yield { type: "text-delta", text: `echo-${f.id}` };
        yield { type: "finish", reason: "stop", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    });
    const client = makeClient([
      datasetItem({ id: 0 }),
      datasetItem({ id: 1 }),
      datasetItem({ id: 2 }),
    ]);
    const runner = new WebhookRunner(client, exec);
    const res = await runner.runExperiment(TEXT_AST, "run-attr", { datasetPath: "ds.jsonl" });
    const lines = await drain(res.stream);
    const datasets = lines.filter((l) => l.type === "dataset");
    expect(datasets).toHaveLength(3);
    for (const d of datasets) {
      // The round-trip: output must echo this row's OWN input id.
      expect(d.result.actualOutput).toBe(`echo-${d.result.input.id}`);
    }
  });

  it("surfaces a malformed dataset row ({type:error}) as an error chunk", async () => {
    const exec = makeExecutor({
      async *text() {
        yield { type: "text-delta", text: "ok" };
        yield { type: "finish", reason: "stop", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    });
    const client = makeClient([
      datasetItem({ id: 0 }),
      { type: "error", error: "row missing input wrapper" },
    ]);
    const runner = new WebhookRunner(client, exec);
    const res = await runner.runExperiment(TEXT_AST, "run-bad", { datasetPath: "ds.jsonl" });
    const lines = await drain(res.stream);
    expect(lines.filter((l) => l.type === "dataset")).toHaveLength(1);
    expect(lines.filter((l) => l.type === "error")).toHaveLength(1);
  });

  it("stops dispatching rows once options.signal is aborted (cancellation)", async () => {
    const controller = new AbortController();
    let calls = 0;
    const exec = makeExecutor({
      async *text(formatted) {
        calls += 1;
        // Cancel after the first row — the pool must not pull the rest.
        controller.abort();
        yield { type: "text-delta", text: `out-${(formatted as { id: number }).id}` };
        yield { type: "finish", reason: "stop", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    });
    const client = makeClient([
      datasetItem({ id: 0 }),
      datasetItem({ id: 1 }),
      datasetItem({ id: 2 }),
    ]);
    const runner = new WebhookRunner(client, exec);
    // concurrency 1 makes the dispatch order deterministic: row 0 runs, aborts,
    // and the pool's pre-read signal check stops it before rows 1 and 2.
    const res = await runner.runExperiment(TEXT_AST, "run-cancel", {
      datasetPath: "ds.jsonl",
      concurrency: 1,
      signal: controller.signal,
    });
    const lines = await drain(res.stream);
    expect(calls).toBe(1); // only the first row executed
    expect(lines.filter((l) => l.type === "dataset")).toHaveLength(1);
  });
});

// ── Non-streaming runPrompt (text + object) ──────────────────────────────────

describe("WebhookRunner — non-streaming text runPrompt", () => {
  it("collapses deltas into one text result, collects tool calls/results, and maps usage", async () => {
    const exec = makeExecutor({
      async *text() {
        yield { type: "text-delta", text: "Hello " };
        yield { type: "text-delta", text: "world" };
        yield { type: "tool-call", id: "c1", name: "search", args: { q: "x" } };
        yield { type: "tool-result", id: "c1", name: "search", result: ["hit"] };
        yield {
          type: "finish",
          reason: "stop",
          usage: { inputTokens: 2, outputTokens: 4, totalTokens: 6 },
        };
      },
    });
    const runner = new WebhookRunner(makeClient([]), exec);

    const res: any = await runner.runPrompt(TEXT_AST, { shouldStream: false });

    expect(res).toEqual({
      type: "text",
      result: "Hello world",
      usage: {
        inputTokens: 2,
        outputTokens: 4,
        totalTokens: 6,
        promptTokens: 2,
        completionTokens: 4,
      },
      finishReason: "stop",
      toolCalls: [{ toolCallId: "c1", toolName: "search", args: { q: "x" } }],
      toolResults: [{ toolCallId: "c1", toolName: "search", result: ["hit"] }],
      // traceId omitted: null span hooks yield an empty trace id, and the
      // canonical envelope (response-envelopes.json vectors) drops the key
      // rather than emitting "" — matching the Python runner.
    });
  });

  it("throws the collected error AFTER emitting the observation when a stream yields error", async () => {
    const observed: any[] = [];
    const exec = makeExecutor({
      async *text() {
        yield { type: "text-delta", text: "partial" };
        yield { type: "error", error: "downstream exploded" };
      },
    });
    const runner = new WebhookRunner(makeClient([]), exec, {
      observationHook: async (o) => {
        observed.push(o);
      },
    });

    await expect(
      runner.runPrompt(TEXT_AST, { shouldStream: false })
    ).rejects.toThrow("downstream exploded");

    // Observation must still fire (the failure is reported), with the error captured.
    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({
      kind: "text",
      error: "downstream exploded",
      output: "partial",
    });
  });

  it("omits usage when finish carries none and defaults shouldStream when omitted (uses customProps path)", async () => {
    const exec = makeExecutor({
      async *text(formatted) {
        // Prove customProps were threaded through to format() output.
        yield { type: "text-delta", text: JSON.stringify(formatted) };
        yield { type: "finish", reason: "length" };
      },
    });
    const client = makeClient([]);
    // Override format so the custom-props branch returns the props verbatim.
    client.loadTextPrompt = async () => ({
      format: async ({ props }: any) => props,
      formatWithTestProps: async () => ({ _formatted: true }),
    });
    const runner = new WebhookRunner(client, exec);

    const res: any = await runner.runPrompt(TEXT_AST, {
      shouldStream: false,
      customProps: { topic: "cats" },
    });

    expect(res.result).toBe(JSON.stringify({ topic: "cats" }));
    expect(res.finishReason).toBe("length");
    expect("usage" in res ? res.usage : undefined).toBeUndefined();
  });
});

describe("WebhookRunner — non-streaming object runPrompt", () => {
  it("returns the object-final value with mapped usage", async () => {
    const exec = makeExecutor({
      async *object() {
        yield { type: "object-delta", partial: { a: null } };
        yield { type: "object-final", value: { a: 1 } };
        yield {
          type: "finish",
          reason: "stop",
          usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
        };
      },
    });
    const runner = new WebhookRunner(makeClient([]), exec);

    const res: any = await runner.runPrompt(OBJECT_AST, { shouldStream: false });

    expect(res).toEqual({
      type: "object",
      result: { a: 1 },
      usage: {
        inputTokens: 5,
        outputTokens: 10,
        totalTokens: 15,
        promptTokens: 5,
        completionTokens: 10,
      },
      finishReason: "stop",
      // traceId omitted — see the text run above (canonical empty-omission).
    });
  });

  it("falls back to the last object-delta when no object-final arrives", async () => {
    const exec = makeExecutor({
      async *object() {
        yield { type: "object-delta", partial: { a: 1 } };
        yield { type: "object-delta", partial: { a: 1, b: 2 } };
        yield { type: "finish", reason: "stop" };
      },
    });
    const runner = new WebhookRunner(makeClient([]), exec);

    const res: any = await runner.runPrompt(OBJECT_AST, { shouldStream: false });

    expect(res.result).toEqual({ a: 1, b: 2 });
    expect("usage" in res ? res.usage : undefined).toBeUndefined();
  });

  it("throws the object stream error after emitting its observation", async () => {
    const observed: any[] = [];
    const exec = makeExecutor({
      async *object() {
        yield { type: "object-final", value: { a: 1 } };
        yield { type: "error", error: "object boom" };
      },
    });
    const runner = new WebhookRunner(makeClient([]), exec, {
      observationHook: async (o) => observed.push(o),
    });

    await expect(
      runner.runPrompt(OBJECT_AST, { shouldStream: false })
    ).rejects.toThrow("object boom");
    expect(observed[0]).toMatchObject({ kind: "object", error: "object boom" });
  });
});

// ── runPrompt image / speech dispatch + capability gating ────────────────────

describe("WebhookRunner — image/speech runPrompt", () => {
  function makeMediaExecutor(opts: {
    image?: (formatted: unknown, ctx: ExecCtx) => Promise<any>;
    speech?: (formatted: unknown, ctx: ExecCtx) => Promise<any>;
  }): Executor {
    const exec: any = {
      name: "media",
      capabilities: (): ExecutorCapabilities => ({
        text: false,
        object: false,
        image: !!opts.image,
        speech: !!opts.speech,
      }),
      async *executeText() {
        yield { type: "error", error: "unused" };
      },
      async *executeObject() {
        yield { type: "error", error: "unused" };
      },
    };
    if (opts.image) exec.executeImage = opts.image;
    if (opts.speech) exec.executeSpeech = opts.speech;
    return exec as Executor;
  }

  it("returns the image result spread with the span traceId", async () => {
    const exec = makeMediaExecutor({
      image: async () => ({ type: "image", result: ["data:img"] }),
    });
    const runner = new WebhookRunner(makeClient([]), exec);

    const res: any = await runner.runPrompt(IMAGE_AST);

    expect(res).toEqual({ type: "image", result: ["data:img"], traceId: "" });
  });

  it("throws when the executor lacks image capability", async () => {
    const exec = makeMediaExecutor({}); // image capability false, no executeImage
    const runner = new WebhookRunner(makeClient([]), exec);

    await expect(runner.runPrompt(IMAGE_AST)).rejects.toThrow(
      "Executor 'media' does not support image prompts."
    );
  });

  it("returns the speech result spread with the span traceId", async () => {
    const exec = makeMediaExecutor({
      speech: async () => ({ type: "speech", result: "data:audio" }),
    });
    const runner = new WebhookRunner(makeClient([]), exec);

    const res: any = await runner.runPrompt(SPEECH_AST);

    expect(res).toEqual({ type: "speech", result: "data:audio", traceId: "" });
  });

  it("throws when the executor lacks speech capability", async () => {
    const exec = makeMediaExecutor({});
    const runner = new WebhookRunner(makeClient([]), exec);

    await expect(runner.runPrompt(SPEECH_AST)).rejects.toThrow(
      "Executor 'media' does not support speech prompts."
    );
  });

  // ── setSpanOutput: capture the generated media on the span ──────────────────
  // Without this the image/audio output is never recorded on a span, so the
  // gateway has nothing to offload to object storage and the trace viewer has
  // nothing to render.
  function makeCapturingPromptHook() {
    const attrs: Record<string, string | number> = {};
    const span: SpanLike = { traceId: "", setAttribute: (k, v) => { attrs[k] = v; } };
    const hook = (async <T>(_p: unknown, fn: (s: SpanLike) => Promise<T>) => {
      const result = await fn(span);
      return { result, traceId: span.traceId };
    }) as PromptSpanHook;
    return { hook, attrs };
  }

  it("captures the image result onto the span as agentmark.output (JSON array)", async () => {
    const { hook, attrs } = makeCapturingPromptHook();
    const media = [{ mimeType: "image/png", base64: "iVBOR" }];
    const exec = makeMediaExecutor({ image: async () => ({ type: "image", result: media }) });
    const runner = new WebhookRunner(makeClient([]), exec, { promptSpanHook: hook });

    await runner.runPrompt(IMAGE_AST);

    expect(attrs["agentmark.output"]).toBe(JSON.stringify(media));
    expect(attrs["gen_ai.request.model"]).toBe("test"); // setSpanModel still runs
  });

  it("captures the speech result onto the span as agentmark.output", async () => {
    const { hook, attrs } = makeCapturingPromptHook();
    const audio = { mimeType: "audio/mpeg", base64: "SUQz", format: "mp3" };
    const exec = makeMediaExecutor({ speech: async () => ({ type: "speech", result: audio }) });
    const runner = new WebhookRunner(makeClient([]), exec, { promptSpanHook: hook });

    await runner.runPrompt(SPEECH_AST);

    expect(attrs["agentmark.output"]).toBe(JSON.stringify(audio));
  });

  it("does not break the run when setAttribute throws (tracing is best-effort)", async () => {
    const span: SpanLike = {
      traceId: "",
      setAttribute: () => { throw new Error("span backend down"); },
    };
    const hook = (async <T>(_p: unknown, fn: (s: SpanLike) => Promise<T>) => {
      const result = await fn(span);
      return { result, traceId: span.traceId };
    }) as PromptSpanHook;
    const exec = makeMediaExecutor({
      image: async () => ({ type: "image", result: [{ mimeType: "image/png", base64: "x" }] }),
    });
    const runner = new WebhookRunner(makeClient([]), exec, { promptSpanHook: hook });

    // setSpanInput/Model/Output all swallow errors — the run still returns.
    const res: any = await runner.runPrompt(IMAGE_AST);
    expect(res.type).toBe("image");
  });

  it("throws 'Invalid prompt' when frontmatter declares no recognized config", async () => {
    const exec = makeMediaExecutor({});
    const runner = new WebhookRunner(makeClient([]), exec);

    await expect(runner.runPrompt(EMPTY_AST)).rejects.toThrow("Invalid prompt");
  });
});

// ── runExperiment: evals, image/speech datasets, and guard errors ────────────

describe("WebhookRunner — runExperiment evals", () => {
  const datasetItem = (
    input: Record<string, unknown>,
    extra?: Partial<DatasetStreamChunk<unknown>>
  ): DatasetStreamChunk<unknown> => ({
    type: "dataset",
    dataset: { input, expected_output: "gold" },
    formatted: input,
    evals: [],
    ...extra,
  });

  it("runs registered evaluators and attaches their scores; skips unregistered names", async () => {
    const exec = makeExecutor({
      async *text(formatted) {
        yield { type: "text-delta", text: `out-${(formatted as any).id}` };
        yield { type: "finish", reason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      },
    });
    const exactMatch = vi.fn();
    const client = makeClient([
      datasetItem({ id: 0 }, { evals: ["exact_match", "ghost_eval"] }),
    ]);
    client.getEvalRegistry = () => ({
      exact_match: async ({ output, expectedOutput }: any) => {
        exactMatch({ output, expectedOutput });
        return { score: output === expectedOutput ? 1 : 0, label: "mismatch" };
      },
      // ghost_eval is intentionally NOT registered name-wise via the item list above
    });
    const runner = new WebhookRunner(client, exec);

    const res = await runner.runExperiment(TEXT_AST, "run-eval", { datasetPath: "ds.jsonl" });
    const lines = await drain(res.stream);

    const dataset = lines.find((l) => l.type === "dataset");
    expect(dataset.result.evals).toEqual([
      { name: "exact_match", score: 0, label: "mismatch" },
    ]);
    // Evaluator received this row's actual output + expected output.
    expect(exactMatch).toHaveBeenCalledWith({
      output: "out-0",
      expectedOutput: "gold",
    });
  });

  it("emits an empty evals array when the eval registry is absent", async () => {
    const exec = makeExecutor({
      async *text() {
        yield { type: "text-delta", text: "x" };
        yield { type: "finish", reason: "stop" };
      },
    });
    const client = makeClient([datasetItem({ id: 0 }, { evals: ["exact_match"] })]);
    // getEvalRegistry returns undefined (default) — eval block must be skipped.
    const runner = new WebhookRunner(client, exec);

    const res = await runner.runExperiment(TEXT_AST, "run-noreg", { datasetPath: "ds.jsonl" });
    const lines = await drain(res.stream);

    expect(lines.find((l) => l.type === "dataset").result.evals).toEqual([]);
  });
});

describe("WebhookRunner — runExperiment image/speech datasets", () => {
  const dsItem = (input: Record<string, unknown>): any => ({
    type: "dataset",
    dataset: { input, expected_output: "gold" },
    formatted: input,
  });

  function mediaExecutor(kind: "image" | "speech"): Executor {
    const exec: any = {
      name: "media",
      capabilities: () => ({ text: false, object: false, image: kind === "image", speech: kind === "speech" }),
      async *executeText() {
        yield { type: "error", error: "unused" };
      },
      async *executeObject() {
        yield { type: "error", error: "unused" };
      },
    };
    if (kind === "image")
      exec.executeImage = async (f: any) => ({ type: "image", result: `img-${f.id}` });
    else
      exec.executeSpeech = async (f: any) => ({ type: "speech", result: `audio-${f.id}` });
    return exec as Executor;
  }

  it("streams a dataset row per image item with actualOutput from executeImage", async () => {
    const client = makeClient([dsItem({ id: 0 }), dsItem({ id: 1 })]);
    const runner = new WebhookRunner(client, mediaExecutor("image"));

    const res = await runner.runExperiment(IMAGE_AST, "run-img", { datasetPath: "ds.jsonl" });
    const lines = await drain(res.stream);

    const datasets = lines.filter((l) => l.type === "dataset");
    const outputs = datasets.map((d) => d.result.actualOutput).sort();
    expect(outputs).toEqual(["img-0", "img-1"]);
    expect(datasets[0].result.evals).toEqual([]);
  });

  it("surfaces a malformed image dataset row as an error chunk", async () => {
    const client = makeClient([
      dsItem({ id: 0 }),
      { type: "error", error: "bad image row" },
    ]);
    const runner = new WebhookRunner(client, mediaExecutor("image"));

    const res = await runner.runExperiment(IMAGE_AST, "run-img-bad", { datasetPath: "ds.jsonl" });
    const lines = await drain(res.stream);

    expect(lines.filter((l) => l.type === "dataset")).toHaveLength(1);
    expect(lines.filter((l) => l.type === "error")).toHaveLength(1);
  });

  it("isolates a throwing image row: it errors while siblings still emit", async () => {
    const exec: any = mediaExecutor("image");
    exec.executeImage = async (f: any) => {
      if (f.id === 1) throw new Error("img-1-failed");
      return { type: "image", result: `img-${f.id}` };
    };
    const client = makeClient([dsItem({ id: 0 }), dsItem({ id: 1 }), dsItem({ id: 2 })]);
    const runner = new WebhookRunner(client, exec);

    const res = await runner.runExperiment(IMAGE_AST, "run-img-iso", { datasetPath: "ds.jsonl" });
    const lines = await drain(res.stream);

    expect(lines.filter((l) => l.type === "dataset")).toHaveLength(2);
    expect(lines.filter((l) => l.type === "error")).toHaveLength(1);
  });

  it("throws when running an image experiment on an executor without executeImage", async () => {
    const textOnly = makeExecutor({
      async *text() {
        yield { type: "finish", reason: "stop" };
      },
    });
    const client = makeClient([dsItem({ id: 0 })]);
    const runner = new WebhookRunner(client, textOnly);

    await expect(
      runner.runExperiment(IMAGE_AST, "run-img-nocap", { datasetPath: "ds.jsonl" })
    ).rejects.toThrow("Executor 'fake' does not support image prompts.");
  });

  it("streams a dataset row per speech item with actualOutput from executeSpeech", async () => {
    const client = makeClient([dsItem({ id: 0 })]);
    const runner = new WebhookRunner(client, mediaExecutor("speech"));

    const res = await runner.runExperiment(SPEECH_AST, "run-speech", { datasetPath: "ds.jsonl" });
    const lines = await drain(res.stream);

    const dataset = lines.find((l) => l.type === "dataset");
    expect(dataset.result.actualOutput).toBe("audio-0");
    expect(dataset.result.evals).toEqual([]);
  });

  it("throws when running a speech experiment on an executor without executeSpeech", async () => {
    const textOnly = makeExecutor({
      async *text() {
        yield { type: "finish", reason: "stop" };
      },
    });
    const client = makeClient([dsItem({ id: 0 })]);
    const runner = new WebhookRunner(client, textOnly);

    await expect(
      runner.runExperiment(SPEECH_AST, "run-speech-nocap", { datasetPath: "ds.jsonl" })
    ).rejects.toThrow("Executor 'fake' does not support speech prompts.");
  });
});

describe("WebhookRunner — runExperiment guards", () => {
  it("throws 'Loader not found' when the client exposes no loader", async () => {
    const exec = makeExecutor({
      async *text() {
        yield { type: "finish", reason: "stop" };
      },
    });
    const client = makeClient([]);
    client.getLoader = () => undefined;
    const runner = new WebhookRunner(client, exec);

    await expect(runner.runExperiment(TEXT_AST, "run-noloader")).rejects.toThrow(
      "Loader not found"
    );
  });

  it("throws 'Invalid prompt' when the experiment frontmatter declares no config", async () => {
    const exec = makeExecutor({
      async *text() {
        yield { type: "finish", reason: "stop" };
      },
    });
    const runner = new WebhookRunner(makeClient([]), exec);

    await expect(runner.runExperiment(EMPTY_AST, "run-invalid")).rejects.toThrow(
      "Invalid prompt"
    );
  });
});

// ── REGRESSION: runExperiment must enable telemetry per row ───────────────────
//
// Bug: runExperiment called `formatWithDataset({ datasetPath, sampling })`
// without telemetry, so the adapter never authored `experimental_telemetry` and
// the AI SDK emitted NO generation span for experiments (run-prompt threaded it
// via createPromptTelemetry and was unaffected). The wrapper span survived
// because it comes from the span hook, masking the gap. Lock the contract:
// telemetry must reach formatWithDataset so the adapter can author it per row.

describe("WebhookRunner — runExperiment enables telemetry per row (regression)", () => {
  function makeCapturingClient() {
    const calls: any[] = [];
    const prompt = {
      async format() {
        return { _formatted: true };
      },
      async formatWithTestProps() {
        return { _formatted: true };
      },
      async formatWithDataset(opts: any) {
        calls.push(opts);
        return new ReadableStream({
          pull(c) {
            c.close();
          },
        });
      },
    };
    const client = {
      getLoader: () => ({}),
      getEvalRegistry: () => undefined,
      loadTextPrompt: async () => prompt,
      loadObjectPrompt: async () => prompt,
      loadImagePrompt: async () => prompt,
      loadSpeechPrompt: async () => prompt,
    } as any;
    return { client, calls };
  }

  it("threads enabled telemetry into formatWithDataset for a text experiment", async () => {
    const { client, calls } = makeCapturingClient();
    const exec = makeExecutor({
      async *text() {
        yield { type: "finish", reason: "stop" };
      },
    });

    await new WebhookRunner(client, exec).runExperiment(TEXT_AST, "run-1");

    expect(calls).toHaveLength(1);
    // Exact shape: enabled + default trace_name (TEXT_AST declares no name).
    expect(calls[0].telemetry).toEqual({
      isEnabled: true,
      metadata: { trace_name: "prompt-run" },
    });
  });

  it("merges caller-supplied telemetry into formatWithDataset", async () => {
    const { client, calls } = makeCapturingClient();
    const exec = makeExecutor({
      async *object() {
        yield { type: "finish", reason: "stop" };
      },
    });

    await new WebhookRunner(client, exec).runExperiment(OBJECT_AST, "run-2", {
      telemetry: { isEnabled: true, metadata: { user_id: "u1" } },
    });

    expect(calls[0].telemetry).toEqual({
      isEnabled: true,
      metadata: { user_id: "u1", trace_name: "prompt-run" },
    });
  });
});

// ── REGRESSION: experiment item spans must carry model/classify/usage attrs ──
//
// Bug: process_item (both Python and TS) never called setSpanModel,
// classifySpanAsLlm, or setSpanUsage on the per-row span. Symptoms:
//   - Requests view showed "No Requests" (classifySpanAsLlm missing → span
//     type != GENERATION → dashboard WHERE Type='GENERATION' returned nothing)
//   - Model column showed "-" (setSpanModel never called)
//   - Tokens column showed 0 (setSpanUsage never called + tokens wire field
//     was None when totalTokens was absent)

describe("WebhookRunner — runExperiment item span attributes (regression)", () => {
  /** Capturing SpanLike that records every setAttribute call. */
  function makeCapturingSpan(): SpanLike & { attrs: Record<string, string | number> } {
    const attrs: Record<string, string | number> = {};
    return {
      traceId: "abc123",
      setAttribute(key: string, value: string | number) { attrs[key] = value; },
      attrs,
    };
  }

  /** ExperimentItemSpanHook that uses the capturing span and exposes it. */
  function makeCapturingHook(): {
    hook: ExperimentItemSpanHook;
    span: ReturnType<typeof makeCapturingSpan>;
  } {
    const span = makeCapturingSpan();
    const hook = (async <T>(_params: unknown, fn: (s: SpanLike) => Promise<T>) => {
      const result = await fn(span);
      return { result, traceId: span.traceId };
    }) as ExperimentItemSpanHook;
    return { hook, span };
  }

  const datasetItem = (input: Record<string, unknown>): DatasetStreamChunk<unknown> => ({
    type: "dataset",
    dataset: { input },
    formatted: input,
    evals: [],
  });

  it("stamps gen_ai.request.model and classifies as llm on the item span", async () => {
    const { hook, span } = makeCapturingHook();
    const exec = makeExecutor({
      async *text() {
        yield { type: "finish", reason: "stop", usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } };
      },
    });
    const client = makeClient([datasetItem({ x: 1 })]);
    const runner = new WebhookRunner(client, exec, { experimentItemSpanHook: hook });
    const res = await runner.runExperiment(TEXT_AST, "run-span-attrs");
    await drain(res.stream);

    // setSpanModel: reads model_name from text_config
    expect(span.attrs["gen_ai.request.model"]).toBe("test");
    // classifySpanAsLlm: both attributes required for Requests view
    expect(span.attrs["gen_ai.operation.name"]).toBe("chat");
    expect(span.attrs["agentmark.span.kind"]).toBe("llm");
  });

  it("stamps gen_ai.usage.* on the item span from finish.usage", async () => {
    const { hook, span } = makeCapturingHook();
    const exec = makeExecutor({
      async *text() {
        yield { type: "finish", reason: "stop", usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } };
      },
    });
    const client = makeClient([datasetItem({ x: 1 })]);
    const runner = new WebhookRunner(client, exec, { experimentItemSpanHook: hook });
    const res = await runner.runExperiment(TEXT_AST, "run-usage-attrs");
    await drain(res.stream);

    expect(span.attrs["gen_ai.usage.input_tokens"]).toBe(10);
    expect(span.attrs["gen_ai.usage.output_tokens"]).toBe(20);
  });

  it("uses totalTokens for the wire tokens field when present", async () => {
    const exec = makeExecutor({
      async *text() {
        yield { type: "text-delta", text: "hi" };
        yield { type: "finish", reason: "stop", usage: { inputTokens: 3, outputTokens: 7, totalTokens: 10 } };
      },
    });
    const client = makeClient([datasetItem({ x: 1 })]);
    const runner = new WebhookRunner(client, exec);
    const res = await runner.runExperiment(TEXT_AST, "run-tokens-total");
    const lines = await drain(res.stream);
    const row = lines.find((l) => l.type === "dataset");
    expect(row?.result?.tokens).toBe(10);
  });

  it("falls back to inputTokens+outputTokens for tokens when totalTokens is absent", async () => {
    const exec = makeExecutor({
      async *text() {
        yield { type: "text-delta", text: "hi" };
        // no totalTokens field
        yield { type: "finish", reason: "stop", usage: { inputTokens: 4, outputTokens: 6 } };
      },
    });
    const client = makeClient([datasetItem({ x: 1 })]);
    const runner = new WebhookRunner(client, exec);
    const res = await runner.runExperiment(TEXT_AST, "run-tokens-fallback");
    const lines = await drain(res.stream);
    const row = lines.find((l) => l.type === "dataset");
    expect(row?.result?.tokens).toBe(10); // 4 + 6
  });
});
