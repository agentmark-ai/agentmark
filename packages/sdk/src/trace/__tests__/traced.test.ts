import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @opentelemetry/api before importing traced.ts
const mockSetAttribute = vi.fn();
const mockSetStatus = vi.fn();
const mockEnd = vi.fn();

const mockSpan = {
  setAttribute: mockSetAttribute,
  setStatus: mockSetStatus,
  end: mockEnd,
};

const mockStartActiveSpan = vi.fn(
  (_name: string, fn: (span: typeof mockSpan) => Promise<unknown>) =>
    fn(mockSpan)
);

vi.mock("@opentelemetry/api", () => ({
  default: {
    trace: {
      getTracer: () => ({
        startActiveSpan: mockStartActiveSpan,
      }),
    },
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
  },
}));

import { observe, SpanKind } from "../traced";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SpanKind", () => {
  it("should have exactly 7 members", () => {
    const values = Object.values(SpanKind);
    expect(values).toHaveLength(7);
  });

  it.each([
    ["FUNCTION", "function"],
    ["LLM", "llm"],
    ["TOOL", "tool"],
    ["AGENT", "agent"],
    ["RETRIEVAL", "retrieval"],
    ["EMBEDDING", "embedding"],
    ["GUARDRAIL", "guardrail"],
  ] as const)("should map %s to %s", (key, expected) => {
    expect(SpanKind[key]).toBe(expected);
  });
});

describe("observe", () => {
  describe("span kind attributes", () => {
    it("should default to FUNCTION kind when no kind specified", async () => {
      const fn = observe(async () => "result");
      await fn();

      expect(mockSetAttribute).toHaveBeenCalledWith(
        "agentmark.span.kind",
        "function"
      );
    });

    it("should set agentmark.span.kind to the specified kind", async () => {
      const fn = observe(async () => "result", { kind: SpanKind.LLM });
      await fn();

      expect(mockSetAttribute).toHaveBeenCalledWith(
        "agentmark.span.kind",
        "llm"
      );
    });

    it("should set openinference.span.kind to CHAIN for FUNCTION kind", async () => {
      const fn = observe(async () => "result", { kind: SpanKind.FUNCTION });
      await fn();

      expect(mockSetAttribute).toHaveBeenCalledWith(
        "openinference.span.kind",
        "CHAIN"
      );
    });

    it.each([
      [SpanKind.LLM, "LLM"],
      [SpanKind.TOOL, "TOOL"],
      [SpanKind.AGENT, "AGENT"],
      [SpanKind.RETRIEVAL, "RETRIEVER"],
      [SpanKind.EMBEDDING, "EMBEDDING"],
      [SpanKind.GUARDRAIL, "GUARDRAIL"],
    ] as const)(
      "should set openinference.span.kind correctly for %s kind",
      async (kind, expectedOiKind) => {
        const fn = observe(async () => "result", { kind });
        await fn();

        expect(mockSetAttribute).toHaveBeenCalledWith(
          "openinference.span.kind",
          expectedOiKind
        );
      }
    );

    it("should set openinference.span.kind to CHAIN when kind is default", async () => {
      const fn = observe(async () => "result");
      await fn();

      expect(mockSetAttribute).toHaveBeenCalledWith(
        "openinference.span.kind",
        "CHAIN"
      );
    });
  });

  describe("span lifecycle", () => {
    it("should create span with the function name", async () => {
      async function myNamedFn() {
        return 42;
      }
      const fn = observe(myNamedFn);
      await fn();

      expect(mockStartActiveSpan).toHaveBeenCalledWith(
        "myNamedFn",
        expect.any(Function)
      );
    });

    it("should use custom name when provided", async () => {
      const fn = observe(async () => "result", { name: "custom-span" });
      await fn();

      expect(mockStartActiveSpan).toHaveBeenCalledWith(
        "custom-span",
        expect.any(Function)
      );
    });

    it("should set both kind attributes before capturing IO", async () => {
      const callOrder: string[] = [];
      mockSetAttribute.mockImplementation((key: string) => {
        callOrder.push(key);
      });

      const fn = observe(async () => "result", { kind: SpanKind.TOOL });
      await fn();

      const kindIndex = callOrder.indexOf("agentmark.span.kind");
      const oiKindIndex = callOrder.indexOf("openinference.span.kind");
      const inputIndex = callOrder.indexOf("gen_ai.request.input");

      expect(kindIndex).toBeLessThan(inputIndex);
      expect(oiKindIndex).toBeLessThan(inputIndex);
    });

    it("should end span after successful execution", async () => {
      const fn = observe(async () => "result");
      await fn();

      expect(mockEnd).toHaveBeenCalledOnce();
    });

    it("should end span after failed execution", async () => {
      const fn = observe(async () => {
        throw new Error("boom");
      });

      await expect(fn()).rejects.toThrow("boom");
      expect(mockEnd).toHaveBeenCalledOnce();
    });
  });
});
