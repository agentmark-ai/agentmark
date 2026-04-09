import { describe, it, expect, vi } from "vitest";
import type { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { MaskingSpanProcessor } from "../trace/masking-processor";

function createMockSpan(attributes: Record<string, unknown>): ReadableSpan {
  return {
    attributes,
    name: "test-span",
    kind: 0,
    spanContext: () => ({ traceId: "abc", spanId: "def", traceFlags: 1 }),
    startTime: [0, 0],
    endTime: [0, 0],
    status: { code: 0 },
    duration: [0, 0],
    ended: true,
    resource: { attributes: {} } as any,
    instrumentationLibrary: { name: "test" },
    events: [],
    links: [],
    parentSpanId: undefined,
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  } as unknown as ReadableSpan;
}

function createMockProcessor() {
  return {
    onStart: vi.fn(),
    onEnd: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    forceFlush: vi.fn().mockResolvedValue(undefined),
  };
}

describe("MaskingSpanProcessor", () => {
  it("should apply mask function to gen_ai.request.input", () => {
    const inner = createMockProcessor();
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
      mask: (s) => s.replace(/secret/g, "[MASKED]"),
    });

    const span = createMockSpan({ "gen_ai.request.input": "my secret data" });
    processor.onEnd(span);

    expect(span.attributes["gen_ai.request.input"]).toBe("my [MASKED] data");
    expect(inner.onEnd).toHaveBeenCalledOnce();
  });

  it("should apply mask function to gen_ai.response.output", () => {
    const inner = createMockProcessor();
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
      mask: (s) => s.replace(/secret/g, "[MASKED]"),
    });

    const span = createMockSpan({
      "gen_ai.response.output": "secret response",
    });
    processor.onEnd(span);

    expect(span.attributes["gen_ai.response.output"]).toBe(
      "[MASKED] response"
    );
    expect(inner.onEnd).toHaveBeenCalledOnce();
  });

  it("should apply mask function to agentmark.metadata.* keys", () => {
    const inner = createMockProcessor();
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
      mask: (s) => s.replace(/secret/g, "[MASKED]"),
    });

    const span = createMockSpan({
      "agentmark.metadata.notes": "secret note",
    });
    processor.onEnd(span);

    expect(span.attributes["agentmark.metadata.notes"]).toBe("[MASKED] note");
    expect(inner.onEnd).toHaveBeenCalledOnce();
  });

  it("should NOT mask operational attributes", () => {
    const inner = createMockProcessor();
    const mask = vi.fn((s: string) => s.replace(/secret/g, "[MASKED]"));
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
      mask,
    });

    const span = createMockSpan({
      "agentmark.trace_name": "secret-trace",
      "agentmark.session_id": "session-secret-123",
      "gen_ai.request.model": "gpt-4-secret",
      "gen_ai.usage.input_tokens": 100,
    });
    processor.onEnd(span);

    expect(span.attributes["agentmark.trace_name"]).toBe("secret-trace");
    expect(span.attributes["agentmark.session_id"]).toBe("session-secret-123");
    expect(span.attributes["gen_ai.request.model"]).toBe("gpt-4-secret");
    expect(span.attributes["gen_ai.usage.input_tokens"]).toBe(100);
    expect(mask).not.toHaveBeenCalled();
  });

  it("should NOT touch non-string attribute values", () => {
    const inner = createMockProcessor();
    const mask = vi.fn((s: string) => `masked:${s}`);
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
      mask,
    });

    const span = createMockSpan({
      "gen_ai.request.input": 42,
      "gen_ai.response.output": true,
      "agentmark.metadata.count": 7,
    });
    processor.onEnd(span);

    expect(span.attributes["gen_ai.request.input"]).toBe(42);
    expect(span.attributes["gen_ai.response.output"]).toBe(true);
    expect(span.attributes["agentmark.metadata.count"]).toBe(7);
    expect(mask).not.toHaveBeenCalled();
  });

  it("should drop span when mask throws", () => {
    const inner = createMockProcessor();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
      mask: () => {
        throw new Error("mask exploded");
      },
    });

    const span = createMockSpan({
      "gen_ai.request.input": "some data",
    });
    processor.onEnd(span);

    expect(inner.onEnd).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[agentmark] Masking error — span dropped:",
      "mask exploded"
    );

    warnSpy.mockRestore();
  });

  it("should forward onStart to inner processor", () => {
    const inner = createMockProcessor();
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
    });

    const mockSpan = {} as any;
    const mockContext = {} as any;
    processor.onStart(mockSpan, mockContext);

    expect(inner.onStart).toHaveBeenCalledWith(mockSpan, mockContext);
  });

  it("should forward shutdown to inner processor", async () => {
    const inner = createMockProcessor();
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
    });

    await processor.shutdown();

    expect(inner.shutdown).toHaveBeenCalledOnce();
  });

  it("should forward forceFlush to inner processor", async () => {
    const inner = createMockProcessor();
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
    });

    await processor.forceFlush();

    expect(inner.forceFlush).toHaveBeenCalledOnce();
  });

  it("should replace input keys with [REDACTED] when hideInputs is true", () => {
    const inner = createMockProcessor();
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
      hideInputs: true,
    });

    const span = createMockSpan({
      "gen_ai.request.input": "sensitive prompt",
      "gen_ai.request.tool_calls": '{"tool":"secret"}',
      "gen_ai.response.output": "visible response",
    });
    processor.onEnd(span);

    expect(span.attributes["gen_ai.request.input"]).toBe("[REDACTED]");
    expect(span.attributes["gen_ai.request.tool_calls"]).toBe("[REDACTED]");
    expect(span.attributes["gen_ai.response.output"]).toBe("visible response");
    expect(inner.onEnd).toHaveBeenCalledOnce();
  });

  it("should replace output keys with [REDACTED] when hideOutputs is true", () => {
    const inner = createMockProcessor();
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
      hideOutputs: true,
    });

    const span = createMockSpan({
      "gen_ai.response.output": "sensitive output",
      "gen_ai.request.input": "visible input",
    });
    processor.onEnd(span);

    expect(span.attributes["gen_ai.response.output"]).toBe("[REDACTED]");
    expect(span.attributes["gen_ai.request.input"]).toBe("visible input");
    expect(inner.onEnd).toHaveBeenCalledOnce();
  });

  it("should run suppression before mask function", () => {
    const inner = createMockProcessor();
    const mask = vi.fn((s: string) => s);
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
      hideInputs: true,
      mask,
    });

    const span = createMockSpan({
      "gen_ai.request.input": "original secret value",
    });
    processor.onEnd(span);

    expect(mask).toHaveBeenCalledWith("[REDACTED]");
    expect(inner.onEnd).toHaveBeenCalledOnce();
  });

  it("should pass span through unchanged when no mask and no hide flags", () => {
    const inner = createMockProcessor();
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
    });

    const span = createMockSpan({
      "gen_ai.request.input": "hello world",
      "gen_ai.response.output": "response text",
      "agentmark.trace_name": "my-trace",
      "gen_ai.usage.input_tokens": 50,
    });
    processor.onEnd(span);

    expect(span.attributes["gen_ai.request.input"]).toBe("hello world");
    expect(span.attributes["gen_ai.response.output"]).toBe("response text");
    expect(span.attributes["agentmark.trace_name"]).toBe("my-trace");
    expect(span.attributes["gen_ai.usage.input_tokens"]).toBe(50);
    expect(inner.onEnd).toHaveBeenCalledWith(span);
  });
});
