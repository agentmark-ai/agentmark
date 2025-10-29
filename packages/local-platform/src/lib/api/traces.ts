import { Trace, TraceData } from "@agentmark/ui-components";
import { FILE_SERVER_URL } from "../../config/api";

export const getTraces = async (): Promise<Trace[]> => {
  try {
    const response = await fetch(`${FILE_SERVER_URL}/v1/traces`);
    const data = await response.json();
    return data.traces as Trace[];
  } catch (error) {
    console.error("Error fetching traces:", error);
    return [];
  }
};

export const getTraceById = async (traceId: string): Promise<TraceData | null> => {
  try {
    const response = await fetch(`${FILE_SERVER_URL}/v1/traces/${traceId}`);
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

