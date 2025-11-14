import { TraceData } from "@agentmark/ui-components";
import { API_URL } from "../../config/api";

export interface Session {
  id: string;
  name: string | null;
  start: number;
  end: number | null;
  tenant_id: string | null;
  app_id: string | null;
}

// Re-export SessionData from ui-components for type compatibility
export type { SessionData } from "@agentmark/ui-components";

export const getSessions = async (): Promise<Session[]> => {
  try {
    const response = await fetch(`${API_URL}/v1/sessions`);
    const data = await response.json();
    return data.sessions as Session[];
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return [];
  }
};

export const getTracesBySessionId = async (
  sessionId: string
): Promise<TraceData[]> => {
  try {
    const response = await fetch(
      `${API_URL}/v1/sessions/${sessionId}/traces`
    );
    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch traces: ${response.statusText}`);
    }
    const data = await response.json();
    return data.traces as TraceData[];
  } catch (error) {
    console.error("Error fetching traces for session:", error);
    return [];
  }
};

