import db from "../../database";

export const exportTraces = async (traces: any[]) => {
  // Insert array of traces into sqlite3 using transaction and prepared statement
  const insert = db.prepare(
    `
    INSERT INTO traces (Timestamp, TraceId, SpanId, ParentSpanId, TraceState, SpanName, SpanKind, ServiceName, ResourceAttributes, SpanAttributes, Duration, StatusCode, StatusMessage, Events_Timestamp, Events_Name, Events_Attributes, Links_TraceId, Links_SpanId, Links_TraceState, Links_Attributes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  );
  const insertMany = db.transaction((traces: any[]) => {
    for (const trace of traces) {
      insert.run(
        trace.Timestamp,
        trace.TraceId,
        trace.SpanId,
        trace.ParentSpanId,
        trace.TraceState,
        trace.SpanName,
        trace.SpanKind,
        trace.ServiceName,
        typeof trace.ResourceAttributes === "object"
          ? JSON.stringify(trace.ResourceAttributes)
          : trace.ResourceAttributes,
        typeof trace.SpanAttributes === "object"
          ? JSON.stringify(trace.SpanAttributes)
          : trace.SpanAttributes,
        trace.Duration,
        trace.StatusCode,
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
      Timestamp AS ts,
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
  `;

  const rows = db.prepare(sql).all();

  return rows;
};
