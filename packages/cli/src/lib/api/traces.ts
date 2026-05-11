import { Trace, TraceData } from "@agentmark-ai/ui-components";
import { API_URL } from "../../config/api";

export interface GraphData {
  parentNodeId?: string;
  nodeId: string;
  spanId: string;
  nodeType: string;
  displayName: string;
  spanName: string;
}

export interface GetTracesParams {
  runId?: string;
  limit?: number;
  offset?: number;
}

export interface GetTracesResponse {
  traces: Trace[];
  total: number;
}

export const getTraces = async (params: GetTracesParams = {}): Promise<GetTracesResponse> => {
  try {
    const { runId, limit, offset } = params;

    // Use /v1/traces with dataset_run_id filter for run-scoped queries.
    // The old /v1/runs/{runId}/traces endpoint still works but is
    // deprecated.
    const searchParams = new URLSearchParams();
    if (runId !== undefined) searchParams.set("dataset_run_id", runId);
    if (limit !== undefined) searchParams.set("limit", String(limit));
    if (offset !== undefined) searchParams.set("offset", String(offset));
    const qs = searchParams.toString();
    const url = qs ? `${API_URL}/v1/traces?${qs}` : `${API_URL}/v1/traces`;

    const response = await fetch(url);
    const body = await response.json();
    // Canonical wire shape:
    //   { data: Trace[], pagination: { total, limit, offset } }
    // Tolerate the older `{ traces, total }` shape so any mock server on
    // an older fixture keeps working.
    const traces: Trace[] = Array.isArray(body.data)
      ? body.data
      : Array.isArray(body.traces)
        ? body.traces
        : [];
    const total =
      body.pagination?.total ?? body.total ?? traces.length;
    return { traces, total };
  } catch (error) {
    console.error("Error fetching traces:", error);
    return { traces: [], total: 0 };
  }
};

// Wire-side shapes returned by GET /v1/traces/:id (under `data`). The
// canonical envelope is `{ data: TraceDetailWire }` and the inner shape
// matches `TraceDetailSchema` / `toTraceDetailWire` in the cli api-server.
// We reshape this snake_case-flat wire into the camelCase-nested
// `TraceData` shape that the trace-drawer in @agentmark-ai/ui-components
// expects (`.data.latency`, `.spans[i].data.inputTokens`, etc.).
//
// The list endpoint already passes the wire through unchanged because
// the `Trace` (list) type was migrated to snake_case; the detail type
// `TraceData` was not. Until that broader refactor lands, this is the
// adaptation point — keeping it co-located with the envelope unwrap so
// future shape changes only need one edit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WireSpan = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WireTraceDetail = Record<string, any>;

// Status mapping mirrors `apps/tenant-dashboard/src/sections/traces/utils/
// status-mapping.ts:mapStatusToOtel`. ui-components' `trace-label.tsx`
// renders success vs error icons by checking `status === "0" || "1"` —
// "0" = UNSET (treated as success), "1" = OK, "2" = ERROR. Wire emits
// the canonical OTel string form ("OK"/"UNSET"/"ERROR") post wave-1's
// snake_case sweep; the dashboard already maps on its consumer side
// via `mapStatusToOtel`. The CLI must match that mapping so the same
// renderer works for both.
function mapStatusToOtel(status: unknown): string {
  switch (String(status ?? "").toUpperCase()) {
    case "OK":
    case "1":
      return "1";
    case "ERROR":
    case "2":
      return "2";
    case "UNSET":
    case "0":
    default:
      return "0";
  }
}

