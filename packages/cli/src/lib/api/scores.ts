import { API_URL } from "../../config/api";
import { ScoreData } from "@agentmark-ai/ui-components";

type CreateScoreBody = {
  resourceId: string;
  score: number;
  label: string;
  reason: string;
  name: string;
  type?: string;
};

export const createScore = async (
  body: CreateScoreBody
): Promise<{ id: string; message: string }> => {
  try {
    const response = await fetch(`${API_URL}/v1/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to create score: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error creating score:", error);
    throw error;
  }
};

export const getScoresByResourceId = async (
  resourceId: string
): Promise<ScoreData[]> => {
  try {
    const response = await fetch(
      `${API_URL}/v1/score?resourceId=${encodeURIComponent(resourceId)}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch scores: ${response.statusText}`);
    }

    const data = await response.json();

    // Map the API response to ScoreData format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.scores || []).map((score: any) => ({
      id: score.id,
      name: score.name,
      score: score.score,
      label: score.label,
      reason: score.reason,
      source: score.source || "eval",
      created_at: score.created_at,
    }));
  } catch (error) {
    console.error("Error fetching scores:", error);
    return [];
  }
};


