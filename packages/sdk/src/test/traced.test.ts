import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { observe, SpanKind } from "../trace/traced";
import { serializeValue } from "../trace/serialize";
import { span } from "../trace/tracing";
import { AgentMarkSDK } from "../agentmark";
import { findSpanByName, resetCapturedSpans } from "./otlp-memory";

// Route the SDK's OTLP exporter to an in-memory exporter so span export is
// synchronous — no flaky local HTTP collector. See ./otlp-memory for the why.
vi.mock("@opentelemetry/exporter-trace-otlp-http", async () => {
  const { memoryExporter } = await import("./otlp-memory");
  return {
    OTLPTraceExporter: class {
      export(spans: any, resultCallback: any) {
        memoryExporter.export(spans, resultCallback);
      }
      async shutdown() {}
      async forceFlush() {}
    },
  };
});

describe("serializeValue", () => {
  it("should serialize plain objects", () => {
    expect(serializeValue({ key: "value" })).toBe('{"key":"value"}');
  });

  it("should serialize arrays", () => {
    expect(serializeValue([1, 2, 3])).toBe("[1,2,3]");
  });

  it("should serialize primitives", () => {
    expect(serializeValue("hello")).toBe('"hello"');
    expect(serializeValue(42)).toBe("42");
    expect(serializeValue(true)).toBe("true");
    expect(serializeValue(null)).toBe("null");
  });

  it("should truncate to max length", () => {
    const long = "x".repeat(10000);
    const result = serializeValue(long, 100);
    expect(result.length).toBe(100);
  });

  it("should handle objects with toJSON", () => {
    const obj = {
      toJSON: () => ({ serialized: true }),
    };
    expect(serializeValue(obj)).toBe('{"serialized":true}');
  });

  it("should fall back to String() for non-serializable", () => {
    const circular: any = {};
    circular.self = circular;
    const result = serializeValue(circular);
    expect(typeof result).toBe("string");
  });

  it("should handle BigInt", () => {
    const result = serializeValue({ value: BigInt(123456789) });
    expect(result).toContain("123456789");
  });
});

