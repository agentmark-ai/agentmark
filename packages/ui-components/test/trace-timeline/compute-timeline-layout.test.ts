/**
 * Unit tests for computeTimelineLayout
 *
 * Tests the pure timeline layout computation function.
 * Focus: behavior and invariants, not implementation details.
 */

import { describe, it, expect } from "vitest";
import {
  computeTimelineLayout,
  formatDuration,
  calculateTickIntervals,
  hasErrorStatus,
} from "../../src/sections/traces/trace-drawer/trace-timeline/compute-timeline-layout";
import type { SpanData } from "../../src/sections/traces/types";

// ============================================================================
// Test Utilities
// ============================================================================

function createSpan(
  overrides: Partial<SpanData> & { id: string; name: string }
): SpanData {
  return {
    duration: 1000,
    timestamp: 0,
    data: {},
    ...overrides,
  };
}

function getLayout(result: ReturnType<typeof computeTimelineLayout>, spanId: string) {
  const layout = result.layouts.find((l) => l.spanId === spanId);
  if (!layout) {
    throw new Error(`Span "${spanId}" not found in layouts. Available: ${result.layouts.map(l => l.spanId).join(", ")}`);
  }
  return layout;
}

// ============================================================================
// Invariant Tests - Properties that must ALWAYS hold
// ============================================================================

