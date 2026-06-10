import { describe, it, expect, vi } from "vitest";
import type { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  MaskingSpanProcessor,
  INPUT_KEYS,
  OUTPUT_KEYS,
} from "../trace/masking-processor";

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

  it("redacts agentmark.dataset_input when hideInputs is true (experiment row input)", () => {
    const inner = createMockProcessor();
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
      hideInputs: true,
    });

    const span = createMockSpan({
      "agentmark.dataset_input": '{"q":"sensitive customer question"}',
      "gen_ai.response.output": "visible response",
    });
    processor.onEnd(span);

    // The dataset row input must be redacted alongside gen_ai inputs — without
    // this it would export unmasked while gen_ai.request.input is redacted.
    expect(span.attributes["agentmark.dataset_input"]).toBe("[REDACTED]");
    expect(span.attributes["gen_ai.response.output"]).toBe("visible response");
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

// The canonical key sets. Pinned as literal sorted arrays so that removing
// (or typo-ing) a single key from the production sets fails this suite
// loudly — these keys are a privacy contract, not an implementation detail.
// They MUST stay identical to the Python SDK's masking_processor.py sets.
const EXPECTED_INPUT_KEYS = [
  "agentmark.dataset_input",
  "ai.prompt",
  "ai.prompt.messages",
  "ai.prompt.toolChoice",
  "ai.prompt.tools",
  "ai.toolCall.args",
  "gen_ai.input.messages",
  "gen_ai.prompt",
  "gen_ai.request.input",
  "gen_ai.request.tool_calls",
  "gen_ai.system_instructions",
  "gen_ai.tool.call.arguments",
  "gen_ai.tool.definitions",
  "gen_ai.tool.input",
];

const EXPECTED_OUTPUT_KEYS = [
  "ai.response.object",
  "ai.response.text",
  "ai.response.toolCalls",
  "ai.result.object",
  "ai.result.text",
  "ai.result.toolCalls",
  "ai.toolCall.result",
  "gen_ai.completion",
  "gen_ai.output.messages",
  "gen_ai.response.output",
  "gen_ai.response.output_object",
  "gen_ai.tool.call.result",
  "gen_ai.tool.output",
];

