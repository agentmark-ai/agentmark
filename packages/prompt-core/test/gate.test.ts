import { describe, it, expect } from "vitest";
import { evaluateExperimentGate, isRegression } from "../src/gate";

describe("isRegression", () => {
  it("fires when the fractional drop exceeds the tolerance", () => {
    // 0.91 → 0.84 is a 7.69% drop, over a 5% tolerance.
    expect(isRegression(0.84, 0.91, 0.05)).toBe(true);
  });

  it("does not fire within tolerance, on improvement, or at the exact boundary", () => {
    expect(isRegression(0.89, 0.91, 0.05)).toBe(false); // 2.2% drop, within 5%
    expect(isRegression(0.95, 0.9, 0.05)).toBe(false); // improvement
    expect(isRegression(0.9, 1.0, 0.1)).toBe(false); // exactly 10% drop, tolerance 0.1 (strict >)
  });

  it("returns false without a tolerance, without both scores, or for a non-positive baseline", () => {
    expect(isRegression(0.1, 0.9, undefined)).toBe(false);
    expect(isRegression(undefined, 0.9, 0.05)).toBe(false);
    expect(isRegression(0.5, undefined, 0.05)).toBe(false);
    expect(isRegression(0, 0, 0.05)).toBe(false);
  });
});

describe("evaluateExperimentGate", () => {
  const baseline = new Map<string, number>([["h1::groundedness", 0.91]]);

  it("flags a per-row regression beyond tolerance and fails the gate", () => {
    const result = evaluateExperimentGate({
      rows: [{ inputHash: "h1", evals: [{ name: "groundedness", score: 0.84 }] }],
      baseline,
      regressionTolerance: 0.05,
    });
    expect(result.regressionFailures).toBe(1);
    expect(result.passed).toBe(false);
    // rowResults pinpoints which (row × scorer) regressed, with its baseline.
    expect(result.rowResults).toEqual([
      { inputHash: "h1", evals: [{ name: "groundedness", score: 0.84, baselineScore: 0.91, regressed: true }] },
    ]);
  });

  it("passes when the drop is within tolerance", () => {
    const result = evaluateExperimentGate({
      rows: [{ inputHash: "h1", evals: [{ name: "groundedness", score: 0.89 }] }],
      baseline,
      regressionTolerance: 0.05,
    });
    expect(result.regressionFailures).toBe(0);
    expect(result.passed).toBe(true);
  });

  it("is inert when no baseline is available, regardless of tolerance", () => {
    const result = evaluateExperimentGate({
      rows: [{ inputHash: "h1", evals: [{ name: "groundedness", score: 0.1 }] }],
      regressionTolerance: 0.05,
    });
    expect(result.regressionFailures).toBe(0);
    expect(result.passed).toBe(true);
  });

  it("fails the run-level score-threshold gate on the mean across rows", () => {
    const result = evaluateExperimentGate({
      rows: [
        { evals: [{ name: "groundedness", score: 0.4 }] },
        { evals: [{ name: "groundedness", score: 0.6 }] }, // mean 0.5
      ],
      scoreThresholds: { groundedness: 0.9 },
    });
    expect(result.failedScoreThresholds).toEqual([
      { scorer: "groundedness", mean: 0.5, threshold: 0.9, count: 2 },
    ]);
    expect(result.passed).toBe(false);
  });

  it("passes the score-threshold gate when the mean meets the floor", () => {
    const result = evaluateExperimentGate({
      rows: [{ evals: [{ name: "groundedness", score: 0.95 }] }],
      scoreThresholds: { groundedness: 0.9 },
    });
    expect(result.failedScoreThresholds).toEqual([]);
    expect(result.scoreThresholdResults).toEqual([
      { scorer: "groundedness", mean: 0.95, threshold: 0.9, count: 1 },
    ]);
    expect(result.passed).toBe(true);
  });

  it("skips a configured threshold scorer that produced no numeric score (no false pass or fail)", () => {
    const result = evaluateExperimentGate({
      rows: [{ evals: [{ name: "groundedness", score: undefined }] }],
      scoreThresholds: { groundedness: 0.9 },
    });
    expect(result.scoreThresholdResults).toEqual([]);
    expect(result.passed).toBe(true);
  });
});