describe("observe wrapper", () => {
  let sdk: AgentMarkSDK;
  let activeSdk: any;

  async function flushSpans() {
    // AgentMark's tracer provider is isolated (not the global OTel provider —
    // see issue #1131), so flush the active SDK directly. The exporter is
    // in-memory, so this resolves synchronously with no network wait.
    if (activeSdk?.forceFlush) {
      await activeSdk.forceFlush();
    }
  }

  beforeAll(() => {
    // baseUrl is unused — the OTLP exporter is mocked to capture in memory.
    sdk = new AgentMarkSDK({
      apiKey: "test-key",
      appId: "test-app",
      baseUrl: "http://127.0.0.1:4318",
    });
  });

  afterEach(() => {
    resetCapturedSpans();
  });

  afterAll(async () => {
    if (activeSdk) {
      await activeSdk.shutdown();
    }
  });

  it("should test observe wrapper functionality", { timeout: 120000 }, async () => {
    activeSdk = sdk.initTracing({ disableBatch: true });
    await new Promise((resolve) => setTimeout(resolve, 500));

    // ===== Test 1: Basic auto IO capture =====
    const basicFn = observe(
      async (query: string, count: number) => {
        return { results: [query], total: count };
      },
      { name: "basic-observe" }
    );

    const result1 = await basicFn("hello", 5);
    expect(result1).toEqual({ results: ["hello"], total: 5 });
    await flushSpans();

    const basicSpan = findSpanByName("basic-observe");
    expect(basicSpan).not.toBeNull();
    expect(basicSpan!.attrMap.get("gen_ai.request.input")).toContain("hello");
    expect(basicSpan!.attrMap.get("gen_ai.response.output")).toContain('"total":5');
    expect(basicSpan!.attrMap.get("agentmark.span.kind")).toBe("function");

    // ===== Test 2: Span kind =====
    const toolFn = observe(
      async (input: string) => input.toUpperCase(),
      { name: "tool-observe", kind: SpanKind.TOOL }
    );
    await toolFn("test");
    await flushSpans();

    const toolSpan = findSpanByName("tool-observe");
    expect(toolSpan).not.toBeNull();
    expect(toolSpan!.attrMap.get("agentmark.span.kind")).toBe("tool");

    // ===== Test 3: captureInput=false =====
    const noInputFn = observe(
      async (_secret: string) => "ok",
      { name: "no-input-observe", captureInput: false }
    );
    await noInputFn("password123");
    await flushSpans();

    const noInputSpan = findSpanByName("no-input-observe");
    expect(noInputSpan).not.toBeNull();
    expect(noInputSpan!.attrMap.has("gen_ai.request.input")).toBe(false);
    expect(noInputSpan!.attrMap.get("gen_ai.response.output")).toBe('"ok"');

    // ===== Test 4: captureOutput=false =====
    const noOutputFn = observe(
      async (_query: string) => "sensitive-result",
      { name: "no-output-observe", captureOutput: false }
    );
    await noOutputFn("test");
    await flushSpans();

    const noOutputSpan = findSpanByName("no-output-observe");
    expect(noOutputSpan).not.toBeNull();
    expect(noOutputSpan!.attrMap.get("gen_ai.request.input")).toContain("test");
    expect(noOutputSpan!.attrMap.has("gen_ai.response.output")).toBe(false);

    // ===== Test 5: processInputs =====
    const redactedFn = observe(
      async (_opts: { apiKey: string; query: string }) => "result",
      {
        name: "redacted-observe",
        processInputs: (inputs) => {
          const { apiKey, ...rest } = inputs as { apiKey?: string; [key: string]: unknown };
          return { ...rest, apiKey: "***" };
        },
      }
    );
    await redactedFn({ apiKey: "sk-secret", query: "hello" });
    await flushSpans();

    const redactedSpan = findSpanByName("redacted-observe");
    expect(redactedSpan).not.toBeNull();
    const redactedInput = redactedSpan!.attrMap.get("gen_ai.request.input")!;
    expect(redactedInput).not.toContain("sk-secret");
    expect(redactedInput).toContain("***");

    // ===== Test 6: processOutputs =====
    const processedOutputFn = observe(
      async () => [1, 2, 3, 4, 5],
      {
        name: "processed-output-observe",
        processOutputs: (output) => ({ count: (output as number[]).length }),
      }
    );
    await processedOutputFn();
    await flushSpans();

    const processedSpan = findSpanByName("processed-output-observe");
    expect(processedSpan).not.toBeNull();
    expect(processedSpan!.attrMap.get("gen_ai.response.output")).toContain('"count":5');

    // ===== Test 7: Error handling =====
    const failingFn = observe(
      async () => {
        throw new Error("test error");
      },
      { name: "error-observe" }
    );
    try {
      await failingFn();
    } catch (e: any) {
      expect(e.message).toBe("test error");
    }
    await flushSpans();

    const errorSpan = findSpanByName("error-observe");
    expect(errorSpan).not.toBeNull();
    expect(errorSpan!.span.status?.code).toBe(2); // ERROR
    // Output should not be set on error
    expect(errorSpan!.attrMap.has("gen_ai.response.output")).toBe(false);

    // ===== Test 8: Single object arg uses object directly =====
    const objectArgFn = observe(
      async (opts: { query: string; limit: number }) => opts.query,
      { name: "object-arg-observe" }
    );
    await objectArgFn({ query: "search", limit: 10 });
    await flushSpans();

    const objectArgSpan = findSpanByName("object-arg-observe");
    expect(objectArgSpan).not.toBeNull();
    const objectInput = objectArgSpan!.attrMap.get("gen_ai.request.input")!;
    expect(objectInput).toContain('"query":"search"');
    expect(objectInput).toContain('"limit":10');

    // ===== Test 9: Nesting with span() =====
    await span({ name: "parent-span" }, async (_ctx) => {
      const childFn = observe(
        async (x: number) => x * 2,
        { name: "child-observe" }
      );
      const childResult = await childFn(21);
      expect(childResult).toBe(42);
      return "done";
    });
    await flushSpans();

    const childObserveSpan = findSpanByName("child-observe");
    expect(childObserveSpan).not.toBeNull();
    // Should have parent
    expect(childObserveSpan!.span.parentSpanId).toBeTruthy();

    // ===== Test 10: setInput/setOutput on SpanContext =====
    await span({ name: "manual-io-span" }, async (ctx) => {
      ctx.setInput({ query: "manual-input" });
      const result = "manual-output-value";
      ctx.setOutput(result);
      return result;
    });
    await flushSpans();

    const manualIoSpan = findSpanByName("manual-io-span");
    expect(manualIoSpan).not.toBeNull();
    expect(manualIoSpan!.attrMap.get("gen_ai.request.input")).toContain("manual-input");
    expect(manualIoSpan!.attrMap.get("gen_ai.response.output")).toContain("manual-output-value");
  });
});
