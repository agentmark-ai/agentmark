/**
 * Unit tests for span-node-tooltip-utils
 *
 * Tests the tooltip utility functions: formatMetadataEntries, extractSpanSummary (metadata),
 * formatDuration, formatCost, formatTokens, and truncateText.
 * Focus: behavior and edge cases for each utility function.
 */

import { describe, it, expect } from "vitest";
import {
  formatMetadataEntries,
  extractSpanSummary,
  formatDuration,
  formatCost,
  formatTokens,
  truncateText,
} from "../../src/sections/traces/trace-drawer/trace-graph/span-node-tooltip-utils";
import type { SpanData } from "../../src/sections/traces/types";

// ============================================================================
// Test Utilities
// ============================================================================

function createSpan(data: Record<string, any> = {}): SpanData {
  return {
    id: "span-1",
    name: "test-span",
    duration: 1500,
    timestamp: 1000,
    data: {
      type: "GENERATION",
      model: "gpt-4",
      ...data,
    },
  };
}

// ============================================================================
// formatMetadataEntries
// ============================================================================

describe("formatMetadataEntries", () => {
  it("should return all entries when count is within maxEntries", () => {
    const metadata = { env: "prod", version: "1.2", user: "abc" };
    const result = formatMetadataEntries(metadata);
    expect(result.entries).toHaveLength(3);
    expect(result.remaining).toBe(0);
    expect(result.entries[0]).toEqual({ key: "env", value: "prod" });
  });

  it("should limit entries to maxEntries and return remaining count", () => {
    const metadata: Record<string, string> = {};
    for (let i = 0; i < 8; i++) {
      metadata[`key${i}`] = `value${i}`;
    }
    const result = formatMetadataEntries(metadata, 5);
    expect(result.entries).toHaveLength(5);
    expect(result.remaining).toBe(3);
  });

  it("should return empty entries for empty metadata", () => {
    const result = formatMetadataEntries({});
    expect(result.entries).toHaveLength(0);
    expect(result.remaining).toBe(0);
  });

  it("should truncate long values", () => {
    const longValue = "a".repeat(200);
    const metadata = { key: longValue };
    const result = formatMetadataEntries(metadata);
    // truncateText(value, 100) produces at most 100 chars + 1 ellipsis char
    expect(result.entries[0]!.value.length).toBeLessThanOrEqual(101);
  });

  it("should use custom maxEntries", () => {
    const metadata = { a: "1", b: "2", c: "3" };
    const result = formatMetadataEntries(metadata, 2);
    expect(result.entries).toHaveLength(2);
    expect(result.remaining).toBe(1);
  });

  it("should return empty string for empty value entries", () => {
    const metadata = { key: "" };
    const result = formatMetadataEntries(metadata);
    // truncateText("") returns null, which is coalesced to ''
    expect(result.entries[0]!.value).toBe("");
  });

  it("should default maxEntries to 5", () => {
    const metadata: Record<string, string> = {};
    for (let i = 0; i < 7; i++) {
      metadata[`key${i}`] = `value${i}`;
    }
    const result = formatMetadataEntries(metadata);
    expect(result.entries).toHaveLength(5);
    expect(result.remaining).toBe(2);
  });

  it("should handle maxEntries larger than key count", () => {
    const metadata = { a: "1", b: "2" };
    const result = formatMetadataEntries(metadata, 10);
    expect(result.entries).toHaveLength(2);
    expect(result.remaining).toBe(0);
  });
});

// ============================================================================
// extractSpanSummary — metadata handling
// ============================================================================

