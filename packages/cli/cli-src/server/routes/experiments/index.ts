import db from "../../database";
import { hashRowInput } from "@agentmark-ai/prompt-core";

export interface BaselineScoreRow {
  /** `hashRowInput` of the row's dataset input — the join key against a live run. */
  inputHash: string;
  /** Scorer name. */
  scorer: string;
  /** Numeric score recorded for this (row × scorer) on the baseline run. */
  score: number;
}

export interface ExperimentSummary {
  id: string;
  name: string;
  promptName: string;
  datasetPath: string;
  itemCount: number;
  avgLatencyMs: number;
  totalCost: number;
  avgScore: number | null;
  createdAt: string;
  commitSha: string;
}

export interface ExperimentItem {
  traceId: string;
  itemName: string;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  latencyMs: number;
  cost: number;
  totalTokens: number;
  model: string;
  scores: Array<{ name: string; score: number; label: string; reason: string }>;
}

export const getExperiments = async (): Promise<ExperimentSummary[]> => {
  // Root spans have dataset metadata; child spans with Model set have cost/promptName.
  // Use Model != '' instead of Type = 'GENERATION' since type classification may not
  // match for all SDK versions (e.g. OpenTelemetry GenAI vs Vercel AI SDK conventions).
  // Scores are stored with resource_id = TraceId (not SpanId).
  const sql = `
    SELECT
      root.DatasetRunId AS id,
      COALESCE(NULLIF(root.DatasetRunName, ''), root.DatasetRunId) AS name,
      COALESCE(MAX(NULLIF(gen.PromptName, '')), MAX(NULLIF(root.PromptName, ''))) AS promptName,
      MAX(NULLIF(root.DatasetPath, '')) AS datasetPath,
      COUNT(DISTINCT root.TraceId) AS itemCount,
      AVG(root.Duration) AS avgLatencyMs,
      COALESCE(SUM(gen.item_cost), 0.0) AS totalCost,
      MIN(root.CreatedAt) AS createdAt,
      MAX(json_extract(root.Metadata, '$.commit_sha')) AS commitSha
    FROM traces root
    LEFT JOIN (
      SELECT TraceId,
        SUM(COALESCE(Cost, 0.0)) AS item_cost,
        MAX(NULLIF(PromptName, '')) AS PromptName
      FROM traces
      WHERE Model IS NOT NULL AND Model != ''
      GROUP BY TraceId
    ) gen ON gen.TraceId = root.TraceId
    WHERE root.DatasetRunId IS NOT NULL
      AND root.DatasetRunId != ''
      AND (root.ParentSpanId IS NULL OR root.ParentSpanId = '')
    GROUP BY root.DatasetRunId
    ORDER BY MIN(root.CreatedAt) DESC
  `;

  const rows = db.prepare(sql).all() as any[];

  // Fetch average scores — scores.resource_id stores the OTEL TraceId
  return rows.map((row) => {
    const scoresSql = `
      SELECT AVG(s.score) AS avg_score
      FROM scores s
      WHERE s.resource_id IN (
        SELECT DISTINCT TraceId FROM traces WHERE DatasetRunId = ?
      )
    `;
    const scoreRow = db.prepare(scoresSql).get(row.id) as any;

    return {
      id: row.id,
      name: row.name,
      promptName: row.promptName || "",
      datasetPath: row.datasetPath || "",
      itemCount: row.itemCount,
      avgLatencyMs: Math.round(row.avgLatencyMs || 0),
      totalCost: row.totalCost || 0,
      avgScore: scoreRow?.avg_score ?? null,
      createdAt: row.createdAt,
      commitSha: row.commitSha || "",
    };
  });
};

