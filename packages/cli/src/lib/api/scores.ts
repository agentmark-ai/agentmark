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
    const response = await fetch(`${API_URL}/v1/scores`, {
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
    // The /v1/scores list endpoint accepts the snake_case `resource_id`
    // query parameter (see ScoresListParamsSchema in
    // @agentmark-ai/api-schemas). Sending camelCase `resourceId` was
    // silently stripped by Zod's default object parsing and would
    // return ALL scores instead of the resource-scoped subset, leading
    // to scores from unrelated spans appearing in the trace drawer.
    const response = await fetch(
      `${API_URL}/v1/scores?resource_id=${encodeURIComponent(resourceId)}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch scores: ${response.statusText}`);
    }

    const body = await response.json();

    // Canonical wire shape (matches `ScoresListResponseSchema` in
    // @agentmark-ai/api-schemas):
    //   { data: Score[], pagination: { total, limit, offset } }
    // Tolerate the older `{ scores: [...] }` shape for safety.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawScores: any[] = Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body?.scores)
        ? body.scores
        : [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rawScores.map((score: any) => ({
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


