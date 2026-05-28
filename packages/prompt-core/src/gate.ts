/**
 * The experiment **regression gate** — a single, composition-agnostic primitive
 * shared by the CLI (`agentmark run-experiment`, prompt subjects) and the SDK
 * (`runExperiment`, arbitrary agent/workflow subjects). Keeping one
 * implementation means the two entry points can never drift on what "regressed"
 * or "below threshold" means.
 *
 * The gate has two independent predicates:
 *   - per-(row × scorer) **regression**: a scorer's score dropped more than
 *     `regressionTolerance` (a fraction) below its matched baseline score;
 *   - run-level **score thresholds**: a scorer's mean score across the run fell
 *     below a configured minimum.
 *
 * Both are evaluated on raw eval results + a baseline score map; nothing here
 * knows whether the subject was a prompt, a workflow, or an agent.
 */

import { baselineKey } from "./baseline";

/** Minimal cross-runtime predicate inputs use; matches the eval result shape. */
export interface GateEval {
  name: string;
  /** Numeric scorer score; non-numeric scores are ignored by both predicates. */
  score?: number;
}

export interface GateRow {
  /**
   * `hashRowInput` of the row's dataset input — the join key against the
   * baseline. Undefined when no baseline is in play (regression gate inert).
   */
  inputHash?: string;
  evals: GateEval[];
}

/** One scorer's run-level mean vs its configured threshold. */
export interface ScoreThresholdResult {
  scorer: string;
  /** Mean of the scorer's numeric scores across the run. */
  mean: number;
  /** Configured minimum mean from `score_thresholds`. */
  threshold: number;
  /** Number of rows that contributed a numeric score for this scorer. */
  count: number;
}

export interface GateInput {
  rows: GateRow[];
  /** `"<inputHash>::<scorer>" → baselineScore`. Omit/empty to disable the regression gate. */
  baseline?: Map<string, number>;
  /** Max fractional drop vs baseline before a (row × scorer) counts as a regression. */
  regressionTolerance?: number;
  /** Per-scorer minimum mean score across the run, keyed by scorer name. */
  scoreThresholds?: Record<string, number>;
}

/** Per-(row × scorer) regression detail, so callers can pinpoint *which* cases
 *  regressed (and by how much), not just count them. Aligned 1:1 with the input
 *  rows, in order. */
export interface GateRowResult {
  inputHash?: string;
  evals: Array<{
    name: string;
    score?: number;
    /** Matched baseline score for this (row × scorer), if a baseline was found. */
    baselineScore?: number;
    /** True when this specific score regressed beyond tolerance vs its baseline. */
    regressed: boolean;
  }>;
}

export interface GateResult {
  /** Count of (row × scorer) pairs that regressed beyond tolerance. */
  regressionFailures: number;
  /** Every configured threshold scorer that produced ≥1 numeric score. */
  scoreThresholdResults: ScoreThresholdResult[];
  /** Subset of the above whose mean fell below its threshold. */
  failedScoreThresholds: ScoreThresholdResult[];
  /** Per-row breakdown of which scorers regressed (and their baseline scores). */
  rowResults: GateRowResult[];
  /** True when neither gate fired — the run may ship. */
  passed: boolean;
}

/**
 * True when `score` dropped more than `tolerance` (a fraction of the baseline)
 * below `baselineScore`. Never fires without a tolerance, without both scores,
 * or when the baseline is non-positive (fractional drop undefined).
 */
export function isRegression(
  score: number | undefined,
  baselineScore: number | undefined,
  tolerance: number | undefined,
): boolean {
  if (typeof tolerance !== "number") return false;
  if (typeof score !== "number") return false;
  if (typeof baselineScore !== "number") return false;
  if (baselineScore <= 0) return false;
  return (baselineScore - score) / baselineScore > tolerance;
}

/**
 * Evaluate the regression gate over a run's rows. Pure and format-independent —
 * the caller decides what to do with `passed` (throw, set an exit code, render
 * a report). Per-scorer means are computed over numeric scores only; a
 * configured threshold scorer that never produced a numeric score is skipped
 * (no false pass *or* fail — there's simply nothing to gate).
 */
export function evaluateExperimentGate({
  rows,
  baseline,
  regressionTolerance,
  scoreThresholds,
}: GateInput): GateResult {
  let regressionFailures = 0;
  const agg = new Map<string, { sum: number; count: number }>();
  const rowResults: GateRowResult[] = [];

  for (const row of rows) {
    const evalResults: GateRowResult["evals"] = [];
    for (const e of row.evals) {
      const name = typeof e.name === "string" ? e.name : "";
      let baselineScore: number | undefined;
      let regressed = false;
      if (name) {
        if (typeof e.score === "number") {
          const a = agg.get(name) ?? { sum: 0, count: 0 };
          a.sum += e.score;
          a.count += 1;
          agg.set(name, a);
        }
        if (row.inputHash !== undefined && baseline) {
          baselineScore = baseline.get(baselineKey(row.inputHash, name));
          regressed = isRegression(e.score, baselineScore, regressionTolerance);
          if (regressed) regressionFailures += 1;
        }
      }
      evalResults.push({ name, score: e.score, baselineScore, regressed });
    }
    rowResults.push({ inputHash: row.inputHash, evals: evalResults });
  }

  const scoreThresholdResults: ScoreThresholdResult[] = [];
  if (scoreThresholds) {
    for (const [scorer, threshold] of Object.entries(scoreThresholds)) {
      const a = agg.get(scorer);
      if (!a || a.count === 0) continue;
      scoreThresholdResults.push({ scorer, mean: a.sum / a.count, threshold, count: a.count });
    }
  }

  const failedScoreThresholds = scoreThresholdResults.filter((r) => r.mean < r.threshold);
  const passed = regressionFailures === 0 && failedScoreThresholds.length === 0;
  return { regressionFailures, scoreThresholdResults, failedScoreThresholds, rowResults, passed };
}
