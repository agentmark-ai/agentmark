import { randomUUID } from "node:crypto";
import { AGENTMARK_SCORE_ENDPOINT } from "./config";
import { initialize, span, deriveVercelSelector } from "./trace";
import { ApiLoader } from "@agentmark-ai/prompt-core/loader-api";
import type { MaskFunction } from "./trace";
// Type-only (erased at build, so prompt-core stays off the SDK's load path; the
// value helpers are lazy-imported in getBaselineScores).
import type { BaselineResolved, ScoreThresholdResult } from "@agentmark-ai/prompt-core";

// Re-exported so it stays part of the SDK's public surface, single-sourced from
// the shared baseline protocol in prompt-core.
export type { BaselineResolved, ScoreThresholdResult };

/** An evaluator scores one task output; `score` feeds the regression gate. */
export type ExperimentEvaluator<O = any> = {
  name: string;
  evaluate: (args: { input: any; output: O; expectedOutput?: any }) =>
    | { score: number; passed?: boolean; reason?: string; label?: string }
    | Promise<{ score: number; passed?: boolean; reason?: string; label?: string }>;
};

export type RunExperimentOptions<I = any, O = any> = {
  /** Stable, composition-agnostic identity of the evaluation (prompt/workflow/agent). */
  experimentKey: string;
  /** The dataset rows to run the subject against. */
  dataset: Array<{ input: I; expectedOutput?: any }>;
  /** The subject under test — any callable (an agent, a workflow, a model call). */
  task: (input: I) => O | Promise<O>;
  evaluators?: ExperimentEvaluator<O>[];
  /** Git tree hash of THIS run's code state — tags the run so it can be a future baseline. */
  sourceTreeHash?: string;
  /** Git tree hash to compare against; omit to skip the regression gate. */
  baselineTreeHash?: string;
  datasetPath?: string;
  regressionTolerance?: number;
  scoreThresholds?: Record<string, number>;
  concurrency?: number;
  /**
   * Cancellation: when it fires, the pool stops dispatching new rows
   * (in-flight rows finish). Mirrors the webhook runner's experiment
   * `signal` so Path A and Path B cancel the same way.
   */
  signal?: AbortSignal;
  /**
   * If set, write a JUnit XML report of this run to this path — the identical
   * format the CLI emits for prompt experiments, so SDK/code experiments surface
   * the same way in CI (one reporter over `agentmark-results-*.xml`).
   */
  junitPath?: string;
};

export type RunExperimentResult<O = any> = {
  runId: string;
  /** Stable identity of this evaluation (echoed from the options). */
  experimentKey: string;
  /** True when neither the regression nor the score-threshold gate fired. */
  passed: boolean;
  regressionFailures: number;
  /** All per-scorer run-level threshold results (superset of `failedScoreThresholds`). */
  scoreThresholdResults: ScoreThresholdResult[];
  failedScoreThresholds: Array<{ scorer: string; mean: number; threshold: number; count: number }>;
  /** Regression tolerance applied (echoed from the options) so the result renders to JUnit faithfully. */
  regressionTolerance?: number;
  /** Which baseline run was used (null = none found; matchedExactCommit:false = recency fallback). */
  resolved: BaselineResolved | null;
  /**
   * How many of this run's rows matched the resolved baseline by input hash. A
   * value of 0 while `resolved` is non-null means the regression gate compared
   * nothing — typically masked inputs (hideInputs/mask) or an `experimentKey` /
   * input mismatch with the baseline run. Assert on this in CI when a silently
   * inert gate would be worse than a hard failure.
   */
  baselineRowsMatched: number;
  /**
   * Per-row results. Each eval carries its matched `baselineScore` and a
   * `regressed` flag, so you can pinpoint exactly which cases regressed (and by
   * how much), e.g. `rows.flatMap(r => r.evals.filter(e => e.regressed))`.
   */
  rows: Array<{
    input: any;
    output: O;
    expectedOutput?: any;
    evals: Array<{ name: string; score?: number; passed?: boolean; reason?: string; label?: string; baselineScore?: number; regressed: boolean }>;
  }>;
};

