import { describe, it, expect } from "vitest";
import { TestSettingsSchema } from "../src/schemas";

describe("TestSettingsSchema.score_thresholds", () => {
  it("accepts a per-scorer threshold map of fractions in [0, 1]", () => {
    const result = TestSettingsSchema.safeParse({
      dataset: "./data.jsonl",
      score_thresholds: { groundedness: 0.9, toxicity: 0 },
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.score_thresholds).toEqual({
      groundedness: 0.9,
      toxicity: 0,
    });
  });

  it("rejects a threshold above 1", () => {
    const result = TestSettingsSchema.safeParse({
      score_thresholds: { groundedness: 1.5 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative threshold", () => {
    const result = TestSettingsSchema.safeParse({
      score_thresholds: { groundedness: -0.1 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric threshold value", () => {
    const result = TestSettingsSchema.safeParse({
      score_thresholds: { groundedness: "high" },
    });
    expect(result.success).toBe(false);
  });

  it("coexists with regression_tolerance", () => {
    const result = TestSettingsSchema.safeParse({
      regression_tolerance: 0.05,
      score_thresholds: { groundedness: 0.9 },
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.regression_tolerance).toBe(0.05);
  });
});
