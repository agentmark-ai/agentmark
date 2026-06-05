/**
 * In-memory OTLP capture for tracing tests.
 *
 * The tracing suites used to stand up a real local HTTP collector and point the
 * SDK's OTLPTraceExporter at it, then poll the received OTLP JSON. Under
 * concurrent test execution the real HTTP export/flush round-trip
 * intermittently deadlocked, hanging the test until its 120s timeout (~20-30%
 * of runs). Routing the exporter to an InMemorySpanExporter removes the network
 * entirely: export is synchronous, so assertions are deterministic and fast.
 *
 * Each test file gets its own `memoryExporter` instance (vitest isolates module
 * state per file). Wire it up by mocking the OTLP exporter module at the top of
 * the test file:
 *
 *   vi.mock("@opentelemetry/exporter-trace-otlp-http", async () => {
 *     const { memoryExporter } = await import("./otlp-memory");
 *     return {
 *       OTLPTraceExporter: class {
 *         export(spans, cb) { memoryExporter.export(spans, cb); }
 *         async shutdown() {}
 *         async forceFlush() {}
 *       },
 *     };
 *   });
 *
 * Captured spans are read AFTER the SDK's span processors run (including the
 * MaskingSpanProcessor), so masking assertions still hold.
 */
import {
  InMemorySpanExporter,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";

export const memoryExporter = new InMemorySpanExporter();

/** Clear captured spans — call in beforeEach so each test sees only its own. */
export function resetCapturedSpans(): void {
  memoryExporter.reset();
}

/**
 * A captured span normalized to the shape the tracing tests assert against
 * (mirrors the old parsed-OTLP shape: `.span.{name,traceId,spanId,
 * parentSpanId,status}` + an attribute name→string map).
 */
export interface CapturedSpan {
  span: {
    name: string;
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    status?: { code: number };
  };
  attrMap: Map<string, string | undefined>;
}

/**
 * Find the most-recently-finished span matching `spanName` (by span name or the
 * `agentmark.trace_name` attribute), or null if none captured.
 */
export function findSpanByName(spanName: string): CapturedSpan | null {
  const spans = memoryExporter.getFinishedSpans();
  for (let i = spans.length - 1; i >= 0; i--) {
    const s: ReadableSpan = spans[i];
    const matches =
      s.name === spanName ||
      s.attributes["agentmark.trace_name"] === spanName;
    if (!matches) continue;

    const attrMap = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(s.attributes)) {
      attrMap.set(key, value === undefined ? undefined : String(value));
    }

    // ReadableSpan exposes the parent span id as `parentSpanId` (OTel <2) or
    // `parentSpanContext.spanId` (OTel >=2) — read whichever is present.
    const anySpan = s as unknown as {
      parentSpanId?: string;
      parentSpanContext?: { spanId?: string };
    };
    const ctx = s.spanContext();
    return {
      span: {
        name: s.name,
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        parentSpanId: anySpan.parentSpanId ?? anySpan.parentSpanContext?.spanId,
        status: s.status,
      },
      attrMap,
    };
  }
  return null;
}
