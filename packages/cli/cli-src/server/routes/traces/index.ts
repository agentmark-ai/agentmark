import {
  getCostFormula,
  getModelCostMappings,
} from "../../../cost-mapping/cost-mapping";
import db from "../../database";
import type { NormalizedSpan } from "@agentmark/shared-utils";

/**
 * Convert NormalizedSpan to SQLite row format
 */
function normalizedSpanToSqliteRow(span: NormalizedSpan, modelsCostMapping: Record<string, { promptPrice: number; completionPrice: number }>) {
  // Convert startTime from milliseconds to nanoseconds (as string for Timestamp)
  const timestampNs = Math.floor(span.startTime * 1000000).toString();
  
  // Duration is stored in milliseconds (no conversion needed)
  const durationMs = Math.floor(span.duration);

  // Calculate cost if model and tokens are available
  let cost = span.cost || 0;
  const isSuccess = span.statusCode !== "2";
  const spanAttributes = { ...span.spanAttributes };
  
  if (span.model && span.inputTokens !== undefined && span.outputTokens !== undefined) {
    const priceMap = isSuccess ? modelsCostMapping[span.model] : null;
    if (priceMap) {
      const getCost = getCostFormula(
        Number(priceMap.promptPrice || 0),
        Number(priceMap.completionPrice || 0),
        1000
      );
      cost = getCost(span.inputTokens || 0, span.outputTokens || 0);
    }
    spanAttributes["gen_ai.usage.cost"] = cost;
  }

  // Convert events to consolidated JSON array
  const events = span.events.map(e => ({
    timestamp: Math.floor(e.timestamp * 1000000),
    name: e.name,
    attributes: e.attributes || {}
  }));

  // Convert links to consolidated JSON array
  const links = span.links.map(l => ({
    traceId: l.traceId,
    spanId: l.spanId,
    traceState: l.traceState || null,
    attributes: l.attributes || {}
  }));

  return {
    Timestamp: timestampNs,
    TraceId: span.traceId,
    SpanId: span.spanId,
    ParentSpanId: span.parentSpanId || null,
    TraceState: span.traceState || null,
    SpanName: span.name,
    SpanKind: span.kind,
    ServiceName: span.serviceName || null,
    ResourceAttributes: JSON.stringify(span.resourceAttributes || {}),
    SpanAttributes: JSON.stringify(spanAttributes),
    Duration: durationMs,
    EndTime: span.endTime || null,
    StatusCode: span.statusCode,
    StatusMessage: span.statusMessage || null,
    Events: JSON.stringify(events),
    Links: JSON.stringify(links),
    // Normalized columns
    Type: span.type,
    Model: span.model || "",
    InputTokens: span.inputTokens || 0,
    OutputTokens: span.outputTokens || 0,
    TotalTokens: span.totalTokens || 0,
    ReasoningTokens: span.reasoningTokens || 0,
    Cost: cost,
    Input: span.input ? JSON.stringify(span.input) : null,
    Output: span.output || null,
    OutputObject: span.outputObject ? JSON.stringify(span.outputObject) : null,
    ToolCalls: span.toolCalls ? JSON.stringify(span.toolCalls) : null,
    FinishReason: span.finishReason || null,
    Settings: span.settings ? JSON.stringify(span.settings) : null,
    SessionId: span.sessionId || "",
    SessionName: span.sessionName || "",
    UserId: span.userId || "",
    TraceName: span.traceName || "",
    DatasetRunId: span.datasetRunId || "",
    DatasetRunName: span.datasetRunName || "",
    DatasetPath: span.datasetPath || "",
    DatasetItemName: span.datasetItemName || "",
    DatasetExpectedOutput: span.datasetExpectedOutput || "",
    PromptName: span.promptName || "",
    Props: span.props || null,
    Metadata: span.metadata ? JSON.stringify(span.metadata) : null,
  };
}

