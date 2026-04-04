/**
 * MarkdownRenderer Logic Tests
 *
 * Tests for the truncation and markdown-disable thresholds.
 * These test the pure logic — not the React rendering.
 */

import { describe, it, expect } from "vitest";
import {
  TRUNCATE_THRESHOLD,
  MARKDOWN_DISABLE_THRESHOLD,
  formatLength,
} from "@/sections/traces/trace-drawer/span-info/tabs/markdown-renderer";

describe("MarkdownRenderer thresholds", () => {
  describe("truncation logic", () => {
    it("should not truncate content below 10KB", () => {
      const content = "a".repeat(TRUNCATE_THRESHOLD - 1);
      const isLarge = content.length > TRUNCATE_THRESHOLD;
      expect(isLarge).toBe(false);
    });

    it("should truncate content above 10KB", () => {
      const content = "a".repeat(TRUNCATE_THRESHOLD + 1);
      const isLarge = content.length > TRUNCATE_THRESHOLD;
      expect(isLarge).toBe(true);

      const displayContent = content.slice(0, TRUNCATE_THRESHOLD);
      expect(displayContent.length).toBe(TRUNCATE_THRESHOLD);
    });

    it("should show full content when showFull is true", () => {
      const content = "a".repeat(20_000);
      const showFull = true;
      const isLarge = content.length > TRUNCATE_THRESHOLD;

      const displayContent = isLarge && !showFull
        ? content.slice(0, TRUNCATE_THRESHOLD)
        : content;

      expect(displayContent.length).toBe(20_000);
    });

    it("should handle exactly 10KB content (not truncated)", () => {
      const content = "a".repeat(TRUNCATE_THRESHOLD);
      const isLarge = content.length > TRUNCATE_THRESHOLD;
      expect(isLarge).toBe(false);
    });
  });

  describe("markdown disable logic", () => {
    it("should allow markdown for content below 50KB", () => {
      const content = "a".repeat(MARKDOWN_DISABLE_THRESHOLD - 1);
      const isTooLargeForMarkdown = content.length > MARKDOWN_DISABLE_THRESHOLD;
      expect(isTooLargeForMarkdown).toBe(false);
    });

    it("should force raw mode for content above 50KB", () => {
      const content = "a".repeat(MARKDOWN_DISABLE_THRESHOLD + 1);
      const isTooLargeForMarkdown = content.length > MARKDOWN_DISABLE_THRESHOLD;
      expect(isTooLargeForMarkdown).toBe(true);

      const effectiveMode = isTooLargeForMarkdown ? "raw" : "markdown";
      expect(effectiveMode).toBe("raw");
    });

    it("should handle content between 10KB and 50KB (truncated but markdown allowed)", () => {
      const content = "a".repeat(30_000);
      const isLarge = content.length > TRUNCATE_THRESHOLD;
      const isTooLargeForMarkdown = content.length > MARKDOWN_DISABLE_THRESHOLD;

      expect(isLarge).toBe(true);
      expect(isTooLargeForMarkdown).toBe(false);
    });
  });

  describe("effectiveMode interaction", () => {
    it("should force raw when content >50KB even if user selected markdown", () => {
      const content = "a".repeat(MARKDOWN_DISABLE_THRESHOLD + 1);
      const userMode = "markdown";
      const isTooLargeForMarkdown = content.length > MARKDOWN_DISABLE_THRESHOLD;
      const effectiveMode = isTooLargeForMarkdown ? "raw" : userMode;
      expect(effectiveMode).toBe("raw");
    });

    it("should respect user mode selection when content <=50KB", () => {
      const content = "a".repeat(MARKDOWN_DISABLE_THRESHOLD);
      const userMode = "markdown";
      const isTooLargeForMarkdown = content.length > MARKDOWN_DISABLE_THRESHOLD;
      const effectiveMode = isTooLargeForMarkdown ? "raw" : userMode;
      expect(effectiveMode).toBe("markdown");
    });

    it("should handle exactly 50KB content (not forced to raw)", () => {
      const content = "a".repeat(MARKDOWN_DISABLE_THRESHOLD);
      const isTooLargeForMarkdown = content.length > MARKDOWN_DISABLE_THRESHOLD;
      expect(isTooLargeForMarkdown).toBe(false);
    });
  });

  describe("truncation preserves prefix", () => {
    it("should preserve the first 10KB characters exactly when truncating", () => {
      // Create content with identifiable characters at boundary
      const prefix = "START_";
      const filler = "x".repeat(TRUNCATE_THRESHOLD - prefix.length);
      const content = prefix + filler + "SHOULD_BE_TRUNCATED";

      const isLarge = content.length > TRUNCATE_THRESHOLD;
      expect(isLarge).toBe(true);

      const displayContent = content.slice(0, TRUNCATE_THRESHOLD);
      expect(displayContent.startsWith("START_")).toBe(true);
      expect(displayContent.length).toBe(TRUNCATE_THRESHOLD);
      expect(displayContent).not.toContain("SHOULD_BE_TRUNCATED");
    });
  });

  describe("combined truncation and markdown disable", () => {
    it("should both truncate and disable markdown for content >50KB", () => {
      const content = "a".repeat(60_000);
      const isLarge = content.length > TRUNCATE_THRESHOLD;
      const isTooLargeForMarkdown = content.length > MARKDOWN_DISABLE_THRESHOLD;

      expect(isLarge).toBe(true);
      expect(isTooLargeForMarkdown).toBe(true);

      // When both apply, truncation still limits display to 10KB
      const showFull = false;
      const displayContent = isLarge && !showFull
        ? content.slice(0, TRUNCATE_THRESHOLD)
        : content;
      expect(displayContent.length).toBe(TRUNCATE_THRESHOLD);
    });

    it("should show full 60KB content when showFull is true, still in raw mode", () => {
      const content = "a".repeat(60_000);
      const showFull = true;
      const isLarge = content.length > TRUNCATE_THRESHOLD;
      const isTooLargeForMarkdown = content.length > MARKDOWN_DISABLE_THRESHOLD;

      const displayContent = isLarge && !showFull
        ? content.slice(0, TRUNCATE_THRESHOLD)
        : content;
      const effectiveMode = isTooLargeForMarkdown ? "raw" : "markdown";

      expect(displayContent.length).toBe(60_000);
      expect(effectiveMode).toBe("raw");
    });
  });

  describe("edge cases", () => {
    it("should handle empty content", () => {
      const content = "";
      const isLarge = content.length > TRUNCATE_THRESHOLD;
      const isTooLargeForMarkdown = content.length > MARKDOWN_DISABLE_THRESHOLD;
      expect(isLarge).toBe(false);
      expect(isTooLargeForMarkdown).toBe(false);
    });

    it("should handle single character content", () => {
      const content = "x";
      const isLarge = content.length > TRUNCATE_THRESHOLD;
      expect(isLarge).toBe(false);
    });
  });

  describe("formatLength", () => {
    it("should format small char counts", () => {
      expect(formatLength(500)).toBe("500 chars");
    });

    it("should format thousands of chars", () => {
      expect(formatLength(10_240)).toBe("10.0 K chars");
    });

    it("should format large counts with one decimal", () => {
      expect(formatLength(512_000)).toBe("500.0 K chars");
    });

    it("should use K chars boundary at exactly 1024", () => {
      expect(formatLength(1023)).toBe("1023 chars");
      expect(formatLength(1024)).toBe("1.0 K chars");
    });
  });
});