describe("computeTimelineLayout invariants", () => {
  it("all x positions are within 0-1 range", () => {
    const spans = [
      createSpan({ id: "a", name: "a", duration: 500, timestamp: 1000 }),
      createSpan({ id: "b", name: "b", duration: 300, timestamp: 1200 }),
      createSpan({ id: "c", name: "c", duration: 800, timestamp: 1500 }),
    ];

    const result = computeTimelineLayout(spans);

    for (const layout of result.layouts) {
      expect(layout.x).toBeGreaterThanOrEqual(0);
      expect(layout.x).toBeLessThanOrEqual(1);
    }
  });

  it("all widths are within 0-1 range", () => {
    const spans = [
      createSpan({ id: "a", name: "a", duration: 100, timestamp: 0 }),
      createSpan({ id: "b", name: "b", duration: 900, timestamp: 100 }),
    ];

    const result = computeTimelineLayout(spans);

    for (const layout of result.layouts) {
      expect(layout.width).toBeGreaterThanOrEqual(0);
      expect(layout.width).toBeLessThanOrEqual(1);
    }
  });

  it("x + width never exceeds 1", () => {
    const spans = [
      createSpan({ id: "a", name: "a", duration: 500, timestamp: 0 }),
      createSpan({ id: "b", name: "b", duration: 500, timestamp: 500 }),
      createSpan({ id: "c", name: "c", duration: 200, timestamp: 800 }),
    ];

    const result = computeTimelineLayout(spans);

    for (const layout of result.layouts) {
      expect(layout.x + layout.width).toBeLessThanOrEqual(1.0001); // floating point tolerance
    }
  });

  it("every span in input appears exactly once in output", () => {
    const spans = [
      createSpan({ id: "root", name: "root", duration: 2000, timestamp: 0 }),
      createSpan({ id: "child", name: "child", duration: 500, timestamp: 100, parentId: "root" }),
      createSpan({ id: "orphan", name: "orphan", duration: 300, timestamp: 200, parentId: "missing" }),
    ];

    const result = computeTimelineLayout(spans);

    const outputIds = result.layouts.map((l) => l.spanId);
    expect(outputIds).toHaveLength(spans.length);
    for (const span of spans) {
      expect(outputIds).toContain(span.id);
    }
  });

  it("all row values are unique", () => {
    const spans = [
      createSpan({ id: "a", name: "a", duration: 1000, timestamp: 0 }),
      createSpan({ id: "b", name: "b", duration: 500, timestamp: 100, parentId: "a" }),
      createSpan({ id: "c", name: "c", duration: 500, timestamp: 600, parentId: "a" }),
    ];

    const result = computeTimelineLayout(spans);

    const rows = result.layouts.map((l) => l.row);
    const uniqueRows = new Set(rows);
    expect(uniqueRows.size).toBe(rows.length);
  });

  it("ruler tick positions are within 0-1 range", () => {
    const spans = [createSpan({ id: "a", name: "a", duration: 5000, timestamp: 0 })];

    const result = computeTimelineLayout(spans);

    for (const tick of result.rulerTicks) {
      expect(tick.position).toBeGreaterThanOrEqual(0);
      expect(tick.position).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// Core Behavior Tests
// ============================================================================

describe("computeTimelineLayout", () => {
  describe("empty input", () => {
    it("returns empty layouts and zero metrics", () => {
      const result = computeTimelineLayout([]);

      expect(result.layouts).toEqual([]);
      expect(result.metrics.spanCount).toBe(0);
      expect(result.metrics.totalDurationMs).toBe(0);
      expect(result.rulerTicks).toEqual([]);
    });
  });

  describe("time calculations", () => {
    it("span starting at trace start has x=0", () => {
      const spans = [
        createSpan({ id: "first", name: "first", duration: 500, timestamp: 1000 }),
        createSpan({ id: "second", name: "second", duration: 500, timestamp: 1500 }),
      ];

      const result = computeTimelineLayout(spans);

      expect(getLayout(result, "first").x).toBe(0);
    });

    it("span width is proportional to its duration", () => {
      const spans = [
        createSpan({ id: "short", name: "short", duration: 200, timestamp: 0 }),
        createSpan({ id: "long", name: "long", duration: 800, timestamp: 200 }),
      ];

      const result = computeTimelineLayout(spans);

      // Total trace duration is 1000ms
      expect(getLayout(result, "short").width).toBeCloseTo(0.2);
      expect(getLayout(result, "long").width).toBeCloseTo(0.8);
    });

    it("calculates trace duration from earliest start to latest end", () => {
      const spans = [
        createSpan({ id: "a", name: "a", duration: 100, timestamp: 500 }),
        createSpan({ id: "b", name: "b", duration: 200, timestamp: 800 }),
      ];

      const result = computeTimelineLayout(spans);

      // Trace runs from 500 to 1000 (800 + 200)
      expect(result.metrics.totalDurationMs).toBe(500);
      expect(result.metrics.startTimeMs).toBe(500);
      expect(result.metrics.endTimeMs).toBe(1000);
    });

    it("calculates percentOfTrace correctly", () => {
      const spans = [
        createSpan({ id: "half", name: "half", duration: 500, timestamp: 0 }),
        createSpan({ id: "other", name: "other", duration: 500, timestamp: 500 }),
      ];

      const result = computeTimelineLayout(spans);

      expect(getLayout(result, "half").percentOfTrace).toBeCloseTo(50);
    });
  });

  describe("hierarchy", () => {
    it("child spans have greater depth than their parent", () => {
      const spans = [
        createSpan({ id: "parent", name: "parent", duration: 2000, timestamp: 0 }),
        createSpan({ id: "child", name: "child", duration: 500, timestamp: 100, parentId: "parent" }),
        createSpan({ id: "grandchild", name: "grandchild", duration: 200, timestamp: 150, parentId: "child" }),
      ];

      const result = computeTimelineLayout(spans);

      const parentDepth = getLayout(result, "parent").depth;
      const childDepth = getLayout(result, "child").depth;
      const grandchildDepth = getLayout(result, "grandchild").depth;

      expect(childDepth).toBeGreaterThan(parentDepth);
      expect(grandchildDepth).toBeGreaterThan(childDepth);
    });

    it("root spans have depth 0", () => {
      const spans = [
        createSpan({ id: "root1", name: "root1", duration: 1000, timestamp: 0 }),
        createSpan({ id: "root2", name: "root2", duration: 1000, timestamp: 1000 }),
      ];

      const result = computeTimelineLayout(spans);

      expect(getLayout(result, "root1").depth).toBe(0);
      expect(getLayout(result, "root2").depth).toBe(0);
    });

    it("orphan spans (missing parent) are treated as root", () => {
      const spans = [
        createSpan({ id: "orphan", name: "orphan", duration: 500, timestamp: 0, parentId: "nonexistent" }),
      ];

      const result = computeTimelineLayout(spans);

      expect(getLayout(result, "orphan").depth).toBe(0);
    });

    it("tracks maximum depth in metrics", () => {
      const spans = [
        createSpan({ id: "l0", name: "l0", duration: 3000, timestamp: 0 }),
        createSpan({ id: "l1", name: "l1", duration: 2000, timestamp: 100, parentId: "l0" }),
        createSpan({ id: "l2", name: "l2", duration: 1000, timestamp: 200, parentId: "l1" }),
        createSpan({ id: "l3", name: "l3", duration: 500, timestamp: 300, parentId: "l2" }),
      ];

      const result = computeTimelineLayout(spans);

      expect(result.metrics.maxDepth).toBe(3);
    });
  });

  describe("concurrent spans", () => {
    it("concurrent siblings have the same x position", () => {
      const spans = [
        createSpan({ id: "parent", name: "parent", duration: 2000, timestamp: 0 }),
        createSpan({ id: "worker1", name: "worker1", duration: 500, timestamp: 100, parentId: "parent" }),
        createSpan({ id: "worker2", name: "worker2", duration: 500, timestamp: 100, parentId: "parent" }),
      ];

      const result = computeTimelineLayout(spans);

      expect(getLayout(result, "worker1").x).toBe(getLayout(result, "worker2").x);
    });

    it("concurrent siblings have different rows", () => {
      const spans = [
        createSpan({ id: "parent", name: "parent", duration: 2000, timestamp: 0 }),
        createSpan({ id: "worker1", name: "worker1", duration: 500, timestamp: 100, parentId: "parent" }),
        createSpan({ id: "worker2", name: "worker2", duration: 500, timestamp: 100, parentId: "parent" }),
      ];

      const result = computeTimelineLayout(spans);

      expect(getLayout(result, "worker1").row).not.toBe(getLayout(result, "worker2").row);
    });
  });

  describe("node type inference", () => {
    it("GENERATION type becomes llm", () => {
      const spans = [createSpan({ id: "gen", name: "gen", data: { type: "GENERATION" } })];

      const result = computeTimelineLayout(spans);

      expect(getLayout(result, "gen").nodeType).toBe("llm");
    });

    it("span with toolCalls becomes tool", () => {
      const spans = [createSpan({ id: "tool", name: "tool", data: { toolCalls: '[{"name":"search"}]' } })];

      const result = computeTimelineLayout(spans);

      expect(getLayout(result, "tool").nodeType).toBe("tool");
    });

    it("span with children becomes agent", () => {
      const spans = [
        createSpan({ id: "parent", name: "parent", duration: 2000, timestamp: 0 }),
        createSpan({ id: "child", name: "child", duration: 500, timestamp: 100, parentId: "parent" }),
      ];

      const result = computeTimelineLayout(spans);

      expect(getLayout(result, "parent").nodeType).toBe("agent");
    });

    it("tracks type counts in metrics", () => {
      const spans = [
        createSpan({ id: "llm1", name: "llm1", data: { type: "GENERATION" } }),
        createSpan({ id: "llm2", name: "llm2", data: { type: "GENERATION" } }),
        createSpan({ id: "tool1", name: "tool1", data: { toolCalls: "[{}]" } }),
      ];

      const result = computeTimelineLayout(spans);

      expect(result.metrics.typeBreakdown.llm).toBe(2);
      expect(result.metrics.typeBreakdown.tool).toBe(1);
    });
  });

  describe("error detection", () => {
    it.each([
      ["error", true],
      ["ERROR", true],
      ["failed", true],
      ["Failed", true],
      ["failure", true],
      ["success", false],
      ["ok", false],
      [undefined, false],
    ])("status '%s' hasError=%s", (status, expected) => {
      const spans = [createSpan({ id: "span", name: "span", data: { status } })];

      const result = computeTimelineLayout(spans);

      expect(getLayout(result, "span").hasError).toBe(expected);
    });
  });

  describe("edge cases", () => {
    it("zero-duration span has width 0", () => {
      const spans = [
        createSpan({ id: "instant", name: "instant", duration: 0, timestamp: 0 }),
        createSpan({ id: "normal", name: "normal", duration: 1000, timestamp: 0 }),
      ];

      const result = computeTimelineLayout(spans);

      expect(getLayout(result, "instant").width).toBe(0);
      expect(getLayout(result, "instant").durationMs).toBe(0);
    });

    it("negative duration is treated as zero", () => {
      const spans = [
        createSpan({ id: "bad", name: "bad", duration: -100, timestamp: 0 }),
        createSpan({ id: "normal", name: "normal", duration: 1000, timestamp: 0 }),
      ];

      const result = computeTimelineLayout(spans);

      expect(getLayout(result, "bad").durationMs).toBe(0);
      expect(getLayout(result, "bad").width).toBe(0);
    });

    it("single span has full width", () => {
      const spans = [createSpan({ id: "only", name: "only", duration: 1000, timestamp: 0 })];

      const result = computeTimelineLayout(spans);

      expect(getLayout(result, "only").x).toBe(0);
      expect(getLayout(result, "only").width).toBe(1);
    });
  });

  describe("ruler ticks", () => {
    it("major ticks have labels, minor ticks do not", () => {
      const spans = [createSpan({ id: "span", name: "span", duration: 5000, timestamp: 0 })];

      const result = computeTimelineLayout(spans);

      const majorTicks = result.rulerTicks.filter((t) => t.isMajor);
      const minorTicks = result.rulerTicks.filter((t) => !t.isMajor);

      expect(majorTicks.length).toBeGreaterThan(0);
      for (const tick of majorTicks) {
        expect(tick.label.length).toBeGreaterThan(0);
      }
      for (const tick of minorTicks) {
        expect(tick.label).toBe("");
      }
    });

    it("includes a tick at position 1 (end of trace)", () => {
      const spans = [createSpan({ id: "span", name: "span", duration: 1000, timestamp: 0 })];

      const result = computeTimelineLayout(spans);

      const endTick = result.rulerTicks.find((t) => t.position === 1);
      expect(endTick).toBeDefined();
      expect(endTick!.isMajor).toBe(true);
    });
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe("formatDuration", () => {
  it.each([
    [0, "0ms"],
    [1, "1ms"],
    [999, "999ms"],
    [1000, "1.0s"],
    [1500, "1.5s"],
    [59999, "60.0s"],
    [60000, "1m"],
    [90000, "1m 30s"],
    [120000, "2m"],
    [125000, "2m 5s"],
  ])("formatDuration(%i) = '%s'", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe("calculateTickIntervals", () => {
  it("minor interval is 1/5 of major interval", () => {
    const durations = [100, 1000, 5000, 60000, 300000];

    for (const duration of durations) {
      const result = calculateTickIntervals(duration);
      expect(result.minor).toBe(result.major / 5);
    }
  });

  it("chooses reasonable major intervals", () => {
    // For a 5-second trace, we expect ~1 second major ticks
    const result = calculateTickIntervals(5000);
    expect(result.major).toBe(1000);

    // For a 30-second trace, we expect ~5 second major ticks
    const result2 = calculateTickIntervals(30000);
    expect(result2.major).toBe(5000);
  });
});

describe("hasErrorStatus", () => {
  it.each([
    [{ status: "error" }, true],
    [{ status: "ERROR" }, true],
    [{ status: "failed" }, true],
    [{ status: "failure" }, true],
    [{ status: "success" }, false],
    [{ status: "ok" }, false],
    [{}, false],
    [undefined, false],
  ])("hasErrorStatus with data=%j returns %s", (data, expected) => {
    const span = createSpan({ id: "test", name: "test", data: data as Record<string, unknown> });
    expect(hasErrorStatus(span)).toBe(expected);
  });
});
