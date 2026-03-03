/**
 * Unit tests for span-node-tooltip-utils
 *
 * Tests all formatting and extraction helpers that drive the graph node
 * hover tooltip. Pure functions → no DOM / React required.
 */

import { describe, it, expect } from "vitest";
import {
  formatDuration,
  formatCost,
  formatTokens,
  truncateText,
  getSpanStatus,
  extractSpanSummary,
} from "../../src/sections/traces/trace-drawer/trace-graph/span-node-tooltip-utils";
import type { SpanData } from "../../src/sections/traces/types";

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe("formatDuration", () => {
  it("formats 0 ms", () => {
    expect(formatDuration(0)).toBe("0ms");
  });

  it("formats small positive ms values", () => {
    expect(formatDuration(1)).toBe("1ms");
    expect(formatDuration(456)).toBe("456ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("rounds fractional milliseconds", () => {
    expect(formatDuration(1.6)).toBe("2ms");
    expect(formatDuration(0.4)).toBe("0ms");
  });

  it("formats exactly 1 second", () => {
    expect(formatDuration(1000)).toBe("1.00s");
  });

  it("formats sub-minute durations in seconds", () => {
    expect(formatDuration(1234)).toBe("1.23s");
    expect(formatDuration(59_999)).toBe("60.00s");
  });

  it("formats durations >= 1 minute with minutes and seconds", () => {
    expect(formatDuration(60_000)).toBe("1m 0.0s");
    expect(formatDuration(90_000)).toBe("1m 30.0s");
    expect(formatDuration(125_500)).toBe("2m 5.5s");
  });
});

// ---------------------------------------------------------------------------
// formatCost
// ---------------------------------------------------------------------------

describe("formatCost", () => {
  it("returns null for undefined", () => {
    expect(formatCost(undefined)).toBeNull();
  });

  it("returns null for zero", () => {
    expect(formatCost(0)).toBeNull();
  });

  it("formats very small costs with exponential notation", () => {
    const result = formatCost(0.000001);
    expect(result).not.toBeNull();
    expect(result).toContain("$");
    expect(result).toContain("e");
  });

  it("formats small costs with four decimal places", () => {
    expect(formatCost(0.001)).toBe("$0.0010");
    expect(formatCost(0.0045)).toBe("$0.0045");
  });

  it("formats larger costs with four decimal places", () => {
    expect(formatCost(1.23456)).toBe("$1.2346");
    expect(formatCost(0.1234)).toBe("$0.1234");
  });
});

// ---------------------------------------------------------------------------
// formatTokens
// ---------------------------------------------------------------------------

describe("formatTokens", () => {
  it("returns null for undefined", () => {
    expect(formatTokens(undefined)).toBeNull();
  });

  it("returns null for zero", () => {
    expect(formatTokens(0)).toBeNull();
  });

  it("formats positive token counts as locale strings", () => {
    expect(formatTokens(100)).toBe("100");
    expect(formatTokens(1000)).toBe("1,000");
    expect(formatTokens(12345)).toBe("12,345");
  });

  it("handles 1 token", () => {
    expect(formatTokens(1)).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// truncateText
// ---------------------------------------------------------------------------

describe("truncateText", () => {
  it("returns null for undefined", () => {
    expect(truncateText(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(truncateText("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(truncateText("   ")).toBeNull();
  });

  it("returns short text unchanged", () => {
    expect(truncateText("Hello")).toBe("Hello");
  });

  it("returns text at exactly maxLength unchanged", () => {
    const text = "a".repeat(200);
    expect(truncateText(text, 200)).toBe(text);
  });

  it("truncates text longer than maxLength and appends ellipsis", () => {
    const text = "a".repeat(201);
    const result = truncateText(text, 200);
    expect(result).toHaveLength(201); // 200 chars + "…"
    expect(result).toMatch(/…$/);
  });

  it("trims leading/trailing whitespace before length check", () => {
    const text = "  hello  ";
    expect(truncateText(text)).toBe("hello");
  });

  it("uses custom maxLength", () => {
    const result = truncateText("hello world", 5);
    expect(result).toBe("hello…");
  });
});

// ---------------------------------------------------------------------------
// getSpanStatus
// ---------------------------------------------------------------------------

describe("getSpanStatus", () => {
  it("returns null when no status fields are present", () => {
    expect(getSpanStatus({})).toBeNull();
  });

  it("prefers status over statusMessage and finishReason", () => {
    expect(
      getSpanStatus({ status: "ok", statusMessage: "done", finishReason: "stop" })
    ).toBe("ok");
  });

  it("falls back to statusMessage when status is absent", () => {
    expect(
      getSpanStatus({ statusMessage: "Timeout", finishReason: "stop" })
    ).toBe("Timeout");
  });

  it("falls back to finishReason last", () => {
    expect(getSpanStatus({ finishReason: "stop" })).toBe("stop");
  });

  it("handles empty string status values (treats as absent)", () => {
    // Empty string is falsy in JS, so the priority fallback works naturally
    expect(getSpanStatus({ status: "", finishReason: "stop" })).toBe("stop");
  });
});

// ---------------------------------------------------------------------------
// extractSpanSummary
// ---------------------------------------------------------------------------

describe("extractSpanSummary", () => {
  const baseSpan: SpanData = {
    id: "span-1",
    name: "generateText",
    duration: 1234,
    timestamp: Date.now(),
    data: {
      model: "gpt-4",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cost: 0.003,
      status: "ok",
      input: "What is 2+2?",
      output: "4",
    },
  };

  it("extracts all fields from a complete span", () => {
    const summary = extractSpanSummary(baseSpan);
    expect(summary.name).toBe("generateText");
    expect(summary.duration).toBe("1.23s");
    expect(summary.model).toBe("gpt-4");
    expect(summary.inputTokens).toBe("100");
    expect(summary.outputTokens).toBe("50");
    expect(summary.totalTokens).toBe("150");
    expect(summary.cost).toBe("$0.0030");
    expect(summary.status).toBe("ok");
    expect(summary.input).toBe("What is 2+2?");
    expect(summary.output).toBe("4");
  });

  it("returns nulls for missing optional fields", () => {
    const sparseSpan: SpanData = {
      id: "span-2",
      name: "toolCall",
      duration: 0,
      timestamp: Date.now(),
      data: {},
    };
    const summary = extractSpanSummary(sparseSpan);
    expect(summary.model).toBeNull();
    expect(summary.inputTokens).toBeNull();
    expect(summary.outputTokens).toBeNull();
    expect(summary.totalTokens).toBeNull();
    expect(summary.cost).toBeNull();
    expect(summary.status).toBeNull();
    expect(summary.input).toBeNull();
    expect(summary.output).toBeNull();
  });

  it("falls back to model_name when model is absent", () => {
    const span: SpanData = {
      ...baseSpan,
      data: { ...baseSpan.data, model: undefined, model_name: "claude-3-opus" },
    };
    expect(extractSpanSummary(span).model).toBe("claude-3-opus");
  });

  it("formats duration as '0ms' when duration is 0", () => {
    const span: SpanData = { ...baseSpan, duration: 0 };
    expect(extractSpanSummary(span).duration).toBe("0ms");
  });

  it("truncates long input/output values", () => {
    const longText = "x".repeat(300);
    const span: SpanData = {
      ...baseSpan,
      data: { input: longText, output: longText },
    };
    const summary = extractSpanSummary(span);
    expect(summary.input).toHaveLength(201); // 200 + "…"
    expect(summary.output).toHaveLength(201);
    expect(summary.input).toMatch(/…$/);
  });

  it("handles undefined data gracefully", () => {
    // Cast to bypass strict typing — tests runtime resilience
    const span = { id: "x", name: "test", duration: 500, timestamp: 0, data: undefined } as unknown as SpanData;
    const summary = extractSpanSummary(span);
    expect(summary.name).toBe("test");
    expect(summary.duration).toBe("500ms");
    expect(summary.model).toBeNull();
  });

  it("uses finishReason as status when both status and statusMessage are absent", () => {
    const span: SpanData = {
      ...baseSpan,
      data: { ...baseSpan.data, status: undefined, statusMessage: undefined, finishReason: "length" },
    };
    expect(extractSpanSummary(span).status).toBe("length");
  });

  it("returns 'Unknown' for name when span name is undefined", () => {
    const span = { ...baseSpan, name: undefined as unknown as string };
    expect(extractSpanSummary(span).name).toBe("Unknown");
  });
});
