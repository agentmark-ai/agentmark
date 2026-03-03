import db from "../../database";

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
}

export interface ExperimentItem {
  traceId: string;
  itemName: string;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  latencyMs: number;
  cost: number;
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
      MIN(root.CreatedAt) AS createdAt
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
      AND root.ParentSpanId IS NULL
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
      MIN(root.CreatedAt) AS createdAt
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
      AND root.ParentSpanId IS NULL
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
  };

  // Items: root span for dataset metadata, JOIN child model spans for input/output/cost.
  // Input/Output may be in normalized columns (Vercel AI SDK) or in SpanAttributes JSON
  // as gen_ai.prompt / gen_ai.completion (OpenTelemetry GenAI conventions).
  const itemsSql = `
    SELECT
      root.TraceId AS traceId,
      COALESCE(NULLIF(root.DatasetItemName, ''), root.SpanName, 'Item') AS itemName,
      COALESCE(
        NULLIF(gen.input, ''),
        NULLIF(gen.genai_input, ''),
        NULLIF(root.Input, ''),
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
      COALESCE(gen.item_cost, root.Cost, 0.0) AS cost
    FROM traces root
    LEFT JOIN (
      SELECT TraceId,
        MAX(Input) AS input,
        MAX(Output) AS output,
        MAX(OutputObject) AS outputObject,
        SUM(COALESCE(Cost, 0.0)) AS item_cost,
        MAX(json_extract(SpanAttributes, '$."gen_ai.prompt"')) AS genai_input,
        MAX(json_extract(SpanAttributes, '$."gen_ai.completion"')) AS genai_output
      FROM traces
      WHERE Model IS NOT NULL AND Model != ''
      GROUP BY TraceId
    ) gen ON gen.TraceId = root.TraceId
    WHERE root.DatasetRunId = ?
      AND root.ParentSpanId IS NULL
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
