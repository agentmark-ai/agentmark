import { describe, it, expect } from "vitest";
import { extractSpanPromptName } from "@/sections/traces/utils/extract-span-data";

describe("extractSpanPromptName", () => {
  it("returns the camelCase promptName when present", () => {
    expect(
      extractSpanPromptName({
        name: "invoke_agent",
        data: { promptName: "summarize" },
      })
    ).toBe("summarize");
  });

  it("falls back to snake_case prompt_name (legacy CH column form)", () => {
    expect(
      extractSpanPromptName({
        name: "invoke_agent",
        data: { prompt_name: "classify" },
      })
    ).toBe("classify");
  });

  it("prefers camelCase over snake_case when both present", () => {
    expect(
      extractSpanPromptName({
        name: "invoke_agent",
        data: { promptName: "primary", prompt_name: "fallback" },
      })
    ).toBe("primary");
  });

  it("returns null when no prompt name is set", () => {
    expect(
      extractSpanPromptName({ name: "invoke_agent", data: {} })
    ).toBeNull();
  });

  it("returns null for empty-string prompt names", () => {
    expect(
      extractSpanPromptName({ name: "x", data: { promptName: "" } })
    ).toBeNull();
  });

  it("returns null for null span", () => {
    expect(extractSpanPromptName(null)).toBeNull();
  });

  it("returns null for undefined span", () => {
    expect(extractSpanPromptName(undefined)).toBeNull();
  });

  it("returns null for non-string prompt names (defensive)", () => {
    expect(
      extractSpanPromptName({ data: { promptName: 42 } as never })
    ).toBeNull();
  });

  it("handles span with no `data` field", () => {
    expect(extractSpanPromptName({ name: "x" })).toBeNull();
  });
});
