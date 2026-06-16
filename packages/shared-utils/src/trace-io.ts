/**
 * Canonical trace-level input/output derivation — the ONE definition of
 * "what is a trace's input and output", shared by every read path that
 * projects spans into a trace summary: the cloud gateway's
 * `transformTraceDetail`, the local CLI's `mapRawTraceToDetail`
 * (`GET /v1/traces/:id`), and the CLI's dataset import-from-traces source
 * mapper. Before this helper existed each call site had its own semantics
 * (root span vs first/last GENERATION span), so the same trace answered
 * differently depending on which endpoint you asked.
 *
 * Layered semantics, per-field:
 *
 * 1. **Root span first.** The WebhookRunner owns the prompt (root) span and
 *    records `agentmark.input` / `agentmark.output` on it — the true
 *    end-to-end request/response boundary. When the root span carries a
 *    value, it wins.
 * 2. **GENERATION fallback.** Traces emitted without the runner (third-party
 *    OTEL instrumentation pointed straight at the collector, or pre-runner
 *    SDK versions) have no root-span I/O. Fall back to the first GENERATION
 *    span's input and the last GENERATION span's output, in timestamp order
 *    — the model's view of the run.
 *
 * Fields resolve independently: a trace whose root span has only an output
 * (e.g. written by an older runner that recorded output but not input)
 * gets its input from the GENERATION fallback.
 */

/** Minimal span projection the derivation needs — both the camelCase
 * service-layer `Span` and mapped wire spans satisfy it. */
export interface TraceIOSpan {
  /** null/undefined/'' parent marks a root span. */
  parentId?: string | null;
  /** Span classification; only 'GENERATION' participates in the fallback. */
  type?: string | null;
  /** Sort key for first/last GENERATION. ISO strings and epoch numbers both
   * order correctly under `<`. */
  timestamp?: string | number;
  input?: unknown;
  output?: unknown;
}

export interface TraceIO {
  input?: unknown;
  output?: unknown;
}

/** Truthy-and-nonempty check that keeps non-string payloads (objects from
 * already-parsed wire spans) while rejecting '', null, undefined. */
function present(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.length > 0;
  return true;
}

/**
 * Derive trace-level input/output from a trace's spans. Returns each field
 * only when a value exists — callers spread the result so absent fields stay
 * absent on the wire (`{...deriveTraceIO(spans)}`).
 */
export function deriveTraceIO(spans: readonly TraceIOSpan[]): TraceIO {
  const rootSpan = spans.find((s) => !s.parentId) ?? spans[0];

  const generationSpans = spans
    .filter((s) => s.type === "GENERATION")
    .sort((a, b) => {
      const ta = a.timestamp ?? 0;
      const tb = b.timestamp ?? 0;
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

  const input = present(rootSpan?.input)
    ? rootSpan?.input
    : generationSpans.find((s) => present(s.input))?.input;

  const lastGenWithOutput = [...generationSpans]
    .reverse()
    .find((s) => present(s.output));
  const output = present(rootSpan?.output)
    ? rootSpan?.output
    : lastGenWithOutput?.output;

  return {
    ...(present(input) ? { input } : {}),
    ...(present(output) ? { output } : {}),
  };
}

/**
 * Canonical max characters of trace-level Input/Output read into a list-row
 * preview. ONE definition for every preview path so the boundary can never
 * drift between cloud and local: the cloud gateway truncates to this in
 * ClickHouse (`substringUTF8`), the local CLI server truncates to it in SQLite
 * (`substr`), and the trace lists size the muted preview line for it.
 */
export const TRACE_IO_PREVIEW_MAX_CHARS = 160;

/**
 * A preview-source span row: a {@link TraceIOSpan} tagged with the trace it
 * belongs to, so rows spanning many traces can be grouped into one preview per
 * trace.
 */
export interface TraceIOPreviewSourceRow extends TraceIOSpan {
  traceId: string;
}

/**
 * Subset of a trace-list row a preview attaches onto — `id` to match the
 * source rows, plus the two mutable preview fields.
 */
export interface TraceIOPreviewTarget {
  id: string;
  inputPreview?: string | null;
  outputPreview?: string | null;
}

/**
 * Attach truncated trace-level `inputPreview` / `outputPreview` onto a page of
 * trace-list rows, in place, from their preview-source spans. The ONE place the
 * "rows → one preview per trace" step lives, shared by the cloud trace service
 * (ClickHouse rows) and the local CLI server (SQLite rows) so the two never
 * derive previews differently.
 *
 * Rows are grouped by `traceId`, then each trace's spans run through the
 * canonical {@link deriveTraceIO} (root span wins, GENERATION fallback) — the
 * same helper the trace-detail drawer uses, so the list preview and the detail
 * never disagree about a trace's I/O. A trace with no rows is left untouched
 * (no preview); `deriveTraceIO`'s own emptiness check guarantees an assigned
 * field is a non-empty string, so a blank value never overwrites as `''`.
 */
export function attachTraceIOPreviews<T extends TraceIOPreviewTarget>(
  traces: T[],
  rows: readonly TraceIOPreviewSourceRow[],
): T[] {
  const spansByTrace = new Map<string, TraceIOSpan[]>();
  for (const row of rows) {
    const list = spansByTrace.get(row.traceId);
    if (list) list.push(row);
    else spansByTrace.set(row.traceId, [row]);
  }

  for (const trace of traces) {
    const spans = spansByTrace.get(trace.id);
    if (!spans) continue;
    const io = deriveTraceIO(spans);
    if (typeof io.input === "string") trace.inputPreview = io.input;
    if (typeof io.output === "string") trace.outputPreview = io.output;
  }

  return traces;
}
