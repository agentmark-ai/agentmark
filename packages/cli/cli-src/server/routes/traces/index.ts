import {
  getCostFormula,
  getModelCostMappings,
} from "../../../cost-mapping/cost-mapping";
import db from "../../database";

export const exportTraces = async (traces: any[]) => {
  // Insert array of traces into sqlite3 using transaction and prepared statement
  const insert = db.prepare(
    `
    INSERT INTO traces (Timestamp, TraceId, SpanId, ParentSpanId, TraceState, SpanName, SpanKind, ServiceName, ResourceAttributes, SpanAttributes, Duration, StatusCode, StatusMessage, Events_Timestamp, Events_Name, Events_Attributes, Links_TraceId, Links_SpanId, Links_TraceState, Links_Attributes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  );

  // Get model cost mappings once before the transaction
  const modelsCostMapping = await getModelCostMappings();

  const insertMany = db.transaction((traces: any[]) => {
    for (const trace of traces) {
      const isSuccess = trace.StatusCode !== 2;
      const spanAttributes = { ...trace.SpanAttributes };
      if (spanAttributes["gen_ai.request.model"]) {
        let getCost = (_a: number, _b: number) => {
          return 0;
        };

        const priceMap = isSuccess
          ? modelsCostMapping[spanAttributes["gen_ai.request.model"]]
          : null;
        getCost = getCostFormula(
          Number(priceMap?.promptPrice || 0),
          Number(priceMap?.completionPrice || 0),
          1000
        );
        const cost = getCost(
          Number(spanAttributes["gen_ai.usage.input_tokens"] || 0),
          Number(spanAttributes["gen_ai.usage.output_tokens"] || 0)
        );

        spanAttributes["gen_ai.usage.cost"] = cost;
      }

      insert.run(
        trace.Timestamp,
        `${trace.TraceId}`,
        `${trace.SpanId}`,
        `${trace.ParentSpanId}`,
        `${trace.TraceState}`,
        `${trace.SpanName}`,
        `${trace.SpanKind}`,
        `${trace.ServiceName}`,
        typeof trace.ResourceAttributes === "object"
          ? JSON.stringify(trace.ResourceAttributes)
          : trace.ResourceAttributes,
        typeof spanAttributes === "object"
          ? JSON.stringify(spanAttributes)
          : spanAttributes,
        `${trace.Duration}`,
        `${trace.StatusCode}`,
        trace.StatusMessage,
        typeof trace.Events_Timestamp === "object"
          ? JSON.stringify(trace.Events_Timestamp)
          : trace.Events_Timestamp,
        typeof trace.Events_Name === "object"
          ? JSON.stringify(trace.Events_Name)
          : trace.Events_Name,
        typeof trace.Events_Attributes === "object"
          ? JSON.stringify(trace.Events_Attributes)
          : trace.Events_Attributes,
        typeof trace.Links_TraceId === "object"
          ? JSON.stringify(trace.Links_TraceId)
          : trace.Links_TraceId,
        typeof trace.Links_SpanId === "object"
          ? JSON.stringify(trace.Links_SpanId)
          : trace.Links_SpanId,
        typeof trace.Links_TraceState === "object"
          ? JSON.stringify(trace.Links_TraceState)
          : trace.Links_TraceState,
        typeof trace.Links_Attributes === "object"
          ? JSON.stringify(trace.Links_Attributes)
          : trace.Links_Attributes
      );
    }
  });
  insertMany(traces);
};

export const getRequests = async () => {
  const sql = `
    SELECT
      SpanId AS id,
      TraceId AS trace_id,
      SpanKind AS span_kind,
      Duration AS latency_ms,
      SpanName AS span_name,
      TenantId AS tenant_id,
      AppId AS app_id,
      cast(Timestamp as Real) / 1000000 AS ts,
      json_extract(json(SpanAttributes), '$."gen_ai.system_prompt"') AS system_prompt,
      json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.templateName"') AS template_name,
      json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.prompt"') AS prompt_name,
      json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.userId"') AS user_id,
      json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.props"') AS props,
      CASE
        WHEN json_extract(json(SpanAttributes), '$."ai.response.text"') IS NOT NULL AND json_extract(json(SpanAttributes), '$."ai.response.text"') != ''
          THEN json_extract(json(SpanAttributes), '$."ai.response.text"')
        ELSE json_extract(json(SpanAttributes), '$."ai.response.object"')
      END AS output,
      json_extract(json(SpanAttributes), '$."ai.prompt.messages"') AS input,
      json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.dataset_run_id"') AS dataset_run_id,
      json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.dataset_item_name"') AS dataset_item_name,
      json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.dataset_expected_output"') AS dataset_expected_output,
      json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.commit_sha"') AS commit_sha,
      json_extract(json(SpanAttributes), '$."gen_ai.request.model"') AS model_used,
      StatusCode AS status,
      StatusMessage AS status_message,
      -- total_tokens = prompt_tokens + completion_tokens
      (COALESCE(CAST(json_extract(json(SpanAttributes), '$."gen_ai.usage.input_tokens"') AS INTEGER), 0)
       + COALESCE(CAST(json_extract(json(SpanAttributes), '$."gen_ai.usage.output_tokens"') AS INTEGER), 0)) AS total_tokens,
      COALESCE(CAST(json_extract(json(SpanAttributes), '$."gen_ai.usage.input_tokens"') AS INTEGER), 0) AS prompt_tokens,
      COALESCE(CAST(json_extract(json(SpanAttributes), '$."gen_ai.usage.output_tokens"') AS INTEGER), 0) AS completion_tokens,
      COALESCE(CAST(json_extract(json(SpanAttributes), '$."gen_ai.usage.cost"') AS REAL), 0.0) AS cost
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
        SUM(
            CAST(json_extract(SpanAttributes, '$."ai.usage.promptTokens"') AS INTEGER) +
            CAST(json_extract(SpanAttributes, '$."ai.usage.completionTokens"') AS INTEGER)
        ) AS tokens,
        SUM(
            CAST(json_extract(SpanAttributes, '$."gen_ai.usage.cost"') AS REAL)
        ) AS cost
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
        MIN(json_extract(SpanAttributes, '$."ai.telemetry.metadata.dataset_run_id"')) AS dataset_run_id,
        MIN(json_extract(SpanAttributes, '$."ai.telemetry.metadata.dataset_path"')) AS dataset_path
    FROM traces
    GROUP BY TraceId
),

trace_metadata AS (
    SELECT
        TraceId AS id,
        COALESCE(
            MAX(json_extract(SpanAttributes, '$."ai.telemetry.metadata.traceName"')),
            MAX(SpanName)
        ) AS name,
        MAX(StatusMessage) AS status_message,
        MAX(Duration) AS latency
    FROM traces
    WHERE ParentSpanId NOT IN (
        SELECT SpanId FROM traces
    )
    GROUP BY TraceId
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
      SpanKind AS span_kind,
      ServiceName AS service_name,
      TenantId AS tenant_id,
      AppId AS app_id,
      (COALESCE(CAST(json_extract(json(SpanAttributes), '$."ai.usage.promptTokens"') AS INTEGER), 0) +
       COALESCE(CAST(json_extract(json(SpanAttributes), '$."ai.usage.completionTokens"') AS INTEGER), 0)) AS tokens,
      COALESCE(CAST(json_extract(json(SpanAttributes), '$."gen_ai.usage.cost"') AS REAL), 0.0) AS cost,
      json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.sessionId"') AS session_id,
      COALESCE(
        NULLIF(json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.traceName"'), ''),
        SpanName
      ) AS trace_name
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

    // Extract common attributes
    const data: any = {
      model_name: spanAttributes["gen_ai.request.model"],
      status_message: row.status_message || undefined,
      status: row.status_code,
      span_kind: row.span_kind,
      service_name: row.service_name,
      tenant_id: row.tenant_id || undefined,
      app_id: row.app_id || undefined,
      tokens: row.tokens || 0,
      cost: row.cost || 0,
      session_id: row.session_id || undefined,
      duration: row.duration || 0,
      trace_name: row.trace_name || row.name,
      attributes: JSON.stringify(spanAttributes), // Include all attributes
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
  console.log("traceId", traceId);

  const traceSql = `
    WITH
    trace_costs_and_tokens AS (
        SELECT
            TraceId AS id,
            SUM(
                CAST(json_extract(SpanAttributes, '$."ai.usage.promptTokens"') AS INTEGER) +
                CAST(json_extract(SpanAttributes, '$."ai.usage.completionTokens"') AS INTEGER)
            ) AS tokens,
            SUM(
                CAST(json_extract(SpanAttributes, '$."gen_ai.usage.cost"') AS REAL)
            ) AS cost
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
            MIN(json_extract(SpanAttributes, '$."ai.telemetry.metadata.dataset_run_id"')) AS dataset_run_id,
            MIN(json_extract(SpanAttributes, '$."ai.telemetry.metadata.dataset_path"')) AS dataset_path
        FROM traces
        GROUP BY TraceId
    ),

    trace_metadata AS (
        SELECT
            TraceId AS id,
            COALESCE(
                MAX(json_extract(SpanAttributes, '$."ai.telemetry.metadata.traceName"')),
                MAX(SpanName)
            ) AS name,
            MAX(StatusMessage) AS status_message,
            MAX(Duration) AS latency
        FROM traces
        WHERE ParentSpanId NOT IN (
            SELECT SpanId FROM traces
        )
        GROUP BY TraceId
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
        TRIM(json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.sessionId"')) AS id,
        CAST(Timestamp AS REAL) / 1000000 AS timestamp,
        TenantId AS tenant_id,
        AppId AS app_id,
        json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.sessionName"') AS session_name
      FROM traces
      WHERE json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.sessionId"') IS NOT NULL
        AND json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.sessionId"') != ''
        AND json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.sessionId"') != 'null'
    )
    SELECT
      id,
      MIN(timestamp) AS start,
      MAX(timestamp) AS end,
      MIN(tenant_id) AS tenant_id,
      MIN(app_id) AS app_id,
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
    WHERE json_extract(json(SpanAttributes), '$."ai.telemetry.metadata.sessionId"') = ?
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
