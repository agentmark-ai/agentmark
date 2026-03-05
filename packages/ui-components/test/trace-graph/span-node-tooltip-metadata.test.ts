/**
 * Tests for SpanNodeTooltip metadata behavior.
 *
 * Since the vitest environment is 'node' (not jsdom), we test the
 * tooltip's data pipeline: extractSpanSummary + formatMetadataEntries.
 * This validates the data that flows into the tooltip rendering.
 */

import { describe, it, expect } from "vitest";
import {
  extractSpanSummary,
  formatMetadataEntries,
} from "../../src/sections/traces/trace-drawer/trace-graph/span-node-tooltip-utils";
import type { SpanData } from "../../src/sections/traces/types";

// ---------------------------------------------------------------------------
// Helper: create a SpanData with controllable metadata
// ---------------------------------------------------------------------------

function createSpanWithMetadata(
  metadata: Record<string, string> | null | undefined
): SpanData {
  const base: SpanData = {
    id: "span-1",
    name: "llm.generate",
    duration: 2500,
    timestamp: Date.now(),
    data: {
      type: "GENERATION",
      model: "gpt-4",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cost: 0.005,
      input: "What is AI?",
      output: "AI is artificial intelligence.",
      status: "OK",
    },
  };

  if (metadata !== undefined) {
    base.data.metadata = metadata;
  }

  return base;
}

// ---------------------------------------------------------------------------
// extractSpanSummary – metadata extraction
// ---------------------------------------------------------------------------

