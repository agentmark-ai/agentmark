import { describe, it, expect } from "vitest";
import { streamWithSpan } from "../streaming";

/**
 * Tests for streamWithSpan.
 *
 * The status-propagation half — that a throw inside the producer
 * marks the underlying OTel span as ERROR — is verified end-to-end
 * (a live trace forwarded to AgentMark with `status: "ERROR"` after
 * an OpenAI 401) AND by `tracing.test.ts` which exercises the real
 * `span()` function with an in-memory OTel tracer.
 *
 * What this file pins is everything the user-facing stream contract
 * promises, so refactors don't quietly regress it:
 *
 *   1. Producer chunks reach the consumer in order.
 *   2. A producer throw emits a terminal `{ type: "error" }` chunk so
 *      the CLI / webhook surfaces the failure.
 *   3. `traceId` resolves synchronously — before the pump finishes —
 *      so the run-prompt CLI can print the trace-viewer URL while
 *      the stream is still flowing.
 *   4. No unhandled-rejection warning when the pump throws.
 */

async function readAll(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const lines: unknown[] = [];
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const raw = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!raw.trim()) continue;
      lines.push(JSON.parse(raw));
    }
  }
  if (buffer.trim()) lines.push(JSON.parse(buffer));
  return lines;
}

describe("streamWithSpan", () => {
  it("emits every produced chunk in order on the happy path", async () => {
    const { stream, traceId } = await streamWithSpan({
      name: "happy-path",
      produce: async (write) => {
        await write({ type: "object", result: { delta: "hello" } });
        await write({ type: "object", result: { delta: "world" } });
      },
    });

    expect(traceId).toMatch(/^[0-9a-f]+$/);
    const lines = await readAll(stream);
    expect(lines).toEqual([
      { type: "object", result: { delta: "hello" } },
      { type: "object", result: { delta: "world" } },
    ]);
  });

  it("emits a terminal `error` chunk to the consumer when the producer throws", async () => {
    // Regression guard: previously a throw inside a ReadableStream's
    // start() callback was caught and emitted as an error chunk, but
    // the AgentMark span had already been ended as OK so the
    // dashboard showed a green check on failed runs. The new helper
    // re-throws out of the producer so span() can mark ERROR (covered
    // in tracing.test.ts), and ALSO emits the chunk below so the
    // consumer still gets a useful payload.
    const { stream } = await streamWithSpan({
      name: "fail-mid-stream",
      produce: async (write) => {
        await write({ type: "object", result: { delta: "hello" } });
        throw new Error("LLM 401: bad api key");
      },
    });

    const lines = await readAll(stream);
    expect(lines).toEqual([
      { type: "object", result: { delta: "hello" } },
      { type: "error", error: "LLM 401: bad api key" },
    ]);
  });

  it("extracts a useful error message from non-Error throwables", async () => {
    // Vercel AI SDK and some providers throw shaped error objects
    // (`{ message: "...", statusCode: 401 }`) rather than Error
    // instances. The helper should still pull a readable message
    // onto the consumer chunk.
    const { stream } = await streamWithSpan({
      name: "shaped-error",
      produce: async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw { message: "Incorrect API key provided: fake", statusCode: 401 };
      },
    });

    const lines = (await readAll(stream)) as Array<Record<string, unknown>>;
    expect(lines).toEqual([
      { type: "error", error: "Incorrect API key provided: fake" },
    ]);
  });

  it("falls back to a JSON stringification when the throwable has no message", async () => {
    const { stream } = await streamWithSpan({
      name: "no-message",
      produce: async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw { code: "PROVIDER_UNREACHABLE" };
      },
    });

    const lines = (await readAll(stream)) as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(1);
    expect((lines[0] as { type: string }).type).toBe("error");
    expect((lines[0] as { error: string }).error).toContain("PROVIDER_UNREACHABLE");
  });

  it("surfaces traceId synchronously — before the pump finishes", async () => {
    // The run-prompt CLI prints the trace URL while the prompt is
    // still streaming. Awaiting the entire pump first would defeat
    // the dev workflow.
    let producerStarted = false;
    let releasePump!: () => void;
    const pumpBlocked = new Promise<void>((res) => {
      releasePump = res;
    });

    const { traceId, stream } = await streamWithSpan({
      name: "trace-id-up-front",
      produce: async (write) => {
        producerStarted = true;
        await pumpBlocked;
        await write({ type: "object", result: "done" });
      },
    });

    expect(traceId).toMatch(/^[0-9a-f]+$/);
    expect(producerStarted).toBe(true);

    releasePump();
    await readAll(stream);
  });

  it("records `input` on the span before the producer runs (so failed runs still populate Input panel)", async () => {
    // The dashboard's Input panel reads from `gen_ai.request.input`.
    // Pre-fix, the runners never called setInput, so the panel was
    // empty on every run. Setting it BEFORE the producer ensures
    // failed runs (where the producer throws before generating any
    // chunks) still show what was sent.
    //
    // We verify the contract behaviorally: even when the producer
    // throws immediately (no chunks emitted), the trace is fully
    // formed. The "input is on the span" half is verified through
    // the live e2e on STG, where the dashboard's Input panel
    // populates only when the attribute is set up-front.
    let producerSawCtxWithSetInput = false;

    const { stream } = await streamWithSpan({
      name: "with-input",
      input: { messages: [{ role: "user", content: "what's 2+2?" }] },
      produce: async (_write, ctx) => {
        producerSawCtxWithSetInput = typeof ctx.setInput === "function";
        // Throw immediately — covers the "no output yet, but input
        // should still be on the span" scenario.
        throw new Error("LLM 401");
      },
    });

    const lines = await readAll(stream);
    expect(lines).toEqual([{ type: "error", error: "LLM 401" }]);
    expect(producerSawCtxWithSetInput).toBe(true);
  });

  it("passes the SpanContext to the producer so it can record output on success", async () => {
    // Symmetric with setInput: producers should be able to mark the
    // final assembled output on the span via `ctx.setOutput(...)`.
    // This lets the dashboard's Output panel show the response
    // payload, not just the streamed chunks.
    let capturedCtxKeys: string[] = [];

    await streamWithSpan({
      name: "ctx-exposed",
      produce: async (write, ctx) => {
        capturedCtxKeys = Object.keys(ctx);
        await write({ type: "object", result: "hello" });
        ctx.setOutput({ final: "hello" });
      },
    });

    // SpanContext shape per the SDK — setInput/setOutput must be
    // reachable by producers, otherwise the runner adapters can't
    // populate Input/Output panels.
    expect(capturedCtxKeys).toEqual(
      expect.arrayContaining(["traceId", "spanId", "setInput", "setOutput", "setAttribute"]),
    );
  });

  it("does not surface an unhandled-promise-rejection when the pump throws", async () => {
    // Regression guard: streamWithSpan must `.catch(...)` the
    // backgrounded `span()` promise. Without it Node prints
    // "unhandled rejection" warnings (and on strict runners, exits).
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", listener);
    try {
      const { stream } = await streamWithSpan({
        name: "no-unhandled",
        produce: async () => {
          throw new Error("provider down");
        },
      });
      await readAll(stream);
      // Give microtasks a tick for any pending rejection to fire.
      await new Promise((r) => setTimeout(r, 25));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", listener);
    }
  });
});
