import { describe, it, expect } from "vitest";
import { summarizeTrace } from "@/sections/traces/utils/summarize-trace";
import type { TraceData } from "@/sections/traces/types";

function makeTrace(overrides: Partial<TraceData> = {}): TraceData {
  return {
    id: "trace-1",
    name: "test trace",
    spans: [],
    data: {},
    ...overrides,
  };
}

describe("summarizeTrace", () => {
  it("returns exact shape for a fully-populated trace", () => {
    const trace = makeTrace({
      data: { cost: 0.012, tokens: 500, latency: 1500, userId: "u-1", sessionId: "s-1" },
      spans: [
        { id: "s1", name: "root", duration: 1500, timestamp: 0, data: { type: "GENERATION", model: "gpt-4o", inputTokens: 300, outputTokens: 200, cost: 0.012 } },
      ],
    });

    expect(summarizeTrace(trace)).toEqual({
      cost: 0.012,
      totalTokens: 500,
      promptTokens: 300,
      completionTokens: 200,
      latencyMs: 1500,
      models: ["gpt-4o"],
      userId: "u-1",
      sessionId: "s-1",
    });
  });

  it("de-duplicates models in insertion order", () => {
    const trace = makeTrace({
      data: { tokens: 0 },
      spans: [
        { id: "s1", name: "span1", duration: 100, timestamp: 0, data: { model: "gpt-4o", type: "GENERATION", inputTokens: 10, outputTokens: 5 } },
        { id: "s2", name: "span2", duration: 100, timestamp: 1, data: { model: "gpt-4o", type: "GENERATION", inputTokens: 10, outputTokens: 5 } },
        { id: "s3", name: "span3", duration: 100, timestamp: 2, data: { model: "claude-3-5-sonnet", type: "GENERATION", inputTokens: 20, outputTokens: 10 } },
      ],
    });

    expect(summarizeTrace(trace).models).toEqual(["gpt-4o", "claude-3-5-sonnet"]);
  });

  it("sums promptTokens and completionTokens only from GENERATION/llm/model spans", () => {
    const trace = makeTrace({
      data: {},
      spans: [
        { id: "s1", name: "gen", duration: 100, timestamp: 0, data: { type: "GENERATION", model: "gpt-4o", inputTokens: 100, outputTokens: 50 } },
        { id: "s2", name: "tool", duration: 50, timestamp: 1, data: { type: "SPAN", inputTokens: 999, outputTokens: 999 } },
      ],
    });

    const summary = summarizeTrace(trace);
    expect(summary.promptTokens).toBe(100);
    expect(summary.completionTokens).toBe(50);
  });

  it("falls back to summing span costs when trace.data.cost is absent", () => {
    const trace = makeTrace({
      data: {},
      spans: [
        { id: "s1", name: "span1", duration: 100, timestamp: 0, data: { model: "gpt-4o", type: "GENERATION", cost: 0.005 } },
        { id: "s2", name: "span2", duration: 100, timestamp: 1, data: { model: "gpt-4o", type: "GENERATION", cost: 0.003 } },
      ],
    });

    expect(summarizeTrace(trace).cost).toBeCloseTo(0.008);
  });

  it("excludes spans with no model from the models list", () => {
    const trace = makeTrace({
      data: {},
      spans: [
        { id: "s1", name: "no-model", duration: 100, timestamp: 0, data: { type: "SPAN" } },
        { id: "s2", name: "with-model", duration: 100, timestamp: 1, data: { model: "claude-3-5-sonnet", type: "GENERATION" } },
      ],
    });

    expect(summarizeTrace(trace).models).toEqual(["claude-3-5-sonnet"]);
  });

  it("returns userId === undefined (not the string 'undefined') when absent", () => {
    const trace = makeTrace({ data: {} });
    const { userId } = summarizeTrace(trace);
    expect(userId).toBeUndefined();
  });

  it("returns sessionId === undefined when absent", () => {
    const trace = makeTrace({ data: {} });
    expect(summarizeTrace(trace).sessionId).toBeUndefined();
  });

  it("returns zero-value numeric fields for an empty trace with no data", () => {
    const trace = makeTrace({ data: {}, spans: [] });
    expect(summarizeTrace(trace)).toEqual({
      cost: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 0,
      models: [],
      userId: undefined,
      sessionId: undefined,
    });
  });
});
