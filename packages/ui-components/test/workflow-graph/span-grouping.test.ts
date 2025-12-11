/**
 * Unit tests for span grouping algorithm
 * Tests the makeGroupKey, groupSpansByKey, and inferNodeType functions
 */

import { describe, it, expect } from "vitest";
import {
  makeGroupKey,
  groupSpansByKey,
  inferNodeType,
  getDisplayName,
  hasChildSpans,
  type SpanForGrouping,
} from "../../src/sections/traces/utils/span-grouping";

describe("span-grouping", () => {
  describe("makeGroupKey", () => {
    it("creates key with parent span ID", () => {
      expect(makeGroupKey("parent-123", "generateText")).toBe(
        "parent-123:generateText"
      );
    });

    it("uses 'root' for undefined parent span ID", () => {
      expect(makeGroupKey(undefined, "generateText")).toBe("root:generateText");
    });

    it("handles empty span name", () => {
      expect(makeGroupKey("parent-123", "")).toBe("parent-123:");
    });
  });

  describe("groupSpansByKey", () => {
    it("groups spans with same parent and name", () => {
      const spans: SpanForGrouping[] = [
        { spanId: "span-1", parentSpanId: "parent-1", name: "generateText", startTime: 100 },
        { spanId: "span-2", parentSpanId: "parent-1", name: "generateText", startTime: 200 },
        { spanId: "span-3", parentSpanId: "parent-1", name: "search_web", startTime: 150 },
      ];

      const groups = groupSpansByKey(spans);

      expect(groups.size).toBe(2);

      const generateTextGroup = groups.get("parent-1:generateText");
      expect(generateTextGroup).toBeDefined();
      expect(generateTextGroup?.spanIds).toEqual(["span-1", "span-2"]);
      expect(generateTextGroup?.firstStartTime).toBe(100);

      const searchGroup = groups.get("parent-1:search_web");
      expect(searchGroup).toBeDefined();
      expect(searchGroup?.spanIds).toEqual(["span-3"]);
    });

    it("keeps separate groups for different parents", () => {
      const spans: SpanForGrouping[] = [
        { spanId: "span-1", parentSpanId: "parent-1", name: "generateText", startTime: 100 },
        { spanId: "span-2", parentSpanId: "parent-2", name: "generateText", startTime: 200 },
      ];

      const groups = groupSpansByKey(spans);

      expect(groups.size).toBe(2);
      expect(groups.has("parent-1:generateText")).toBe(true);
      expect(groups.has("parent-2:generateText")).toBe(true);
    });

    it("groups root-level spans under 'root'", () => {
      const spans: SpanForGrouping[] = [
        { spanId: "span-1", name: "generateText", startTime: 100 },
        { spanId: "span-2", name: "generateText", startTime: 200 },
      ];

      const groups = groupSpansByKey(spans);

      expect(groups.size).toBe(1);
      const rootGroup = groups.get("root:generateText");
      expect(rootGroup?.spanIds).toEqual(["span-1", "span-2"]);
    });

    it("tracks earliest start time", () => {
      const spans: SpanForGrouping[] = [
        { spanId: "span-1", parentSpanId: "parent-1", name: "generateText", startTime: 300 },
        { spanId: "span-2", parentSpanId: "parent-1", name: "generateText", startTime: 100 },
        { spanId: "span-3", parentSpanId: "parent-1", name: "generateText", startTime: 200 },
      ];

      const groups = groupSpansByKey(spans);
      const group = groups.get("parent-1:generateText");

      expect(group?.firstStartTime).toBe(100);
    });

    it("handles empty array", () => {
      const groups = groupSpansByKey([]);
      expect(groups.size).toBe(0);
    });
  });

  describe("inferNodeType", () => {
    it("returns 'llm' for GENERATION type spans", () => {
      const span: SpanForGrouping = {
        spanId: "span-1",
        name: "generateText",
        startTime: 100,
        type: "GENERATION",
      };

      expect(inferNodeType(span)).toBe("llm");
    });

    it("returns 'llm' for spans with GENERATION in data.type", () => {
      const span: SpanForGrouping = {
        spanId: "span-1",
        name: "generateText",
        startTime: 100,
        data: { type: "GENERATION" },
      };

      expect(inferNodeType(span)).toBe("llm");
    });

    it("returns 'tool' for spans with toolCalls", () => {
      const span: SpanForGrouping = {
        spanId: "span-1",
        name: "search_web",
        startTime: 100,
        data: { toolCalls: '[{"name": "search"}]' },
      };

      expect(inferNodeType(span)).toBe("tool");
    });

    it("returns 'agent' for spans with children", () => {
      const span: SpanForGrouping = {
        spanId: "span-1",
        name: "agent_run",
        startTime: 100,
      };

      expect(inferNodeType(span, true)).toBe("agent");
    });

    it("returns 'retrieval' for retrieval-related names", () => {
      const span: SpanForGrouping = {
        spanId: "span-1",
        name: "rag_search",
        startTime: 100,
      };

      expect(inferNodeType(span)).toBe("retrieval");
    });

    it("returns 'router' for router-related names", () => {
      const span: SpanForGrouping = {
        spanId: "span-1",
        name: "route_query",
        startTime: 100,
      };

      expect(inferNodeType(span)).toBe("router");
    });

    it("returns 'memory' for memory-related names", () => {
      const span: SpanForGrouping = {
        spanId: "span-1",
        name: "memory_store",
        startTime: 100,
      };

      expect(inferNodeType(span)).toBe("memory");
    });

    it("returns 'tool' for tool-related names", () => {
      const span: SpanForGrouping = {
        spanId: "span-1",
        name: "execute_tool",
        startTime: 100,
      };

      expect(inferNodeType(span)).toBe("tool");
    });

    it("returns 'default' for unknown spans", () => {
      const span: SpanForGrouping = {
        spanId: "span-1",
        name: "custom_operation",
        startTime: 100,
      };

      expect(inferNodeType(span)).toBe("default");
    });

    it("ignores empty toolCalls array", () => {
      const span: SpanForGrouping = {
        spanId: "span-1",
        name: "custom_operation",
        startTime: 100,
        data: { toolCalls: "[]" },
      };

      expect(inferNodeType(span)).toBe("default");
    });
  });

  describe("getDisplayName", () => {
    it("returns span name when provided", () => {
      expect(getDisplayName("generateText")).toBe("generateText");
    });

    it("returns 'Operation' for empty name", () => {
      expect(getDisplayName("")).toBe("Operation");
    });
  });

  describe("hasChildSpans", () => {
    it("returns true when span has children", () => {
      const spans: SpanForGrouping[] = [
        { spanId: "parent", name: "agent", startTime: 100 },
        { spanId: "child", parentSpanId: "parent", name: "generateText", startTime: 200 },
      ];

      expect(hasChildSpans(spans, new Set(["parent"]))).toBe(true);
    });

    it("returns false when span has no children", () => {
      const spans: SpanForGrouping[] = [
        { spanId: "parent", name: "agent", startTime: 100 },
        { spanId: "sibling", parentSpanId: "other", name: "generateText", startTime: 200 },
      ];

      expect(hasChildSpans(spans, new Set(["parent"]))).toBe(false);
    });

    it("returns false for empty spans array", () => {
      expect(hasChildSpans([], new Set(["parent"]))).toBe(false);
    });
  });
});