type AgentmarkProps = {
  apiKey: string;
  appId: string;
  baseUrl?: string;
  mask?: MaskFunction;
};

type DefaultIO = {
  input: Record<string, any>;
  output: any;
};

type ScoreProps = {
  resourceId: string;
  label: string;
  reason: string;
  score: number;
  name: string;
  type?: string;
  /** Where the score came from. Defaults to "api" for direct sdk.score() calls. */
  source?: "experiment" | "annotation" | "api";
};

export class AgentMarkSDK<
  T extends { [P in keyof T]: { input: any; output: any } } = {
    [key: string]: DefaultIO;
  },
> {
  private apiKey: string;
  private appId: string;
  private baseUrl: string = "https://api.agentmark.co";
  private mask?: MaskFunction;

  constructor(
    { apiKey, appId, baseUrl, mask }: AgentmarkProps
  ) {
    this.apiKey = apiKey;
    this.appId = appId;
    this.baseUrl = baseUrl || this.baseUrl;
    this.mask = mask;
  }

  initTracing({
    disableBatch,
    registerGlobally,
    environment,
    prNumber,
  }: {
    disableBatch?: boolean;
    registerGlobally?: boolean;
    /** Target environment for these traces. Falls back to the
     *  `AGENTMARK_ENVIRONMENT` env var so CI can select an env with no code. */
    environment?: string;
    /** Target PR's preview env. Falls back to the `AGENTMARK_PR_NUMBER` env
     *  var (e.g. set from `github.event.number`). */
    prNumber?: number;
  } = {}) {
    const envFallback = process.env.AGENTMARK_ENVIRONMENT || undefined;
    const prRaw = process.env.AGENTMARK_PR_NUMBER;
    const prFallback =
      prRaw != null && prRaw !== "" && Number.isFinite(Number(prRaw))
        ? Number(prRaw)
        : undefined;
    // Precedence: explicit option > AGENTMARK_* env var > Vercel system var.
    const vercel = deriveVercelSelector();
    return initialize({
      apiKey: this.apiKey,
      appId: this.appId,
      baseUrl: this.baseUrl,
      disableBatch: !!disableBatch,
      environment: environment ?? envFallback ?? vercel.environment,
      prNumber: prNumber ?? prFallback ?? vercel.prNumber,
      mask: this.mask,
      registerGlobally,
    });
  }

  getApiLoader() {
    return ApiLoader.cloud({
      apiKey: this.apiKey,
      appId: this.appId,
      baseUrl: this.baseUrl,
    });
  }

  async score({ resourceId, label, reason, score, name, type, source }: ScoreProps) {
    const response = await fetch(`${this.baseUrl}/${AGENTMARK_SCORE_ENDPOINT}`, {
      method: "POST",
      body: JSON.stringify({ resourceId, label, reason, score, name, type, source: source ?? "api" }),
      headers: {
        "Content-Type": "application/json",
        "X-Agentmark-App-Id": this.appId,
        Authorization: `${this.apiKey}`,
      },
    });

    if (response.ok) {
      return (await response.json()).data;
    }
    const errorResponse = await response.json();
    throw errorResponse.error;
  }

  /**
   * Fetch a prior run's per-(row × scorer) baseline scores for the regression
   * gate, indexed by `"<inputHash>::<scorer>"`. Resolves by `experimentKey`,
   * preferring the run at the exact `treeHash` (else the most recent prior run);
   * `resolved` echoes which run was used (or null when none exists).
   */
  async getBaselineScores({
    experimentKey,
    treeHash,
    datasetPath,
  }: {
    experimentKey: string;
    treeHash: string;
    datasetPath?: string;
  }): Promise<{ resolved: BaselineResolved | null; baseline: Map<string, number> }> {
    // Build + parse via the shared baseline protocol (same as the CLI), so the
    // request shape and the resulting score map can't drift between them. The
    // SDK owns only its transport + error semantics (throws on a bad response).
    const { baselineRequestQuery, parseBaselineResponse } = await import("@agentmark-ai/prompt-core");
    const response = await fetch(
      `${this.baseUrl}/v1/experiments/baseline?${baselineRequestQuery({ experimentKey, treeHash, datasetPath })}`,
      {
        method: "GET",
        headers: {
          "X-Agentmark-App-Id": this.appId,
          Authorization: `${this.apiKey}`,
        },
      },
    );
    if (!response.ok) {
      const errorResponse = await response.json().catch(() => null);
      throw errorResponse?.error ?? new Error(`Baseline fetch failed: ${response.status}`);
    }
    return parseBaselineResponse(await response.json());
  }

  /**
   * Run an arbitrary subject (agent / workflow / multi-agent / prompt) over a
   * dataset and apply the regression gate — the SDK equivalent of
   * `agentmark run-experiment`, for subjects that aren't a single prompt.
   *
   * Each row runs inside a span tagged with the experiment identity
   * (`experimentKey` + `sourceTreeHash` + the row input), so the run is both
   * observable AND usable as a future baseline. Evaluator scores are posted and
   * fed to the shared `evaluateExperimentGate` (same gate the CLI uses). Returns
   * a structured result; the caller owns the exit decision (e.g. throw in CI).
   */
  async runExperiment<I = any, O = any>(
    opts: RunExperimentOptions<I, O>,
  ): Promise<RunExperimentResult<O>> {
    const { hashRowInput, evaluateExperimentGate, runDatasetPool } = await import("@agentmark-ai/prompt-core");
    const runId = randomUUID();
    const evaluators = opts.evaluators ?? [];
    const concurrency = Math.max(1, Math.floor(opts.concurrency ?? 20) || 1);
    const out: Array<{ input: I; output: O; expectedOutput?: any; evals: Array<{ name: string; score?: number; passed?: boolean; reason?: string; label?: string }>; inputHash: string } | undefined> =
      new Array(opts.dataset.length);

    // Same row pool as the webhook runner's experiments (prompt-core
    // runDatasetPool) — one implementation of ordering, dispatch, and
    // signal-driven cancellation across Path A and Path B.
    const reader = new ReadableStream<{ input: I; expectedOutput?: any }>({
      start(controller) {
        for (const row of opts.dataset) controller.enqueue(row);
        controller.close();
      },
    }).getReader();
    await runDatasetPool(
      reader,
      async ({ input, expectedOutput }, i) => {
        const { result, traceId } = await span(
          {
            name: opts.experimentKey,
            experimentKey: opts.experimentKey,
            sourceTreeHash: opts.sourceTreeHash,
            datasetRunId: runId,
            datasetRunName: opts.experimentKey,
            datasetItemName: String(i),
            datasetPath: opts.datasetPath,
            datasetExpectedOutput:
              expectedOutput !== undefined ? JSON.stringify(expectedOutput) : undefined,
            datasetInput: JSON.stringify(input),
          },
          async () => opts.task(input),
        );
        const output = await result;
        const evals: Array<{ name: string; score?: number; passed?: boolean; reason?: string; label?: string }> = [];
        for (const ev of evaluators) {
          const r = await ev.evaluate({ input, output, expectedOutput });
          evals.push({ name: ev.name, score: r.score, passed: r.passed, reason: r.reason, label: r.label });
          try {
            await this.score({
              resourceId: traceId,
              name: ev.name,
              score: r.score,
              label: r.label ?? "",
              reason: r.reason ?? "",
              type: "experiment",
              source: "experiment",
            });
          } catch {
            // Best-effort: a scoring POST failure must not abort the run.
          }
        }
        out[i] = { input, output, expectedOutput, evals, inputHash: hashRowInput(input) };
      },
      concurrency,
      opts.signal,
    );
    const rows = out.filter((r): r is NonNullable<typeof r> => !!r);

    let resolved: BaselineResolved | null = null;
    let baseline = new Map<string, number>();
    if (opts.baselineTreeHash) {
      try {
        const b = await this.getBaselineScores({
          experimentKey: opts.experimentKey,
          treeHash: opts.baselineTreeHash,
          datasetPath: opts.datasetPath,
        });
        resolved = b.resolved;
        baseline = b.baseline;
      } catch {
        // Baseline unavailable → gate degrades to the score-threshold checks only.
      }
    }

    const gate = evaluateExperimentGate({
      rows: rows.map((r) => ({ inputHash: r.inputHash, evals: r.evals })),
      baseline,
      regressionTolerance: opts.regressionTolerance,
      scoreThresholds: opts.scoreThresholds,
    });

    // How many rows actually matched the baseline by input hash. 0 with a
    // resolved baseline means the gate compared nothing (masked inputs, or an
    // experimentKey/input mismatch) — surface it rather than pass green silently.
    const baselineRowsMatched = gate.rowResults.filter((r) =>
      r.evals.some((e) => e.baselineScore !== undefined),
    ).length;
    if (resolved && baseline.size > 0 && baselineRowsMatched === 0) {
      console.warn(
        `[agentmark] runExperiment: baseline run ${resolved.runId} resolved but 0/${rows.length} rows matched by input hash — ` +
        `regression gate compared nothing. Inputs may be masked, or experimentKey/input may differ from the baseline.`,
      );
    }

    const result: RunExperimentResult<O> = {
      runId,
      experimentKey: opts.experimentKey,
      passed: gate.passed,
      regressionFailures: gate.regressionFailures,
      scoreThresholdResults: gate.scoreThresholdResults,
      failedScoreThresholds: gate.failedScoreThresholds,
      regressionTolerance: opts.regressionTolerance,
      resolved,
      baselineRowsMatched,
      // Merge the gate's per-row regression detail (baselineScore + regressed)
      // onto each eval — same order the rows were handed to the gate.
      rows: rows.map((r, i) => ({
        input: r.input,
        output: r.output,
        expectedOutput: r.expectedOutput,
        evals: r.evals.map((e, j) => ({
          ...e,
          baselineScore: gate.rowResults[i]?.evals[j]?.baselineScore,
          regressed: gate.rowResults[i]?.evals[j]?.regressed ?? false,
        })),
      })),
    };

    if (opts.junitPath) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(opts.junitPath, await experimentResultToJUnit(result));
    }

    return result;
  }
}

/**
 * Render a {@link RunExperimentResult} as JUnit XML — the identical format the
 * CLI emits for prompt experiments (single-sourced from `@agentmark-ai/prompt-core`),
 * so prompt-based and code-based experiments surface the same way in CI. Each
 * `(row × scorer)` becomes one `<testcase>`; a regression beyond tolerance or a
 * per-scorer threshold breach becomes a `<failure>`.
 */
export async function experimentResultToJUnit<O = any>(
  result: RunExperimentResult<O>,
  opts: { suiteName?: string } = {},
): Promise<string> {
  const { buildJUnitReport } = await import("@agentmark-ai/prompt-core");
  const rows = result.rows.map((r, i) => ({
    index: i,
    input: r.input,
    actualOutput: r.output,
    expectedOutput: r.expectedOutput,
    evals: r.evals.map((e) => ({
      name: e.name,
      score: e.score,
      passed: e.passed,
      reason: e.reason,
      label: e.label,
      baselineScore: e.baselineScore,
    })),
  }));
  return buildJUnitReport(rows, {
    suiteName: opts.suiteName ?? result.experimentKey,
    runId: result.runId,
    regressionTolerance: result.regressionTolerance,
    scoreThresholds: result.scoreThresholdResults,
  }).xml;
}
