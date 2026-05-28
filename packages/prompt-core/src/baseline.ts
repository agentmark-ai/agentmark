/**
 * The baseline-lookup wire protocol, single-sourced so every client of
 * `GET /v1/experiments/baseline` (the CLI's run-experiment and the SDK's
 * runExperiment / getBaselineScores) builds the request and interprets the
 * response identically — the gate's *input* can't drift between entry points.
 *
 * Pure: no network I/O, no auth/config resolution. Callers own the transport
 * (base URL, headers) and their own error semantics (the CLI degrades to an
 * empty baseline; the SDK throws). This file only owns the *shape* of the
 * request and response, and the (row × scorer) join-key format.
 */

/** Which baseline run the endpoint resolved (echoed back so the gate never matches silently). */
export interface BaselineResolved {
  runId: string;
  treeHash: string;
  /** false = no run at the exact tree hash; the endpoint fell back to the most recent prior run. */
  matchedExactCommit: boolean;
}

export interface ParsedBaseline {
  resolved: BaselineResolved | null;
  /** Per-(row × scorer) baseline scores, keyed by `baselineKey(inputHash, scorer)`. */
  baseline: Map<string, number>;
}

/**
 * The (row × scorer) join key — defined ONCE so the side that builds the map
 * (this parser) and the side that reads it (`evaluateExperimentGate`) can never
 * disagree on the format.
 */
export function baselineKey(inputHash: string, scorer: string): string {
  return `${inputHash}::${scorer}`;
}

/**
 * Query string for `GET /v1/experiments/baseline`. Param names match
 * `ExperimentBaselineParamsSchema` (the server contract); single-sourced here so
 * the CLI and SDK can't drift on them.
 */
export function baselineRequestQuery(args: {
  experimentKey: string;
  treeHash: string;
  datasetPath?: string;
}): string {
  const qs = new URLSearchParams({ experiment_key: args.experimentKey, tree_hash: args.treeHash });
  if (args.datasetPath) qs.set("dataset_path", args.datasetPath);
  return qs.toString();
}

/**
 * Parse the `{ data: { resolved, rows } }` response envelope into a resolved-run
 * descriptor plus a score map keyed by `baselineKey`. Tolerant of missing /
 * malformed fields (skips rows that don't carry a numeric score) so a partial
 * response degrades gracefully rather than throwing.
 */
export function parseBaselineResponse(json: unknown): ParsedBaseline {
  const baseline = new Map<string, number>();
  let resolved: BaselineResolved | null = null;
  const data = (json as { data?: { resolved?: unknown; rows?: unknown[] } } | undefined)?.data ?? {};

  const r = data.resolved as { runId?: unknown; treeHash?: unknown; matchedExactCommit?: unknown } | undefined;
  if (r && typeof r.runId === "string") {
    resolved = {
      runId: r.runId,
      treeHash: typeof r.treeHash === "string" ? r.treeHash : "",
      matchedExactCommit: r.matchedExactCommit === true,
    };
  }

  // Guard against a truthy-but-non-array `rows` (malformed response): `for...of`
  // would throw, breaking the "degrades gracefully rather than throwing" contract.
  const rows = Array.isArray(data.rows) ? data.rows : [];
  for (const row of rows as Array<{ inputHash?: unknown; scorer?: unknown; score?: unknown }>) {
    if (
      row && typeof row.inputHash === "string" &&
      typeof row.scorer === "string" && typeof row.score === "number"
    ) {
      baseline.set(baselineKey(row.inputHash, row.scorer), row.score);
    }
  }

  return { resolved, baseline };
}
