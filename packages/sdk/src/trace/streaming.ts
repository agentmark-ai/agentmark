/**
 * Streaming-aware span wrapper.
 *
 * Why this exists: `span()` ends its underlying OTel span as soon as
 * its callback returns. A streaming prompt run returns a not-yet-
 * consumed stream from the callback, so any provider failure (LLM
 * 401, rate-limit 429, network drop) surfaces AFTER the span has
 * already been closed as OK. Result: the dashboard shows a green
 * check on a call that actually failed.
 *
 * `streamWithSpan` fixes that by inverting the control flow:
 *
 *   - The producer callback runs INSIDE the span and pushes encoded
 *     newline-delimited JSON chunks via `write(obj)`.
 *   - The consumer gets a `ReadableStream` immediately and reads in
 *     real time via a `TransformStream` pipe.
 *   - Provider failures inside the producer THROW. `span()` catches
 *     the throw, marks the OTel span ERROR, and ends it.
 *   - The consumer also receives a final `{ type: "error", error }`
 *     chunk so the CLI / webhook caller sees the failure.
 *
 * This is a structural fix — adapters that previously hand-rolled
 * `new ReadableStream({ async start(controller) { try {...} catch {...} } })`
 * around `span(...)` should call `streamWithSpan` instead so every
 * adapter shares the same span-error-propagation semantics.
 */

import { span } from './tracing';
import type { SpanContext } from './tracing';

function extractMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const e = error as Record<string, unknown>;
    const fromMessage = typeof e.message === 'string' ? e.message : undefined;
    const fromNested =
      typeof (e.error as Record<string, unknown> | undefined)?.message === 'string'
        ? ((e.error as Record<string, unknown>).message as string)
        : undefined;
    return fromMessage ?? fromNested ?? JSON.stringify(error);
  }
  return String(error);
}

export interface StreamWithSpanOptions {
  /** Span name shown in the trace UI (typically the prompt name). */
  name: string;
  /**
   * Optional structured input recorded on the span via
   * `ctx.setInput(...)` BEFORE the producer runs. Captured even if
   * the producer later throws, so failed runs still show what was
   * sent. Typically the assembled `{ messages, model, … }` payload
   * the provider received.
   */
  input?: unknown;
  /**
   * Producer callback that runs inside the span. Throw to mark the
   * span as ERROR. Calls to `write(obj)` enqueue a newline-delimited
   * JSON line on the consumer-facing readable stream.
   *
   * The second argument is the `SpanContext` — call `ctx.setOutput(
   * finalResult)` on success to populate the dashboard's Output panel
   * with the assembled response. `ctx.setAttribute(...)` and
   * `ctx.addEvent(...)` are also available.
   */
  produce: (
    write: (obj: unknown) => Promise<void>,
    ctx: SpanContext,
  ) => Promise<void>;
}

export interface StreamWithSpanResult {
  /** Consumer-facing readable stream. Read it as you would any web stream. */
  stream: ReadableStream<Uint8Array>;
  /** OTel trace id of the wrapping span, available as soon as the pump starts. */
  traceId: string;
}

/**
 * Wraps a streaming producer in an AgentMark span so the span's
 * status reflects the outcome of the underlying stream — even when
 * the stream produces an error after the producer returns.
 *
 * Usage:
 *
 *   const { stream, traceId } = await streamWithSpan({
 *     name: prompt.name,
 *     produce: async (write) => {
 *       const r = streamText({...});
 *       for await (const chunk of r.experimental_partialOutputStream) {
 *         await write({ type: 'object', result: chunk });
 *       }
 *     },
 *   });
 *   return { stream, traceId, ... };
 */
export async function streamWithSpan(
  opts: StreamWithSpanOptions,
): Promise<StreamWithSpanResult> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  let resolveTraceId!: (id: string) => void;
  const traceIdReady = new Promise<string>((res) => {
    resolveTraceId = res;
  });

  const pump = span({ name: opts.name }, async (ctx: SpanContext) => {
    resolveTraceId(ctx.traceId);
    // Record input UP FRONT so the dashboard's Input panel populates
    // even when the producer later throws. This is the whole reason
    // for the `input` option — pre-fix, the Input panel was empty on
    // every run (success or failure) because the runner never called
    // setInput, and the Vercel AI SDK's auto-instrumented child span
    // didn't always materialize.
    if (opts.input !== undefined) {
      ctx.setInput(opts.input);
    }
    let closed = false;
    try {
      await opts.produce(
        async (obj) => {
          await writer.write(encoder.encode(JSON.stringify(obj) + '\n'));
        },
        ctx,
      );
      await writer.close();
      closed = true;
    } catch (err) {
      const message = extractMessage(err);
      // Emit a terminal error chunk so the consumer sees the failure.
      // Wrapped in try/catch — the writer may already be unwritable
      // (e.g. consumer cancelled the stream).
      try {
        await writer.write(
          encoder.encode(JSON.stringify({ type: 'error', error: message }) + '\n'),
        );
      } catch {
        /* writer unwritable — error already surfaced through other means */
      }
      try {
        if (!closed) await writer.close();
      } catch {
        /* writer already closed */
      }
      // Re-throw so `span()` marks the span as ERROR.
      throw err;
    }
  });
  // The span has already recorded the error onto the OTel span on
  // rejection. Swallow here so the unhandled-rejection warning
  // doesn't fire from this background promise.
  pump.catch(() => {});

  const traceId = await traceIdReady;
  return { stream: readable, traceId };
}
