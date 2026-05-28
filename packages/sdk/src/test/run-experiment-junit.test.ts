import { describe, it, expect } from "vitest";
import { experimentResultToJUnit, type RunExperimentResult } from "../agentmark";

// experimentResultToJUnit maps an SDK RunExperimentResult through the shared
// prompt-core serializer, so a code/agent/workflow experiment surfaces in CI
// with the IDENTICAL JUnit shape a prompt experiment does. These tests pin the
// three things that must flow through faithfully: the suite identity, per-case
// regression failures, and run-level score-threshold testcases.

function baseResult(over: Partial<RunExperimentResult> = {}): RunExperimentResult {
  return {
    runId: "run-1",
    experimentKey: "support-agent",
    passed: true,
    regressionFailures: 0,
    scoreThresholdResults: [],
    failedScoreThresholds: [],
    regressionTolerance: 0.05,
    resolved: null,
    baselineRowsMatched: 0,
    rows: [],
    ...over,
  };
}

describe("experimentResultToJUnit", () => {
  it("renders one <testcase> per (row × scorer) under the experimentKey suite", async () => {
    const xml = await experimentResultToJUnit(
      baseResult({
        rows: [
          { input: { q: "a" }, output: "A", expectedOutput: "A", evals: [{ name: "groundedness", score: 0.9, passed: true, regressed: false }] },
          { input: { q: "b" }, output: "B", expectedOutput: "B", evals: [{ name: "groundedness", score: 0.92, passed: true, regressed: false }] },
        ],
      }),
    );
    expect(xml).toContain('<testsuite name="support-agent"');
    expect(xml).toMatch(/tests="2"/);
    expect(xml).toMatch(/failures="0"/);
  });

  it("emits a <failure> for a per-case regression beyond tolerance (absolute pass, baseline drop)", async () => {
    const xml = await experimentResultToJUnit(
      baseResult({
        passed: false,
        regressionFailures: 1,
        rows: [
          { input: { q: "a" }, output: "A", expectedOutput: "A", evals: [{ name: "groundedness", score: 0.5, passed: true, baselineScore: 0.91, regressed: true }] },
        ],
      }),
    );
    expect(xml).toMatch(/failures="1"/);
    expect(xml).toContain('<failure message="groundedness regressed');
    expect(xml).toContain("vs baseline");
    expect(xml).toContain('<property name="baseline_score" value="0.91"/>');
  });

  it("emits a run-threshold testcase per score_thresholds entry, failing those below threshold", async () => {
    const xml = await experimentResultToJUnit(
      baseResult({
        passed: false,
        scoreThresholdResults: [
          { scorer: "groundedness", mean: 0.5, threshold: 0.9, count: 3 },
          { scorer: "bleu", mean: 0.95, threshold: 0.8, count: 3 },
        ],
        failedScoreThresholds: [{ scorer: "groundedness", mean: 0.5, threshold: 0.9, count: 3 }],
      }),
    );
    expect(xml).toMatch(/tests="2"/);
    expect(xml).toMatch(/failures="1"/);
    expect(xml).toContain('classname="groundedness" name="run-threshold"');
  });

  it("defaults the suite name to a caller-provided override when given", async () => {
    const xml = await experimentResultToJUnit(baseResult(), { suiteName: "nightly/support" });
    expect(xml).toContain('name="nightly/support"');
  });
});