describe("SpanNodeTooltip metadata data pipeline", () => {
  describe("extractSpanSummary metadata extraction", () => {
    it("should return metadata record when metadata has entries", () => {
      const span = createSpanWithMetadata({
        env: "production",
        version: "2.1.0",
        userId: "user-42",
      });
      const summary = extractSpanSummary(span);

      expect(summary.metadata).toEqual({
        env: "production",
        version: "2.1.0",
        userId: "user-42",
      });
    });

    it("should return null metadata when metadata key is absent from data", () => {
      const span = createSpanWithMetadata(undefined);
      const summary = extractSpanSummary(span);
      expect(summary.metadata).toBeNull();
    });

    it("should return null metadata when metadata is null", () => {
      const span = createSpanWithMetadata(null);
      const summary = extractSpanSummary(span);
      expect(summary.metadata).toBeNull();
    });

    it("should return null metadata when metadata is an empty object", () => {
      const span = createSpanWithMetadata({});
      const summary = extractSpanSummary(span);
      expect(summary.metadata).toBeNull();
    });

    it("should return metadata when only one entry exists", () => {
      const span = createSpanWithMetadata({ region: "us-east-1" });
      const summary = extractSpanSummary(span);
      expect(summary.metadata).toEqual({ region: "us-east-1" });
    });

    it("should preserve existing tooltip fields alongside metadata", () => {
      const span = createSpanWithMetadata({ env: "staging" });
      const summary = extractSpanSummary(span);

      // Existing tooltip fields still populated
      expect(summary.name).toBe("llm.generate");
      expect(summary.model).toBe("gpt-4");
      expect(summary.cost).not.toBeNull();
      expect(summary.input).not.toBeNull();
      expect(summary.output).not.toBeNull();
      expect(summary.status).toBe("OK");
      // Metadata also present
      expect(summary.metadata).toEqual({ env: "staging" });
    });
  });

  // ---------------------------------------------------------------------------
  // formatMetadataEntries
  // ---------------------------------------------------------------------------

  describe("formatMetadataEntries", () => {
    it("should format all entries when count is within max limit", () => {
      const { entries, remaining } = formatMetadataEntries({
        env: "production",
        version: "2.1.0",
        userId: "user-42",
      });

      expect(entries).toHaveLength(3);
      expect(remaining).toBe(0);
      expect(entries[0]!.key).toBe("env");
      expect(entries[0]!.value).toBe("production");
      expect(entries[1]!.key).toBe("version");
      expect(entries[1]!.value).toBe("2.1.0");
      expect(entries[2]!.key).toBe("userId");
      expect(entries[2]!.value).toBe("user-42");
    });

    it("should cap displayed entries at 5 with correct remaining count", () => {
      const metadata: Record<string, string> = {};
      for (let i = 1; i <= 7; i++) {
        metadata[`tag${i}`] = `value${i}`;
      }

      const { entries, remaining } = formatMetadataEntries(metadata);
      expect(entries).toHaveLength(5);
      expect(remaining).toBe(2);
    });

    it("should return remaining of 0 when exactly at max entries", () => {
      const metadata: Record<string, string> = {};
      for (let i = 1; i <= 5; i++) {
        metadata[`key${i}`] = `val${i}`;
      }

      const { entries, remaining } = formatMetadataEntries(metadata);
      expect(entries).toHaveLength(5);
      expect(remaining).toBe(0);
    });

    it("should handle a single entry", () => {
      const { entries, remaining } = formatMetadataEntries({
        solo: "only-one",
      });

      expect(entries).toHaveLength(1);
      expect(remaining).toBe(0);
      expect(entries[0]!.key).toBe("solo");
      expect(entries[0]!.value).toBe("only-one");
    });

    it("should truncate values longer than 100 characters", () => {
      const longValue = "x".repeat(200);
      const { entries } = formatMetadataEntries({ longKey: longValue });

      // truncateText(val, 100) returns 100 chars + ellipsis = 101 total
      expect(entries[0]!.value.length).toBe(101);
      expect(entries[0]!.value.endsWith("\u2026")).toBe(true);
    });

    it("should not truncate values at exactly 100 characters", () => {
      const exactValue = "a".repeat(100);
      const { entries } = formatMetadataEntries({ exact: exactValue });

      expect(entries[0]!.value).toBe(exactValue);
      expect(entries[0]!.value.length).toBe(100);
    });

    it("should return empty string for empty-string metadata values", () => {
      // truncateText("") returns null, and formatMetadataEntries uses ?? ''
      const { entries } = formatMetadataEntries({ empty: "" });

      expect(entries[0]!.key).toBe("empty");
      expect(entries[0]!.value).toBe("");
    });

    it("should respect custom maxEntries parameter", () => {
      const metadata: Record<string, string> = {};
      for (let i = 1; i <= 10; i++) {
        metadata[`k${i}`] = `v${i}`;
      }

      const { entries, remaining } = formatMetadataEntries(metadata, 3);
      expect(entries).toHaveLength(3);
      expect(remaining).toBe(7);
    });

    it("should return remaining of 0 when maxEntries exceeds total keys", () => {
      const { entries, remaining } = formatMetadataEntries(
        { a: "1", b: "2" },
        10
      );
      expect(entries).toHaveLength(2);
      expect(remaining).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // End-to-end pipeline: extractSpanSummary -> formatMetadataEntries
  // ---------------------------------------------------------------------------

  describe("full pipeline: extractSpanSummary then formatMetadataEntries", () => {
    it("should extract and format metadata entries from a span", () => {
      const span = createSpanWithMetadata({
        env: "production",
        version: "2.1.0",
        userId: "user-42",
      });
      const summary = extractSpanSummary(span);

      expect(summary.metadata).not.toBeNull();
      const { entries, remaining } = formatMetadataEntries(summary.metadata!);
      expect(entries).toHaveLength(3);
      expect(remaining).toBe(0);
      expect(entries[0]!.key).toBe("env");
      expect(entries[0]!.value).toBe("production");
    });

    it("should produce null metadata that skips formatting for undefined metadata", () => {
      const span = createSpanWithMetadata(undefined);
      const summary = extractSpanSummary(span);
      expect(summary.metadata).toBeNull();
      // Tooltip rendering would skip the metadata section entirely
    });

    it("should cap large metadata sets through the full pipeline", () => {
      const metadata: Record<string, string> = {};
      for (let i = 1; i <= 12; i++) {
        metadata[`field${i}`] = `data${i}`;
      }
      const span = createSpanWithMetadata(metadata);
      const summary = extractSpanSummary(span);

      expect(summary.metadata).not.toBeNull();
      const { entries, remaining } = formatMetadataEntries(summary.metadata!);
      expect(entries).toHaveLength(5);
      expect(remaining).toBe(7);
    });

    it("should truncate long metadata values through the full pipeline", () => {
      const longValue = "z".repeat(150);
      const span = createSpanWithMetadata({ description: longValue });
      const summary = extractSpanSummary(span);

      expect(summary.metadata).not.toBeNull();
      const { entries } = formatMetadataEntries(summary.metadata!);
      expect(entries[0]!.key).toBe("description");
      expect(entries[0]!.value.length).toBe(101); // 100 + ellipsis
      expect(entries[0]!.value.endsWith("\u2026")).toBe(true);
    });
  });
});
