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

export const getTraceById = async (traceId: string): Promise<TraceData | null> => {
  try {
    const response = await fetch(`${API_URL}/v1/traces/${encodeURIComponent(traceId)}`);
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch trace: ${response.statusText}`);
    }
    const data = await response.json();
    return data.trace as TraceData;
  } catch (error) {
    console.error("Error fetching trace:", error);
    return null;
  }
};

export const getTraceGraph = async (traceId: string): Promise<GraphData[]> => {
  try {
    const response = await fetch(`${API_URL}/v1/traces/${encodeURIComponent(traceId)}/graph`);
    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch trace graph: ${response.statusText}`);
    }
    const data = await response.json();
    return data.data as GraphData[];
  } catch (error) {
    console.error("Error fetching trace graph:", error);
    return [];
  }
};