export const exportTraces = async (normalizedSpans: NormalizedSpan[]) => {
  // Insert array of normalized spans into sqlite3 using transaction and prepared statement
  const insert = db.prepare(
    `
    INSERT INTO traces (
      Timestamp, TraceId, SpanId, ParentSpanId, TraceState, SpanName, SpanKind, ServiceName, 
      ResourceAttributes, SpanAttributes, Duration, EndTime, StatusCode, StatusMessage, 
      Events, Links,
      Type, Model, InputTokens, OutputTokens, TotalTokens, ReasoningTokens, Cost,
      Input, Output, OutputObject, ToolCalls, FinishReason, Settings,
      SessionId, SessionName, UserId, TraceName,
      DatasetRunId, DatasetRunName, DatasetPath, DatasetItemName, DatasetExpectedOutput,
      PromptName, Props, Metadata
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  );

  // Get model cost mappings once before the transaction
  const modelsCostMapping = await getModelCostMappings();

  const insertMany = db.transaction((spans: NormalizedSpan[]) => {
    for (const span of spans) {
      const row = normalizedSpanToSqliteRow(span, modelsCostMapping);
      insert.run(
        row.Timestamp,
        row.TraceId,
        row.SpanId,
        row.ParentSpanId,
        row.TraceState,
        row.SpanName,
        row.SpanKind,
        row.ServiceName,
        row.ResourceAttributes,
        row.SpanAttributes,
        row.Duration,
        row.EndTime,
        row.StatusCode,
        row.StatusMessage,
        row.Events,
        row.Links,
        row.Type,
        row.Model,
        row.InputTokens,
        row.OutputTokens,
        row.TotalTokens,
        row.ReasoningTokens,
        row.Cost,
        row.Input,
        row.Output,
        row.OutputObject,
        row.ToolCalls,
        row.FinishReason,
        row.Settings,
        row.SessionId,
        row.SessionName,
        row.UserId,
        row.TraceName,
        row.DatasetRunId,
        row.DatasetRunName,
        row.DatasetPath,
        row.DatasetItemName,
        row.DatasetExpectedOutput,
        row.PromptName,
        row.Props,
        row.Metadata
      );
    }
  });
  insertMany(normalizedSpans);
};

export const getRequests = async () => {
  const sql = `
    SELECT
      SpanId AS id,
      TraceId AS trace_id,
      SpanKind AS span_kind,
      Duration AS latency_ms,
      SpanName AS span_name,
      cast(Timestamp as Real) / 1000000 AS ts,
      PromptName AS prompt_name,
      UserId AS user_id,
      Props AS props,
      CASE
        WHEN Output IS NOT NULL AND Output != '' THEN Output
        WHEN OutputObject IS NOT NULL AND OutputObject != '' THEN OutputObject
        ELSE ToolCalls
      END AS output,
      Input AS input,
      DatasetRunId AS dataset_run_id,
      DatasetItemName AS dataset_item_name,
      DatasetExpectedOutput AS dataset_expected_output,
      Model AS model_used,
      StatusCode AS status,
      StatusMessage AS status_message,
      -- total_tokens = prompt_tokens + completion_tokens
      (COALESCE(InputTokens, 0) + COALESCE(OutputTokens, 0)) AS total_tokens,
      COALESCE(InputTokens, 0) AS prompt_tokens,
      COALESCE(OutputTokens, 0) AS completion_tokens,
      COALESCE(Cost, 0.0) AS cost
    FROM traces
    WHERE SpanName IN (
      'ai.generateText.doGenerate',
      'ai.streamText.doStream',
      'ai.generateObject.doGenerate',
      'ai.streamObject.doStream'
    )
    ORDER BY ts DESC
  `;

  const rows = db.prepare(sql).all();

  return rows;
};

export const getTraces = async () => {
  const sql = `
    WITH
trace_costs_and_tokens AS (
    SELECT
        TraceId AS id,
        SUM(COALESCE(InputTokens, 0) + COALESCE(OutputTokens, 0)) AS tokens,
        SUM(COALESCE(Cost, 0.0)) AS cost
    FROM traces
    WHERE SpanName IN (
        'ai.generateText.doGenerate',
        'ai.streamText.doStream',
        'ai.generateObject.doGenerate',
        'ai.streamObject.doStream'
    )
    GROUP BY TraceId
),

traces_cte AS (
    SELECT
        TraceId AS id,
        cast(MIN(Timestamp) as Real) / 1000000 AS start,
        cast(MAX(Timestamp) as Real) / 1000000 AS end,
        MAX(CASE
            WHEN StatusCode = '2.0' THEN '2'
            WHEN StatusCode = '2' THEN '2'
            WHEN StatusCode = '1.0' THEN '1'
            WHEN StatusCode = '1' THEN '1'
            ELSE '0'
        END) AS status,
        MIN(DatasetRunId) AS dataset_run_id,
        MIN(DatasetPath) AS dataset_path
    FROM traces
    GROUP BY TraceId
),

trace_metadata AS (
    SELECT
    t.TraceId AS id,
    COALESCE(
        MAX(NULLIF(t.TraceName, '')),
        MAX(t.SpanName)
    ) AS name,
    MAX(t.StatusMessage) AS status_message,
    MAX(t.Duration) AS latency
    FROM traces t
    LEFT JOIN traces c
        ON c.SpanId = t.ParentSpanId
    WHERE c.SpanId IS NULL    
    GROUP BY t.TraceId
)

SELECT
    t.id,
    t.dataset_run_id,
    t.dataset_path,
    t.start,
    t.end,
    t.status,
    c.cost,
    c.tokens,
    m.name,
    m.latency,
    m.status_message
FROM traces_cte t
LEFT JOIN trace_costs_and_tokens c ON t.id = c.id
LEFT JOIN trace_metadata m ON t.id = m.id
ORDER BY t.start DESC;
  `;

  const rows = db.prepare(sql).all();
  return rows;
};

export const getSpans = async (traceId: string) => {
  const sql = `
    SELECT
      SpanId AS id,
      SpanName AS name,
      Duration AS duration,
      ParentSpanId AS parent_id,
      CAST(Timestamp AS REAL) AS timestamp,
      TraceId AS trace_id,
      CASE
            WHEN StatusCode = '2.0' THEN '2'
            WHEN StatusCode = '2' THEN '2'
            WHEN StatusCode = '1.0' THEN '1'
            WHEN StatusCode = '1' THEN '1'
            ELSE '0'
      END AS status_code,
      StatusMessage AS status_message,
      SpanAttributes AS attributes,
      Type AS type,
      Model AS model,
      InputTokens AS inputTokens,
      OutputTokens AS outputTokens,
      TotalTokens AS totalTokens,
      ReasoningTokens AS reasoningTokens,
      Cost AS cost,
      Input AS input,
      Output AS output,
      OutputObject AS outputObject,
      ToolCalls AS toolCalls,
      FinishReason AS finishReason,
      Settings AS settings,
      SessionId AS sessionId,
      SessionName AS sessionName,
      UserId AS userId,
      TraceName AS traceName,
      PromptName AS promptName,
      Props AS props,
      SpanKind AS spanKind,
      ServiceName AS serviceName
    FROM traces
    WHERE TraceId = ?
    ORDER BY CAST(Timestamp AS REAL) ASC
  `;

  const rows = db.prepare(sql).all(traceId) as any[];

  return rows.map((row) => {
    // Parse SpanAttributes JSON
    let spanAttributes: any = {};
    try {
      if (row.attributes) {
        spanAttributes =
          typeof row.attributes === "string"
            ? JSON.parse(row.attributes)
            : row.attributes;
      }
    } catch {
      // If parsing fails, keep empty object
    }

    // Map all flat fields to data object matching SpanData type
    const data: any = {
      type: row.type || undefined,
      model: row.model || undefined,
      inputTokens: row.inputTokens ?? undefined,
      outputTokens: row.outputTokens ?? undefined,
      totalTokens: row.totalTokens ?? undefined,
      reasoningTokens: row.reasoningTokens ?? undefined,
      cost: row.cost ?? undefined,
      input: row.input || undefined,
      output: row.output || undefined,
      outputObject: row.outputObject || undefined,
      toolCalls: row.toolCalls || undefined,
      finishReason: row.finishReason || undefined,
      settings: row.settings || undefined,
      sessionId: row.sessionId || undefined,
      sessionName: row.sessionName || undefined,
      userId: row.userId || undefined,
      traceName: row.traceName || undefined,
      promptName: row.promptName || undefined,
      props: row.props || undefined,
      attributes: JSON.stringify(spanAttributes), // Include all attributes
      statusMessage: row.status_message || undefined,
      status: row.status_code,
      spanKind: row.spanKind || undefined,
      serviceName: row.serviceName || undefined,
      duration: row.duration || 0,
    };

    // Convert timestamp from microseconds to milliseconds (JavaScript standard)
    const timestampMs = row.timestamp ? Math.floor(row.timestamp / 1000) : 0;

    return {
      id: row.id,
      name: row.name,
      duration: row.duration || 0,
      parentId: row.parent_id || undefined,
      timestamp: timestampMs,
      traceId: row.trace_id,
      status: row.status_code,
      data,
    };
  });
};

export const getTraceById = async (traceId: string) => {
  const traceSql = `
    WITH
    trace_costs_and_tokens AS (
        SELECT
            TraceId AS id,
            SUM(COALESCE(InputTokens, 0) + COALESCE(OutputTokens, 0)) AS tokens,
            SUM(COALESCE(Cost, 0.0)) AS cost
        FROM traces
        WHERE SpanName IN (
            'ai.generateText.doGenerate',
            'ai.streamText.doStream',
            'ai.generateObject.doGenerate',
            'ai.streamObject.doStream'
        )
        GROUP BY TraceId
    ),

    traces_cte AS (
        SELECT
            TraceId AS id,
            cast(MIN(Timestamp) as Real) / 1000000 AS start,
            cast(MAX(Timestamp) as Real) / 1000000 AS end,
            MAX(CASE
                WHEN StatusCode = '2.0' THEN '2'
                WHEN StatusCode = '2' THEN '2'
                WHEN StatusCode = '1.0' THEN '1'
                WHEN StatusCode = '1' THEN '1'
                ELSE '0'
            END) AS status,
            MIN(DatasetRunId) AS dataset_run_id,
            MIN(DatasetPath) AS dataset_path
        FROM traces
        GROUP BY TraceId
    ),

    trace_metadata AS (
        SELECT
          t.TraceId AS id,
          COALESCE(
              MAX(NULLIF(t.TraceName, '')),
              MAX(t.SpanName)
          ) AS name,
          MAX(t.StatusMessage) AS status_message,
          MAX(t.Duration) AS latency
        FROM traces t
        LEFT JOIN traces c
            ON c.SpanId = t.ParentSpanId
        WHERE c.SpanId IS NULL    
        GROUP BY t.TraceId
    )

    SELECT
        t.id AS trace_id,
        t.start,
        t.end,
        t.status,
        t.dataset_run_id,
        t.dataset_path,
        c.tokens AS trace_tokens,
        c.cost AS trace_cost,
        m.name AS trace_name,
        m.latency AS trace_latency,
        m.status_message AS trace_status_message
    FROM traces_cte t
    LEFT JOIN trace_costs_and_tokens c ON t.id = c.id
    LEFT JOIN trace_metadata m ON t.id = m.id
    WHERE t.id = :traceId
    ORDER BY t.start DESC;
  `;

  const traceRow = db.prepare(traceSql).get({ traceId }) as any;

  if (!traceRow) return null;

  // Fetch spans separately
  const spans = await getSpans(traceId);

  return {
    id: traceRow.trace_id,
    name: traceRow.trace_name,
    spans,
    data: {
      id: traceRow.trace_id,
      name: traceRow.trace_name,
      status: traceRow.status,
      latency: traceRow.trace_latency,
      cost: traceRow.trace_cost,
      tokens: traceRow.trace_tokens,
      start: traceRow.start,
      end: traceRow.end,
      status_message: traceRow.trace_status_message,
    },
  };
};

export const getTraceGraph = async (traceId: string) => {
  const sql = `
    SELECT
      SpanId AS span_id,
      SpanName AS span_name,
      SpanAttributes AS attributes
    FROM traces
    WHERE TraceId = ?
      AND json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.graph.node.id"') != ''
      AND json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.graph.node.id"') IS NOT NULL
    ORDER BY CAST(Timestamp AS REAL) ASC
  `;

  const rows = db.prepare(sql).all(traceId) as any[];

  const graphData: Array<{
    parentNodeId?: string;
    nodeId: string;
    spanId: string;
    nodeType: string;
    displayName: string;
    spanName: string;
  }> = [];

  for (const row of rows) {
    // Parse SpanAttributes JSON
    let spanAttributes: any = {};
    try {
      if (row.attributes) {
        spanAttributes =
          typeof row.attributes === "string"
            ? JSON.parse(row.attributes)
            : row.attributes;
      }
    } catch {
      // If parsing fails, skip this row
      continue;
    }

    const nodeId = spanAttributes["ai.telemetry.metadata.graph.node.id"] || "";
    if (!nodeId) continue;

    // Handle parent_id - can be single value or array
    let parentNodeId: string | Array<string> | undefined;
    const parentIds = JSON.parse(
      spanAttributes["ai.telemetry.metadata.graph.node.parent_ids"] || "[]"
    );
    const parentId =
      spanAttributes["ai.telemetry.metadata.graph.node.parent_id"];

    if (Array.isArray(parentIds) && parentIds.length > 0) {
      parentNodeId = parentIds;
    } else if (parentId && parentId !== "") {
      parentNodeId = parentId;
    }

    const displayName =
      spanAttributes["ai.telemetry.metadata.graph.node.display_name"] || "";
    const nodeType =
      spanAttributes["ai.telemetry.metadata.graph.node.type"] || "";

    if (Array.isArray(parentNodeId)) {
      parentNodeId.forEach((id) => {
        graphData.push({
          parentNodeId: id,
          nodeId,
          spanId: row.span_id,
          nodeType,
          displayName,
          spanName: row.span_name,
        });
      });
    } else {
      graphData.push({
        parentNodeId,
        nodeId,
        spanId: row.span_id,
        nodeType,
        displayName,
        spanName: row.span_name,
      });
    }
  }

  return graphData;
};

export const getSessions = async () => {
  const sql = `
    WITH session_spans AS (
      SELECT
        TRIM(SessionId) AS id,
        CAST(Timestamp AS REAL) / 1000000 AS timestamp,
        SessionName AS session_name
      FROM traces
      WHERE SessionId IS NOT NULL
        AND SessionId != ''
        AND SessionId != 'null'
    )
    SELECT
      id,
      MIN(timestamp) AS start,
      MAX(timestamp) AS end,
      MIN(CASE 
        WHEN session_name IS NOT NULL AND session_name != ''
        THEN session_name
        ELSE NULL
      END) AS name
    FROM session_spans
    WHERE id IS NOT NULL AND id != ''
    GROUP BY id
    ORDER BY start DESC
  `;

  const rows = db.prepare(sql).all() as any[];
  return rows;
};

export const getTracesBySessionId = async (sessionId: string) => {
  // First, get all unique trace IDs for this session
  const traceIdsSql = `
    SELECT DISTINCT TraceId
    FROM traces
    WHERE SessionId = ?
  `;

  const traceIdRows = db.prepare(traceIdsSql).all(sessionId) as Array<{ TraceId: string }>;
  const traceIds = traceIdRows.map((row) => row.TraceId);

  if (traceIds.length === 0) {
    return [];
  }

  // Get all traces for these trace IDs
  const traces: any[] = [];
  for (const traceId of traceIds) {
    const trace = await getTraceById(traceId);
    if (trace) {
      traces.push(trace);
    }
  }

  return traces;
};

export const getTracesByRunId = async (runId: string) => {
  // Return traces in the same aggregated format as getTraces(), filtered by runId
  const sql = `
    WITH
trace_costs_and_tokens AS (
    SELECT
        TraceId AS id,
        SUM(COALESCE(InputTokens, 0) + COALESCE(OutputTokens, 0)) AS tokens,
        SUM(COALESCE(Cost, 0.0)) AS cost
    FROM traces
    WHERE SpanName IN (
        'ai.generateText.doGenerate',
        'ai.streamText.doStream',
        'ai.generateObject.doGenerate',
        'ai.streamObject.doStream'
    )
    GROUP BY TraceId
),

traces_cte AS (
    SELECT
        TraceId AS id,
        cast(MIN(Timestamp) as Real) / 1000000 AS start,
        cast(MAX(Timestamp) as Real) / 1000000 AS end,
        MAX(CASE
            WHEN StatusCode = '2.0' THEN '2'
            WHEN StatusCode = '2' THEN '2'
            WHEN StatusCode = '1.0' THEN '1'
            WHEN StatusCode = '1' THEN '1'
            ELSE '0'
        END) AS status,
        MIN(DatasetRunId) AS dataset_run_id,
        MIN(DatasetPath) AS dataset_path
    FROM traces
    GROUP BY TraceId
),

trace_metadata AS (
    SELECT
    t.TraceId AS id,
    COALESCE(
        MAX(NULLIF(t.TraceName, '')),
        MAX(t.SpanName)
    ) AS name,
    MAX(t.StatusMessage) AS status_message,
    MAX(t.Duration) AS latency
    FROM traces t
    LEFT JOIN traces c
        ON c.SpanId = t.ParentSpanId
    WHERE c.SpanId IS NULL    
    GROUP BY t.TraceId
)

SELECT
    t.id,
    t.dataset_run_id,
    t.dataset_path,
    t.start,
    t.end,
    t.status,
    c.cost,
    c.tokens,
    m.name,
    m.latency,
    m.status_message
FROM traces_cte t
LEFT JOIN trace_costs_and_tokens c ON t.id = c.id
LEFT JOIN trace_metadata m ON t.id = m.id
WHERE t.dataset_run_id = ?
ORDER BY t.start DESC;
  `;

  const rows = db.prepare(sql).all(runId);
  return rows;
};
