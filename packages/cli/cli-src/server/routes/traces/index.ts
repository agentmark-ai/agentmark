import {
  getCostFormula,
  getModelCostMappings,
} from "../../../cost-mapping/cost-mapping";
import db from "../../database";
import type { NormalizedSpan } from "@agentmark-ai/shared-utils";

/**
 * Extract + validate the `agentmark.tags` attribute from span/resource
 * attributes.
 *   - accepts native array, JSON array string, or comma-separated string
 *   - trims whitespace, drops empty + >100-char tags
 *   - caps at 20 tags per span
 */
function extractTags(attributes: Record<string, unknown>): string[] {
  const raw = attributes['agentmark.tags'];
  if (raw === undefined || raw === null || raw === '') return [];

  let tags: string[];
  if (Array.isArray(raw)) {
    tags = raw.map(String);
  } else if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      tags = Array.isArray(parsed) ? parsed.map(String) : [raw];
    } catch {
      tags = raw.split(',').map((t: string) => t.trim());
    }
  } else {
    return [];
  }

  return tags
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 100)
    .slice(0, 20);
}

/**
 * Convert NormalizedSpan to SQLite row format
 */
function normalizedSpanToSqliteRow(
  span: NormalizedSpan,
  modelsCostMapping: Record<
    string,
    { promptPrice: number; completionPrice: number }
  >
) {
  // Convert startTime from milliseconds to nanoseconds (as string for Timestamp)
  const timestampNs = Math.floor(span.startTime * 1000000).toString();

  // Duration is stored in milliseconds (no conversion needed)
  const durationMs = Math.floor(span.duration);

  // Calculate cost if model and tokens are available
  let cost = span.cost || 0;
  const isSuccess = span.statusCode !== "2";
  const spanAttributes = { ...span.spanAttributes };

  if (
    span.model &&
    span.inputTokens !== undefined &&
    span.outputTokens !== undefined
  ) {
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
  const events = span.events.map((e) => ({
    timestamp: Math.floor(e.timestamp * 1000000),
    name: e.name,
    attributes: e.attributes || {},
  }));

  // Convert links to consolidated JSON array
  const links = span.links.map((l) => ({
    traceId: l.traceId,
    spanId: l.spanId,
    traceState: l.traceState || null,
    attributes: l.attributes || {},
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
    DatasetInput: span.datasetInput || "",
    PromptName: span.promptName || "",
    Props: span.props || null,
    Metadata: span.metadata ? JSON.stringify(span.metadata) : null,
    // Tags look at resource + span attributes — user-supplied labels
    // live on whichever layer the SDK emitted them on.
    Tags: JSON.stringify(
      extractTags({ ...span.resourceAttributes, ...span.spanAttributes }),
    ),
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
      DatasetRunId, DatasetRunName, DatasetPath, DatasetItemName, DatasetExpectedOutput, DatasetInput,
      PromptName, Props, Metadata, Tags
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        row.DatasetInput,
        row.PromptName,
        row.Props,
        row.Metadata,
        row.Tags
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
    WHERE Type = 'GENERATION'
    ORDER BY ts DESC
  `;

  const rows = db.prepare(sql).all();

  return rows;
};

export interface TraceFilterOptions {
  status?: string;
  name?: string;
  latency_gt?: number;
  latency_lt?: number;
  limit?: number;
  offset?: number;
  dataset_run_id?: string;
}

export const getTraces = async (options: TraceFilterOptions = {}) => {
  const { status, name, latency_gt, latency_lt, limit, offset, dataset_run_id } = options;

  // Build WHERE conditions for the final query
  const conditions: string[] = [];
  const params: any[] = [];

  if (status !== undefined) {
    conditions.push('t.status = ?');
    params.push(status);
  }
  if (name !== undefined) {
    conditions.push('m.name LIKE ?');
    params.push(`%${name}%`);
  }
  if (latency_gt !== undefined) {
    conditions.push('m.latency > ?');
    params.push(latency_gt);
  }
  if (latency_lt !== undefined) {
    conditions.push('m.latency < ?');
    params.push(latency_lt);
  }
  if (dataset_run_id !== undefined) {
    conditions.push('t.dataset_run_id = ?');
    params.push(dataset_run_id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Add pagination with parameterized queries
  let limitClause = '';
  if (limit !== undefined && Number.isFinite(limit) && limit > 0) {
    limitClause = 'LIMIT ?';
    params.push(Math.floor(limit));
    if (offset !== undefined && Number.isFinite(offset) && offset >= 0) {
      limitClause += ' OFFSET ?';
      params.push(Math.floor(offset));
    }
  }

  const sql = `
    WITH
trace_costs_and_tokens AS (
    SELECT
        TraceId AS id,
        -- Use MAX across all spans — the SDK sets aggregated totals on exactly one span
        -- (invoke_agent for Claude Agent SDK, GENERATION for direct API, root for others)
        MAX(COALESCE(InputTokens, 0) + COALESCE(OutputTokens, 0)) AS tokens,
        MAX(COALESCE(Cost, 0.0)) AS cost
    FROM traces
    GROUP BY TraceId
),

traces_cte AS (
    SELECT
        TraceId AS id,
        cast(MIN(Timestamp) as Real) / 1000000 AS start,
        cast(MAX(Timestamp) as Real) / 1000000 AS end,
        COALESCE(
            MAX(CASE WHEN (ParentSpanId IS NULL OR ParentSpanId = '') THEN
                CASE
                    WHEN StatusCode = '2.0' THEN '2'
                    WHEN StatusCode = '2' THEN '2'
                    WHEN StatusCode = '1.0' THEN '1'
                    WHEN StatusCode = '1' THEN '1'
                    ELSE '0'
                END
            END),
            MAX(CASE
                WHEN StatusCode = '2.0' THEN '2'
                WHEN StatusCode = '2' THEN '2'
                WHEN StatusCode = '1.0' THEN '1'
                WHEN StatusCode = '1' THEN '1'
                ELSE '0'
            END)
        ) AS status,
        COUNT(*) AS span_count,
        MAX(NULLIF(DatasetRunId, '')) AS dataset_run_id,
        MAX(NULLIF(DatasetPath, '')) AS dataset_path
    FROM traces
    GROUP BY TraceId
),

-- Flatten + dedupe tags across every span in a trace. Tags are stored
-- as a JSON-encoded TEXT per span, so we json_each each span's array,
-- take DISTINCT values, and re-aggregate with json_group_array.
-- Empty/missing arrays contribute no rows.
trace_tags AS (
    SELECT
        TraceId AS id,
        json_group_array(DISTINCT tag.value) AS tags
    FROM traces, json_each(traces.Tags) AS tag
    WHERE json_valid(traces.Tags)
      AND traces.Tags != '[]'
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
    t.span_count,
    m.name,
    m.latency,
    m.status_message,
    COALESCE(tt.tags, '[]') AS tags
FROM traces_cte t
LEFT JOIN trace_costs_and_tokens c ON t.id = c.id
LEFT JOIN trace_metadata m ON t.id = m.id
LEFT JOIN trace_tags tt ON t.id = tt.id
${whereClause}
ORDER BY t.start DESC
${limitClause};
  `;

  const rows = db.prepare(sql).all(...params);
  return rows;
};

export const getTraceCount = async (options: TraceFilterOptions = {}) => {
  const { status, name, latency_gt, latency_lt, dataset_run_id } = options;

  const conditions: string[] = [];
  const params: any[] = [];

  if (status !== undefined) {
    conditions.push('t.status = ?');
    params.push(status);
  }
  if (name !== undefined) {
    conditions.push('m.name LIKE ?');
    params.push(`%${name}%`);
  }
  if (latency_gt !== undefined) {
    conditions.push('m.latency > ?');
    params.push(latency_gt);
  }
  if (latency_lt !== undefined) {
    conditions.push('m.latency < ?');
    params.push(latency_lt);
  }
  if (dataset_run_id !== undefined) {
    conditions.push('t.dataset_run_id = ?');
    params.push(dataset_run_id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    WITH
traces_cte AS (
    SELECT
        TraceId AS id,
        COALESCE(
            MAX(CASE WHEN (ParentSpanId IS NULL OR ParentSpanId = '') THEN
                CASE
                    WHEN StatusCode = '2.0' THEN '2'
                    WHEN StatusCode = '2' THEN '2'
                    WHEN StatusCode = '1.0' THEN '1'
                    WHEN StatusCode = '1' THEN '1'
                    ELSE '0'
                END
            END),
            MAX(CASE
                WHEN StatusCode = '2.0' THEN '2'
                WHEN StatusCode = '2' THEN '2'
                WHEN StatusCode = '1.0' THEN '1'
                WHEN StatusCode = '1' THEN '1'
                ELSE '0'
            END)
        ) AS status,
        MAX(NULLIF(DatasetRunId, '')) AS dataset_run_id
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
    MAX(t.Duration) AS latency
    FROM traces t
    LEFT JOIN traces c
        ON c.SpanId = t.ParentSpanId
    WHERE c.SpanId IS NULL
    GROUP BY t.TraceId
)

SELECT COUNT(*) AS total
FROM traces_cte t
LEFT JOIN trace_metadata m ON t.id = m.id
${whereClause};
  `;

  const row = db.prepare(sql).get(...params) as { total: number };
  return row.total;
};

const SPAN_SELECT_COLUMNS = `
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
    ServiceName AS serviceName,
    Metadata AS metadata`;

function mapRowToSpan(row: any) {
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
    attributes: JSON.stringify(spanAttributes),
    statusMessage: row.status_message || undefined,
    status: row.status_code,
    spanKind: row.spanKind || undefined,
    serviceName: row.serviceName || undefined,
    duration: row.duration || 0,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };

  // Convert timestamp from nanoseconds to milliseconds (JavaScript standard)
  const timestampMs = row.timestamp ? Math.floor(row.timestamp / 1000000) : 0;

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
}

/**
 * Propagate model, tokens, and cost from child spans to parent spans.
 * Runs on the mapped span format (after DB query).
 */
function propagateToParents(spans: any[]): void {
  const childrenOf = new Map<string, any[]>();
  for (const span of spans) {
    if (span.parentId) {
      const siblings = childrenOf.get(span.parentId) || [];
      siblings.push(span);
      childrenOf.set(span.parentId, siblings);
    }
  }

  // Process bottom-up (latest first)
  const sorted = [...spans].sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
  for (const span of sorted) {
    const children = childrenOf.get(span.id);
    if (!children || children.length === 0) continue;

    const d = span.data;
    if (!d) continue;

    // Aggregate tokens
    if (!d.inputTokens && !d.outputTokens) {
      let totalInput = 0;
      let totalOutput = 0;
      for (const child of children) {
        totalInput += child.data?.inputTokens || 0;
        totalOutput += child.data?.outputTokens || 0;
      }
      if (totalInput > 0 || totalOutput > 0) {
        d.inputTokens = totalInput;
        d.outputTokens = totalOutput;
        d.totalTokens = totalInput + totalOutput;
      }
    }

    // Inherit model
    if (!d.model) {
      for (const child of children) {
        if (child.data?.model) {
          d.model = child.data.model;
          break;
        }
      }
    }

    // Aggregate cost
    if (!d.cost) {
      let totalCost = 0;
      for (const child of children) {
        totalCost += child.data?.cost || 0;
      }
      if (totalCost > 0) {
        d.cost = totalCost;
      }
    }
  }
}

export const getSpans = async (traceId: string) => {
  const rows = db.prepare(`
    SELECT ${SPAN_SELECT_COLUMNS}
    FROM traces
    WHERE TraceId = ?
    ORDER BY CAST(Timestamp AS REAL) ASC
  `).all(traceId) as any[];

  const spans = rows.map(mapRowToSpan);
  propagateToParents(spans);
  return spans;
};

export const getTraceById = async (traceId: string) => {
  const traceSql = `
    WITH
    trace_costs_and_tokens AS (
        SELECT
            TraceId AS id,
            -- Use MAX across all spans — the SDK sets aggregated totals on exactly one span
            MAX(COALESCE(InputTokens, 0) + COALESCE(OutputTokens, 0)) AS tokens,
            MAX(COALESCE(Cost, 0.0)) AS cost
        FROM traces
        GROUP BY TraceId
    ),

    traces_cte AS (
        SELECT
            TraceId AS id,
            cast(MIN(Timestamp) as Real) / 1000000 AS start,
            cast(MAX(Timestamp) as Real) / 1000000 AS end,
            COALESCE(
                MAX(CASE WHEN (ParentSpanId IS NULL OR ParentSpanId = '') THEN
                    CASE
                        WHEN StatusCode = '2.0' THEN '2'
                        WHEN StatusCode = '2' THEN '2'
                        WHEN StatusCode = '1.0' THEN '1'
                        WHEN StatusCode = '1' THEN '1'
                        ELSE '0'
                    END
                END),
                MAX(CASE
                    WHEN StatusCode = '2.0' THEN '2'
                    WHEN StatusCode = '2' THEN '2'
                    WHEN StatusCode = '1.0' THEN '1'
                    WHEN StatusCode = '1' THEN '1'
                    ELSE '0'
                END)
            ) AS status,
            MAX(NULLIF(DatasetRunId, '')) AS dataset_run_id,
            MAX(NULLIF(DatasetPath, '')) AS dataset_path
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

  // Fetch spans for this trace
  let spans = await getSpans(traceId);

  // Query-time virtual hierarchy: if this trace has a SessionId, find
  // sibling traces from the same session and virtually parent them under
  // the invoke_agent span. This handles disconnected traces from separate
  // OTEL providers (e.g. CLI subprocess) without mutating stored data.
  const sessionRow = db.prepare(`
    SELECT DISTINCT SessionId FROM traces
    WHERE TraceId = ? AND SessionId IS NOT NULL AND SessionId != ''
    LIMIT 1
  `).get(traceId) as { SessionId: string } | undefined;

  if (sessionRow) {
    const siblingTraceIds = (db.prepare(`
      SELECT DISTINCT TraceId FROM traces
      WHERE TraceId != ?
      AND SessionId = ?
    `).all(traceId, sessionRow.SessionId) as Array<{ TraceId: string }>)
      .map(r => r.TraceId);

    if (siblingTraceIds.length > 0) {
      const agentRootSpan = spans.find(
        s => s.name?.startsWith("invoke_agent") && !s.parentId
      );

      // Batch-fetch all sibling spans in one query
      const placeholders = siblingTraceIds.map(() => '?').join(',');
      const sibRows = db.prepare(`
        SELECT ${SPAN_SELECT_COLUMNS}
        FROM traces
        WHERE TraceId IN (${placeholders})
        ORDER BY CAST(Timestamp AS REAL) ASC
      `).all(...siblingTraceIds) as any[];
      const sibSpans = sibRows.map(mapRowToSpan);

      for (const span of sibSpans) {
        // Virtually parent orphan root spans under the invoke_agent span
        if (agentRootSpan && !span.parentId) {
          spans.push({ ...span, parentId: agentRootSpan.id });
        } else {
          spans.push(span);
        }
      }
    }
  }

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
      Metadata AS metadata
    FROM traces
    WHERE TraceId = ?
      AND json_extract(json(Metadata), '$."graph.node.id"') != ''
      AND json_extract(json(Metadata), '$."graph.node.id"') IS NOT NULL
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
    // Parse Metadata JSON
    let metadata: any = {};
    try {
      if (row.metadata) {
        metadata =
          typeof row.metadata === "string"
            ? JSON.parse(row.metadata)
            : row.metadata;
      }
    } catch {
      // If parsing fails, skip this row
      continue;
    }

    const nodeId = metadata["graph.node.id"] || "";
    if (!nodeId) continue;

    // Handle parent_id - can be single value or array
    let parentNodeId: string | Array<string> | undefined;
    const parentIds = JSON.parse(metadata["graph.node.parent_ids"] || "[]");
    const parentId = metadata["graph.node.parent_id"];

    if (Array.isArray(parentIds) && parentIds.length > 0) {
      parentNodeId = parentIds;
    } else if (parentId && parentId !== "") {
      parentNodeId = parentId;
    }

    const displayName = metadata["graph.node.display_name"] || "";
    const nodeType = metadata["graph.node.type"] || "";

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
    WITH session_traces AS (
      SELECT
        TRIM(SessionId) AS session_id,
        TraceId AS trace_id,
        SessionName AS session_name
      FROM traces
      WHERE SessionId IS NOT NULL
        AND SessionId != ''
        AND SessionId != 'null'
      GROUP BY SessionId, TraceId
    ),
    all_session_spans AS (
      SELECT
        st.session_id,
        st.session_name,
        t.TraceId AS trace_id,
        CAST(t.Timestamp AS REAL) / 1000000 AS timestamp,
        COALESCE(t.Cost, 0) AS cost,
        COALESCE(t.TotalTokens, 0) AS total_tokens,
        COALESCE(t.Duration, 0) AS duration,
        t.TraceName AS trace_name,
        t.PromptName AS prompt_name
      FROM session_traces st
      JOIN traces t ON t.TraceId = st.trace_id
    )
    SELECT
      session_id AS id,
      MIN(timestamp) AS start,
      MAX(timestamp) AS end,
      COALESCE(
        MIN(CASE WHEN session_name IS NOT NULL AND session_name != '' THEN session_name ELSE NULL END),
        MIN(CASE WHEN prompt_name IS NOT NULL AND prompt_name != '' THEN prompt_name ELSE NULL END),
        MIN(CASE WHEN trace_name IS NOT NULL AND trace_name != '' THEN trace_name ELSE NULL END)
      ) AS name,
      COUNT(DISTINCT trace_id) AS traceCount,
      SUM(cost) AS totalCost,
      SUM(total_tokens) AS totalTokens,
      MAX(duration) AS latency
    FROM all_session_spans
    WHERE session_id IS NOT NULL AND session_id != ''
    GROUP BY session_id
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

  const traceIdRows = db.prepare(traceIdsSql).all(sessionId) as Array<{
    TraceId: string;
  }>;
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
        -- Use MAX across all spans — the SDK sets aggregated totals on exactly one span
        -- (invoke_agent for Claude Agent SDK, GENERATION for direct API, root for others)
        MAX(COALESCE(InputTokens, 0) + COALESCE(OutputTokens, 0)) AS tokens,
        MAX(COALESCE(Cost, 0.0)) AS cost
    FROM traces
    GROUP BY TraceId
),

traces_cte AS (
    SELECT
        TraceId AS id,
        cast(MIN(Timestamp) as Real) / 1000000 AS start,
        cast(MAX(Timestamp) as Real) / 1000000 AS end,
        COALESCE(
            MAX(CASE WHEN (ParentSpanId IS NULL OR ParentSpanId = '') THEN
                CASE
                    WHEN StatusCode = '2.0' THEN '2'
                    WHEN StatusCode = '2' THEN '2'
                    WHEN StatusCode = '1.0' THEN '1'
                    WHEN StatusCode = '1' THEN '1'
                    ELSE '0'
                END
            END),
            MAX(CASE
                WHEN StatusCode = '2.0' THEN '2'
                WHEN StatusCode = '2' THEN '2'
                WHEN StatusCode = '1.0' THEN '1'
                WHEN StatusCode = '1' THEN '1'
                ELSE '0'
            END)
        ) AS status,
        COUNT(*) AS span_count,
        MAX(NULLIF(DatasetRunId, '')) AS dataset_run_id,
        MAX(NULLIF(DatasetPath, '')) AS dataset_path
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
    t.span_count,
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

export interface SpanFilterOptions {
  traceId?: string;
  type?: string;
  status?: string;
  name?: string;
  model?: string;
  minDuration?: number;
  maxDuration?: number;
  limit?: number;
  offset?: number;
}

export const searchSpans = async (options: SpanFilterOptions = {}) => {
  const { traceId, type, status, name, model, minDuration, maxDuration, limit, offset } = options;

  // Build WHERE conditions
  const conditions: string[] = [];
  const params: any[] = [];

  if (traceId !== undefined) {
    conditions.push('TraceId = ?');
    params.push(traceId);
  }
  if (type !== undefined) {
    conditions.push('Type = ?');
    params.push(type);
  }
  if (status !== undefined) {
    // Map status to StatusCode format
    const statusCode = status === '2' ? '2' : status === '1' ? '1' : '0';
    conditions.push("(StatusCode = ? OR StatusCode = ? || '.0')");
    params.push(statusCode, statusCode);
  }
  if (name !== undefined) {
    conditions.push('SpanName LIKE ?');
    params.push(`%${name}%`);
  }
  if (model !== undefined) {
    conditions.push('Model LIKE ?');
    params.push(`%${model}%`);
  }
  if (minDuration !== undefined) {
    conditions.push('Duration >= ?');
    params.push(minDuration);
  }
  if (maxDuration !== undefined) {
    conditions.push('Duration <= ?');
    params.push(maxDuration);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Add pagination with parameterized queries
  let limitClause = '';
  if (limit !== undefined && Number.isFinite(limit) && limit > 0) {
    limitClause = 'LIMIT ?';
    params.push(Math.floor(limit));
    if (offset !== undefined && Number.isFinite(offset) && offset >= 0) {
      limitClause += ' OFFSET ?';
      params.push(Math.floor(offset));
    }
  }

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
      ServiceName AS serviceName,
      Metadata AS metadata
    FROM traces
    ${whereClause}
    ORDER BY CAST(Timestamp AS REAL) DESC
    ${limitClause}
  `;

  const rows = db.prepare(sql).all(...params) as any[];

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
      attributes: JSON.stringify(spanAttributes),
      statusMessage: row.status_message || undefined,
      status: row.status_code,
      spanKind: row.spanKind || undefined,
      serviceName: row.serviceName || undefined,
      duration: row.duration || 0,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };

    // Convert timestamp from nanoseconds to milliseconds
    const timestampMs = row.timestamp ? Math.floor(row.timestamp / 1000000) : 0;

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