describe("extractSpanSummary metadata", () => {
  it("should return metadata when span has non-empty metadata object", () => {
    const span = createSpan({ metadata: { env: "prod", version: "1.0" } });
    const summary = extractSpanSummary(span);
    expect(summary.metadata).toEqual({ env: "prod", version: "1.0" });
  });

  it("should return null when span has no metadata", () => {
    const span = createSpan({});
    const summary = extractSpanSummary(span);
    expect(summary.metadata).toBeNull();
  });

  it("should return null when span has empty metadata object", () => {
    const span = createSpan({ metadata: {} });
    const summary = extractSpanSummary(span);
    expect(summary.metadata).toBeNull();
  });

  it("should return null when metadata is null", () => {
    const span = createSpan({ metadata: null });
    const summary = extractSpanSummary(span);
    expect(summary.metadata).toBeNull();
  });

  it("should return null when metadata is undefined", () => {
    const span = createSpan({ metadata: undefined });
    const summary = extractSpanSummary(span);
    expect(summary.metadata).toBeNull();
  });

  it("should populate other summary fields correctly", () => {
    const span = createSpan({
      model: "claude-3",
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      cost: 0.005,
      status: "success",
      metadata: { env: "prod" },
    });
    const summary = extractSpanSummary(span);
    expect(summary.name).toBe("test-span");
    expect(summary.model).toBe("claude-3");
    expect(summary.inputTokens).toBe("100");
    expect(summary.outputTokens).toBe("200");
    expect(summary.totalTokens).toBe("300");
    expect(summary.cost).toBe("$0.0050");
    expect(summary.status).toBe("success");
    expect(summary.metadata).toEqual({ env: "prod" });
  });
});

// ============================================================================
// formatDuration
// ============================================================================

describe("formatDuration", () => {
  it.each([
    [0, "0ms"],
    [1, "1ms"],
    [999, "999ms"],
    [1000, "1.00s"],
    [1500, "1.50s"],
    [1234, "1.23s"],
    [59999, "60.00s"],
  ])("should format %i ms as '%s'", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it("should format minutes correctly", () => {
    expect(formatDuration(60_000)).toMatch(/^1m /);
    expect(formatDuration(90_000)).toMatch(/^1m /);
    expect(formatDuration(120_000)).toMatch(/^2m /);
  });

  it("should return N/A for negative values", () => {
    expect(formatDuration(-1)).toBe("N/A");
  });

  it("should return N/A for NaN", () => {
    expect(formatDuration(NaN)).toBe("N/A");
  });

  it("should return N/A for Infinity", () => {
    expect(formatDuration(Infinity)).toBe("N/A");
  });
});

// ============================================================================
// formatCost
// ============================================================================

describe("formatCost", () => {
  it("should return null for undefined cost", () => {
    expect(formatCost(undefined)).toBeNull();
  });

  it("should return null for zero cost", () => {
    expect(formatCost(0)).toBeNull();
  });

  it("should format normal cost with 4 decimals", () => {
    expect(formatCost(0.05)).toBe("$0.0500");
  });

  it("should format small cost with 4 decimals", () => {
    expect(formatCost(0.005)).toBe("$0.0050");
  });

  it("should format very small cost in exponential notation", () => {
    const result = formatCost(0.00001);
    expect(result).toMatch(/^\$\d\.\d{2}e/);
  });
});

// ============================================================================
// formatTokens
// ============================================================================

describe("formatTokens", () => {
  it("should return null for undefined tokens", () => {
    expect(formatTokens(undefined)).toBeNull();
  });

  it("should return null for zero tokens", () => {
    expect(formatTokens(0)).toBeNull();
  });

  it("should format token count with locale string", () => {
    expect(formatTokens(100)).toBe("100");
    expect(formatTokens(1000)).not.toBeNull();
  });
});

// ============================================================================
// truncateText
// ============================================================================

describe("truncateText", () => {
  it("should return null for undefined text", () => {
    expect(truncateText(undefined)).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(truncateText("")).toBeNull();
  });

  it("should return null for whitespace-only string", () => {
    expect(truncateText("   ")).toBeNull();
  });

  it("should return text unchanged when within maxLength", () => {
    expect(truncateText("hello", 200)).toBe("hello");
  });

  it("should truncate long text and append ellipsis", () => {
    const longText = "a".repeat(300);
    const result = truncateText(longText, 200);
    expect(result).toHaveLength(201); // 200 chars + 1 ellipsis
    expect(result!.endsWith("…")).toBe(true);
  });

  it("should trim whitespace before checking length", () => {
    expect(truncateText("  hello  ")).toBe("hello");
  });

  it("should use custom maxLength", () => {
    const text = "abcdefghij"; // 10 chars
    const result = truncateText(text, 5);
    expect(result).toBe("abcde…");
  });
});