export function wireSpanToSpanData(s: WireSpan): {
  id: string;
  name: string;
  duration: number;
  parentId?: string;
  timestamp: number;
  traceId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
} {
  // The wire is flat snake_case at the span level, with no `data`
  // wrapper. The drawer reads everything under `.data` (camelCase), so
  // we group the per-span attribute fields here while keeping the
  // structural fields (`id`, `name`, `duration`, etc.) at the top —
  // matching the dashboard's `SpanData` shape produced by
  // `apps/tenant-dashboard/src/sections/traces/hooks/use-trace-info.ts`.
  // The dashboard mirrors `duration` at both top level AND under `.data`;
  // we do the same so renderers in @agentmark-ai/ui-components that
  // read either path work for both consumers.
  const duration = Number(s.duration_ms ?? s.duration ?? 0);
  const tokens = s.tokens ?? s.totalTokens;
  return {
    id: String(s.id ?? ""),
    name: String(s.name ?? ""),
    duration,
    parentId: s.parent_id ?? s.parentId ?? undefined,
    timestamp:
      typeof s.timestamp === "number"
        ? s.timestamp
        : Date.parse(String(s.timestamp ?? "")) || 0,
    traceId: s.trace_id ?? s.traceId ?? undefined,
    data: {
      type: s.type,
      model: s.model ?? undefined,
      inputTokens: s.input_tokens ?? s.inputTokens,
      outputTokens: s.output_tokens ?? s.outputTokens,
      totalTokens: tokens,
      // `findCostAndTokens` and `trace-label.tsx`'s chip-gating both
      // read `data.tokens` directly. Wire is canonical (`tokens` =
      // total); mirror at both keys so renderers reading either work.
      tokens,
      reasoningTokens: s.reasoning_tokens ?? s.reasoningTokens,
      cost: s.cost,
      input: s.input,
      output: s.output,
      outputObject: s.output_object ?? s.outputObject,
      toolCalls: s.tool_calls ?? s.toolCalls,
      finishReason: s.finish_reason ?? s.finishReason,
      settings: s.settings,
      sessionId: s.session_id ?? s.sessionId,
      sessionName: s.session_name ?? s.sessionName,
      userId: s.user_id ?? s.userId,
      traceName: s.trace_name ?? s.traceName,
      promptName: s.prompt_name ?? s.promptName,
      props: s.props,
      attributes: s.attributes,
      statusMessage: s.status_message ?? s.statusMessage,
      // Map to OTel numeric form ("0"/"1"/"2") — see mapStatusToOtel
      // doc above. trace-label.tsx in ui-components requires this form.
      status: mapStatusToOtel(s.status),
      spanKind: s.span_kind ?? s.spanKind,
      serviceName: s.service_name ?? s.serviceName,
      // Mirror duration at .data level too — dashboard's use-trace-info.ts
      // hook does the same. Lets renderers reading `node.data.duration`
      // work for non-root spans (the synthetic-root wrapper hand-injects
      // its own `data.latency`/`data.duration` separately).
      duration,
    },
  };
}

export function wireTraceDetailToTraceData(t: WireTraceDetail): TraceData {
  return {
    id: String(t.id ?? ""),
    name: String(t.name ?? ""),
    spans: Array.isArray(t.spans)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t.spans as WireSpan[]).map(wireSpanToSpanData) as any
      : [],
    data: {
      // The drawer reads `.data.latency` plus the trace-level summary
      // fields. Re-expose snake_case names too for components that read
      // them directly (defensive — keeps everything addressable).
      latency: t.latency_ms ?? t.latency ?? 0,
      latency_ms: t.latency_ms ?? t.latency ?? 0,
      // Map to OTel numeric form for ui-components renderers — same
      // mapping the dashboard applies in use-trace-info.ts.
      status: mapStatusToOtel(t.status),
      start: t.start,
      end: t.end,
      cost: t.cost,
      tokens: t.tokens,
      input: t.input,
      output: t.output,
      // Tags are forward-compatible: TraceDetailSchema does not surface
      // them today (only TraceResponseSchema on the list endpoint does),
      // but if the detail wire ever adds them — already true for the
      // list — passing through here means the drawer immediately
      // benefits without a second adapter change.
      ...(Array.isArray(t.tags) ? { tags: t.tags } : {}),
    },
  };
}

export const getTraceById = async (traceId: string): Promise<TraceData | null> => {
  try {
    const response = await fetch(`${API_URL}/v1/traces/${encodeURIComponent(traceId)}`);
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch trace: ${response.statusText}`);
    }
    const body = await response.json();
    // Canonical wire shape (matches `TraceDetailResponseSchema` in
    // @agentmark-ai/api-schemas and the api-server at
    // cli-src/api-server.ts):
    //   { data: TraceDetailWire }
    // Tolerate the older `{ trace: TraceData }` and a bare object for
    // safety with mock fixtures, mirroring the pattern used in
    // `getTraces` above.
    const wire = body?.data ?? body?.trace ?? body;
    if (!wire || typeof wire !== "object" || !("id" in wire)) {
      return null;
    }
    return wireTraceDetailToTraceData(wire as WireTraceDetail);
  } catch (error) {
    console.error("Error fetching trace:", error);
    return null;
  }
};

export const getTraceGraph = async (traceId: string): Promise<GraphData[]> => {
  try {
    // Graph is a projection on the trace detail endpoint. The old
    // `/v1/traces/{id}/graph` sub-resource is deprecated (Sunset
    // 2026-10-21) in favor of `?fields=graph` on the canonical detail
    // path — same data, one round trip instead of two.
    const response = await fetch(
      `${API_URL}/v1/traces/${encodeURIComponent(traceId)}?fields=graph`
    );
    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch trace graph: ${response.statusText}`);
    }
    const body = await response.json();
    const graph = body?.data?.graph;
    return Array.isArray(graph) ? (graph as GraphData[]) : [];
  } catch (error) {
    console.error("Error fetching trace graph:", error);
    return [];
  }
};