export const getExperimentById = async (
  experimentId: string
): Promise<{ summary: ExperimentSummary; items: ExperimentItem[] } | null> => {
  // Summary: root spans for dataset metadata, JOIN child model spans for cost/promptName
  const summarySql = `
    SELECT
      root.DatasetRunId AS id,
      COALESCE(NULLIF(root.DatasetRunName, ''), root.DatasetRunId) AS name,
      COALESCE(MAX(NULLIF(gen.PromptName, '')), MAX(NULLIF(root.PromptName, ''))) AS promptName,
      MAX(NULLIF(root.DatasetPath, '')) AS datasetPath,
      COUNT(DISTINCT root.TraceId) AS itemCount,
      AVG(root.Duration) AS avgLatencyMs,
      COALESCE(SUM(gen.item_cost), 0.0) AS totalCost,
      MIN(root.CreatedAt) AS createdAt,
      MAX(json_extract(root.Metadata, '$.commit_sha')) AS commitSha
    FROM traces root
    LEFT JOIN (
      SELECT TraceId,
        SUM(COALESCE(Cost, 0.0)) AS item_cost,
        MAX(NULLIF(PromptName, '')) AS PromptName
      FROM traces
      WHERE Model IS NOT NULL AND Model != ''
      GROUP BY TraceId
    ) gen ON gen.TraceId = root.TraceId
    WHERE root.DatasetRunId = ?
      AND (root.ParentSpanId IS NULL OR root.ParentSpanId = '')
    GROUP BY root.DatasetRunId
  `;

  const summaryRow = db.prepare(summarySql).get(experimentId) as any;
  if (!summaryRow) return null;

  // Scores use resource_id = TraceId (OTEL trace ID)
  const scoresSql = `
    SELECT AVG(s.score) AS avg_score
    FROM scores s
    WHERE s.resource_id IN (
      SELECT DISTINCT TraceId FROM traces WHERE DatasetRunId = ?
    )
  `;
  const scoreRow = db.prepare(scoresSql).get(experimentId) as any;

  const summary: ExperimentSummary = {
    id: summaryRow.id,
    name: summaryRow.name,
    promptName: summaryRow.promptName || "",
    datasetPath: summaryRow.datasetPath || "",
    itemCount: summaryRow.itemCount,
    avgLatencyMs: Math.round(summaryRow.avgLatencyMs || 0),
    totalCost: summaryRow.totalCost || 0,
    avgScore: scoreRow?.avg_score ?? null,
    createdAt: summaryRow.createdAt,
    commitSha: summaryRow.commitSha || "",
  };

  // Items: root span for dataset metadata, JOIN child model spans for input/output/cost.
  // Input/Output may be in normalized columns (Vercel AI SDK) or in SpanAttributes JSON
  // as gen_ai.prompt / gen_ai.completion (OpenTelemetry GenAI conventions).
  const itemsSql = `
    SELECT
      root.TraceId AS traceId,
      COALESCE(NULLIF(root.DatasetItemName, ''), root.SpanName, 'Item') AS itemName,
      COALESCE(
        NULLIF(root.DatasetInput, ''),
        NULLIF(root.Input, ''),
        NULLIF(gen.input, ''),
        NULLIF(gen.genai_input, ''),
        ''
      ) AS input,
      COALESCE(root.DatasetExpectedOutput, '') AS expectedOutput,
      COALESCE(
        NULLIF(gen.output, ''),
        NULLIF(gen.outputObject, ''),
        NULLIF(gen.genai_output, ''),
        NULLIF(root.Output, ''),
        NULLIF(root.OutputObject, ''),
        ''
      ) AS actualOutput,
      COALESCE(root.Duration, 0) AS latencyMs,
      COALESCE(gen.item_cost, root.Cost, 0.0) AS cost,
      COALESCE(gen.totalTokens, root.TotalTokens, 0) AS totalTokens,
      COALESCE(NULLIF(gen.model, ''), NULLIF(root.Model, ''), '') AS model
    FROM traces root
    LEFT JOIN (
      SELECT TraceId,
        MAX(Input) AS input,
        MAX(Output) AS output,
        MAX(OutputObject) AS outputObject,
        SUM(COALESCE(Cost, 0.0)) AS item_cost,
        SUM(COALESCE(TotalTokens, 0)) AS totalTokens,
        MAX(NULLIF(Model, '')) AS model,
        MAX(json_extract(SpanAttributes, '$."gen_ai.prompt"')) AS genai_input,
        MAX(json_extract(SpanAttributes, '$."gen_ai.completion"')) AS genai_output
      FROM traces
      WHERE Model IS NOT NULL AND Model != ''
      GROUP BY TraceId
    ) gen ON gen.TraceId = root.TraceId
    WHERE root.DatasetRunId = ?
      AND (root.ParentSpanId IS NULL OR root.ParentSpanId = '')
    ORDER BY CAST(root.Timestamp AS REAL) ASC
  `;

  const itemRows = db.prepare(itemsSql).all(experimentId) as any[];

  const items: ExperimentItem[] = itemRows.map((item) => {
    // Scores use resource_id = TraceId (OTEL trace ID, not SpanId)
    const itemScoresSql = `
      SELECT name, score, label, reason
      FROM scores
      WHERE resource_id = ?
      ORDER BY created_at ASC
    `;
    const itemScores = db.prepare(itemScoresSql).all(item.traceId) as any[];

    return {
      traceId: item.traceId,
      itemName: item.itemName,
      input: item.input,
      expectedOutput: item.expectedOutput,
      actualOutput: item.actualOutput,
      latencyMs: item.latencyMs,
      cost: item.cost,
      totalTokens: item.totalTokens || 0,
      model: item.model || "",
      scores: itemScores.map((s: any) => ({
        name: s.name,
        score: s.score,
        label: s.label,
        reason: s.reason,
      })),
    };
  });

  return { summary, items };
};