describe("MaskingSpanProcessor sensitive-key coverage", () => {
  it("INPUT_KEYS exactly equals the documented privacy contract", () => {
    expect([...INPUT_KEYS].sort()).toEqual(EXPECTED_INPUT_KEYS);
  });

  it("OUTPUT_KEYS exactly equals the documented privacy contract", () => {
    expect([...OUTPUT_KEYS].sort()).toEqual(EXPECTED_OUTPUT_KEYS);
  });

  it.each(EXPECTED_INPUT_KEYS)(
    "redacts input key %s when hideInputs is true",
    (key) => {
      const inner = createMockProcessor();
      const processor = new MaskingSpanProcessor({
        innerProcessor: inner as unknown as SpanProcessor,
        hideInputs: true,
      });

      const span = createMockSpan({ [key]: "sensitive content" });
      processor.onEnd(span);

      expect(span.attributes[key]).toBe("[REDACTED]");
      expect(inner.onEnd).toHaveBeenCalledWith(span);
    }
  );

  it.each(EXPECTED_OUTPUT_KEYS)(
    "redacts output key %s when hideOutputs is true",
    (key) => {
      const inner = createMockProcessor();
      const processor = new MaskingSpanProcessor({
        innerProcessor: inner as unknown as SpanProcessor,
        hideOutputs: true,
      });

      const span = createMockSpan({ [key]: "sensitive content" });
      processor.onEnd(span);

      expect(span.attributes[key]).toBe("[REDACTED]");
      expect(inner.onEnd).toHaveBeenCalledWith(span);
    }
  );

  it.each(EXPECTED_OUTPUT_KEYS)(
    "does NOT redact output key %s when only hideInputs is true",
    (key) => {
      const inner = createMockProcessor();
      const processor = new MaskingSpanProcessor({
        innerProcessor: inner as unknown as SpanProcessor,
        hideInputs: true,
      });

      const span = createMockSpan({ [key]: "visible output" });
      processor.onEnd(span);

      expect(span.attributes[key]).toBe("visible output");
    }
  );

  it.each(EXPECTED_INPUT_KEYS)(
    "does NOT redact input key %s when only hideOutputs is true",
    (key) => {
      const inner = createMockProcessor();
      const processor = new MaskingSpanProcessor({
        innerProcessor: inner as unknown as SpanProcessor,
        hideOutputs: true,
      });

      const span = createMockSpan({ [key]: "visible input" });
      processor.onEnd(span);

      expect(span.attributes[key]).toBe("visible input");
    }
  );

  it("redacts every element of the ai.prompt.tools string array when hideInputs is true", () => {
    const inner = createMockProcessor();
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
      hideInputs: true,
    });

    // The Vercel AI SDK emits ai.prompt.tools as an array of JSON strings
    // (verified against ai@5: stepTools.map((tool) => JSON.stringify(tool))).
    const span = createMockSpan({
      "ai.prompt.tools": ['{"name":"search"}', '{"name":"calculator"}'],
    });
    processor.onEnd(span);

    expect(span.attributes["ai.prompt.tools"]).toEqual([
      "[REDACTED]",
      "[REDACTED]",
    ]);
  });

  it("applies the custom mask function element-wise to ai.prompt.tools", () => {
    const inner = createMockProcessor();
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
      mask: (s) => s.replace(/secret/g, "[MASKED]"),
    });

    const span = createMockSpan({
      "ai.prompt.tools": ['{"name":"secret-tool"}', '{"name":"public-tool"}'],
    });
    processor.onEnd(span);

    expect(span.attributes["ai.prompt.tools"]).toEqual([
      '{"name":"[MASKED]-tool"}',
      '{"name":"public-tool"}',
    ]);
  });

  it("applies the custom mask function to the new Vercel AI SDK and OTel GenAI keys", () => {
    const inner = createMockProcessor();
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
      mask: (s) => s.replace(/secret/g, "[MASKED]"),
    });

    const span = createMockSpan({
      "ai.prompt.messages": '[{"role":"user","content":"secret question"}]',
      "ai.response.text": "secret answer",
      "gen_ai.input.messages": '[{"role":"user","parts":["secret"]}]',
      "gen_ai.completion": "the secret completion",
      "gen_ai.tool.input": '{"query":"secret"}',
      "gen_ai.tool.output": "secret tool result",
    });
    processor.onEnd(span);

    expect(span.attributes["ai.prompt.messages"]).toBe(
      '[{"role":"user","content":"[MASKED] question"}]'
    );
    expect(span.attributes["ai.response.text"]).toBe("[MASKED] answer");
    expect(span.attributes["gen_ai.input.messages"]).toBe(
      '[{"role":"user","parts":["[MASKED]"]}]'
    );
    expect(span.attributes["gen_ai.completion"]).toBe(
      "the [MASKED] completion"
    );
    expect(span.attributes["gen_ai.tool.input"]).toBe('{"query":"[MASKED]"}');
    expect(span.attributes["gen_ai.tool.output"]).toBe("[MASKED] tool result");
  });

  it("leaves non-content ai.* and gen_ai.* operational keys untouched under full suppression", () => {
    const inner = createMockProcessor();
    const mask = vi.fn((_s: string) => "[MASKED]");
    const processor = new MaskingSpanProcessor({
      innerProcessor: inner as unknown as SpanProcessor,
      hideInputs: true,
      hideOutputs: true,
      mask,
    });

    const span = createMockSpan({
      "ai.model.id": "gpt-4o",
      "ai.operationId": "ai.generateText",
      "ai.response.finishReason": "stop",
      "ai.toolCall.name": "search",
      "ai.toolCall.id": "call_123",
      "gen_ai.request.model": "claude-sonnet-4",
      "gen_ai.tool.name": "search",
      "gen_ai.usage.input_tokens": 12,
    });
    processor.onEnd(span);

    expect(span.attributes["ai.model.id"]).toBe("gpt-4o");
    expect(span.attributes["ai.operationId"]).toBe("ai.generateText");
    expect(span.attributes["ai.response.finishReason"]).toBe("stop");
    expect(span.attributes["ai.toolCall.name"]).toBe("search");
    expect(span.attributes["ai.toolCall.id"]).toBe("call_123");
    expect(span.attributes["gen_ai.request.model"]).toBe("claude-sonnet-4");
    expect(span.attributes["gen_ai.tool.name"]).toBe("search");
    expect(span.attributes["gen_ai.usage.input_tokens"]).toBe(12);
    expect(mask).not.toHaveBeenCalled();
  });
});
