import { API_URL } from "../../config/api";

export interface ExperimentSummary {
  id: string;
  name: string;
  promptName: string;
  datasetPath: string;
  itemCount: number;
  avgLatencyMs: number;
  totalCost: number;
  avgScore: number | null;
  createdAt: string;
  commitSha: string;
}

export interface ExperimentItem {
  traceId: string;
  itemName: string;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  latencyMs: number;
  cost: number;
  totalTokens: number;
  model: string;
  scores: Array<{ name: string; score: number; label: string; reason: string }>;
}

export interface ExperimentDetail {
  summary: ExperimentSummary;
  items: ExperimentItem[];
}

export const getExperiments = async (): Promise<ExperimentSummary[]> => {
  try {
    const response = await fetch(`${API_URL}/v1/experiments`);
    const data = await response.json();
    return data.experiments as ExperimentSummary[];
  } catch (error) {
    console.error("Error fetching experiments:", error);
    return [];
  }
};

export const getExperimentById = async (
  experimentId: string
): Promise<ExperimentDetail | null> => {
  try {
    const response = await fetch(`${API_URL}/v1/experiments/${experimentId}`);
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch experiment: ${response.statusText}`);
    }
    const data = await response.json();
    return data as ExperimentDetail;
  } catch (error) {
    console.error("Error fetching experiment:", error);
    return null;
  }
};