/** Which baseline run was resolved (echoed back so the gate never matches silently). */
export interface BaselineResolved {
  runId: string;
  treeHash: string;
  /** false = no run at the exact tree hash; resolution fell back to the most recent prior run. */
  matchedExactCommit: boolean;
}

/**
 * Per-(row × scorer) scores from a prior "baseline" experiment run, used to
 * power the regression gate. A run is identified by its `ExperimentKey` (the
 * stable, composition-agnostic identity of the evaluation), preferring the run
 * at the exact `SourceTreeHash` (the base code state), else the most recent
 * prior run of that key. `datasetPath` is a soft signal only — row matching is
 * inputHash-based, so it does not scope resolution (keying on it would
 * reintroduce cross-eval collisions when prompts share a dataset).
 *
 * Rows are keyed by `hashRowInput(parsed DatasetInput)` so the caller can
 * match them to a live run's rows regardless of row order — see
 * `@agentmark-ai/prompt-core`'s `hashRowInput`.
 */
export const getBaselineScores = async (
  experimentKey: string,
  treeHash: string,
  // Accepted for API/signature symmetry with the cloud endpoint; not used for
  // resolution (see above).
  _datasetPath?: string
): Promise<{ resolved: BaselineResolved | null; rows: BaselineScoreRow[] }> => {
  // 1. Resolve the baseline run for this experiment_key, preferring the run at
  //    the exact tree hash, else the most recent prior run. `exact DESC` ranks
  //    a tree-hash match first, then recency.
  const runSql = `
    SELECT
      DatasetRunId AS runId,
      MAX(NULLIF(SourceTreeHash, '')) AS treeHash,
      CASE WHEN MAX(NULLIF(SourceTreeHash, '')) = ? THEN 1 ELSE 0 END AS exact
    FROM traces
    WHERE (ParentSpanId IS NULL OR ParentSpanId = '')
      AND DatasetRunId IS NOT NULL AND DatasetRunId != ''
      AND ExperimentKey = ?
    GROUP BY DatasetRunId
    ORDER BY exact DESC, MAX(CreatedAt) DESC
    LIMIT 1
  `;
  const runRow = db
    .prepare(runSql)
    .get(treeHash, experimentKey) as { runId?: string; treeHash?: string; exact?: number } | undefined;
  if (!runRow?.runId) return { resolved: null, rows: [] };
  const resolved: BaselineResolved = {
    runId: runRow.runId,
    treeHash: runRow.treeHash ?? '',
    matchedExactCommit: Number(runRow.exact) === 1,
  };

  // 2. Per-row inputs for that run (root spans carry the dataset input).
  const itemsSql = `
    SELECT
      TraceId AS traceId,
      COALESCE(NULLIF(DatasetInput, ''), NULLIF(Input, ''), '') AS input
    FROM traces
    WHERE DatasetRunId = ? AND (ParentSpanId IS NULL OR ParentSpanId = '')
  `;
  const itemRows = db.prepare(itemsSql).all(runRow.runId) as Array<{
    traceId: string;
    input: string;
  }>;

  // 3. Numeric scores per trace, hashed by parsed input.
  const rows: BaselineScoreRow[] = [];
  const scoresStmt = db.prepare(
    `SELECT name, score FROM scores WHERE resource_id = ? AND score IS NOT NULL`
  );
  for (const item of itemRows) {
    if (!item.input) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(item.input);
    } catch {
      continue; // Un-parseable input can't be matched to a live row.
    }
    const inputHash = hashRowInput(parsed);
    const scoreRows = scoresStmt.all(item.traceId) as Array<{
      name: string;
      score: number;
    }>;
    for (const s of scoreRows) {
      if (typeof s.score !== "number") continue;
      rows.push({ inputHash, scorer: s.name, score: s.score });
    }
  }

  return { resolved, rows };
};
