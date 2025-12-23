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

export const getTraces = async (runId?: string): Promise<Trace[]> => {
  try {
    const url = runId
      ? `${API_URL}/v1/runs/${runId}/traces`
      : `${API_URL}/v1/traces`;
    const response = await fetch(url);
    const data = await response.json();
    return data.traces as Trace[];
  } catch (error) {
    console.error("Error fetching traces:", error);
    return [];
  }
};

export const getTraceById = async (traceId: string): Promise<TraceData | null> => {
  try {
    const response = await fetch(`${API_URL}/v1/traces/${traceId}`);
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
    const response = await fetch(`${API_URL}/v1/traces/${traceId}/graph`);
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

