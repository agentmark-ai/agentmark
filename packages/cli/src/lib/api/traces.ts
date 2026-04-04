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
    let url = runId
      ? `${API_URL}/v1/runs/${runId}/traces`
      : `${API_URL}/v1/traces`;

    const searchParams = new URLSearchParams();
    if (limit !== undefined) searchParams.set("limit", String(limit));
    if (offset !== undefined) searchParams.set("offset", String(offset));
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;

    const response = await fetch(url);
    const data = await response.json();
    const traces = (data.traces || []).map((t: any) => ({
      ...t,
      spanCount: t.span_count ?? t.spanCount ?? 0,
    })) as Trace[];
    return { traces, total: data.total ?? traces.length };
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
    return data.graphData as GraphData[];
  } catch (error) {
    console.error("Error fetching trace graph:", error);
    return [];
  }
};

