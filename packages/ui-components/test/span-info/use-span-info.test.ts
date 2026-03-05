/**
 * computeHasIOData Unit Tests
 * Feature: 034-enhance-trace-view
 *
 * Tests for the pure hasIOData computation extracted from useSpanInfo.
 * Validates the logic that determines whether a span has I/O data to display.
 */

import { describe, it, expect } from "vitest";
import { computeHasIOData } from "../../src/sections/traces/trace-drawer/span-info/hooks/use-span-info";
import type { SpanData } from "../../src/sections/traces/types";

// ============================================================================
// Test Factories
// ============================================================================

function createSpanData(overrides?: Partial<SpanData>): SpanData {
  return {
    id: "span-1",
    name: "test-span",
    duration: 1000,
    timestamp: Date.now(),
    data: {},
    ...overrides,
  };
}

// ============================================================================
// computeHasIOData Tests
// ============================================================================

describe("computeHasIOData", () => {
  describe("undefined and empty span", () => {
    it("returns false for undefined span", () => {
      expect(computeHasIOData(undefined)).toBe(false);
    });

    it("returns false for span with empty data object", () => {
      const span = createSpanData({ data: {} });
      expect(computeHasIOData(span)).toBe(false);
    });

    it("returns false when input and output are empty strings", () => {
      const span = createSpanData({ data: { input: "", output: "" } });
      expect(computeHasIOData(span)).toBe(false);
    });
  });

  describe("input field", () => {
    it("returns true for span with input only", () => {
      const span = createSpanData({ data: { input: "user prompt" } });
      expect(computeHasIOData(span)).toBe(true);
    });

    it("returns false for span with empty string input and no output or toolCalls", () => {
      const span = createSpanData({ data: { input: "" } });
      expect(computeHasIOData(span)).toBe(false);
    });
  });

  describe("output field", () => {
    it("returns true for span with output only", () => {
      const span = createSpanData({ data: { output: "assistant response" } });
      expect(computeHasIOData(span)).toBe(true);
    });

    it("returns false for span with empty string output and no input or toolCalls", () => {
      const span = createSpanData({ data: { output: "" } });
      expect(computeHasIOData(span)).toBe(false);
    });
  });

  describe("toolCalls field", () => {
    it("returns true for span with non-empty toolCalls string", () => {
      const span = createSpanData({ data: { toolCalls: '[{"name":"search"}]' } });
      expect(computeHasIOData(span)).toBe(true);
    });

    it("returns false for span with empty toolCalls string", () => {
      const span = createSpanData({ data: { toolCalls: "" } });
      expect(computeHasIOData(span)).toBe(false);
    });

    it("returns false for span with undefined toolCalls", () => {
      const span = createSpanData({ data: { toolCalls: undefined } });
      expect(computeHasIOData(span)).toBe(false);
    });

    it("returns true for non-empty toolCalls without input or output", () => {
      const span = createSpanData({
        data: { toolCalls: '[{"name":"get_weather","args":{}}]', input: "", output: "" },
      });
      expect(computeHasIOData(span)).toBe(true);
    });
  });

  describe("combined fields", () => {
    it("returns true for span with input + output + toolCalls", () => {
      const span = createSpanData({
        data: {
          input: "What is the weather?",
          output: "It is sunny.",
          toolCalls: '[{"name":"weather"}]',
        },
      });
      expect(computeHasIOData(span)).toBe(true);
    });

    it("returns true for span with input + output (no toolCalls)", () => {
      const span = createSpanData({
        data: { input: "Hello", output: "World" },
      });
      expect(computeHasIOData(span)).toBe(true);
    });

    it("returns false when all fields are empty strings", () => {
      const span = createSpanData({
        data: { input: "", output: "", toolCalls: "" },
      });
      expect(computeHasIOData(span)).toBe(false);
    });
  });

  describe("GENERATION span with token data but no I/O", () => {
    it("returns false when only token data is present (no input/output/toolCalls)", () => {
      const span = createSpanData({
        data: {
          type: "GENERATION",
          inputTokens: 50,
          outputTokens: 30,
          cost: 0.001,
        },
      });
      expect(computeHasIOData(span)).toBe(false);
    });
  });
});
