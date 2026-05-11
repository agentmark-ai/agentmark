import type { EvalResult } from "@agentmark-ai/prompt-core";

export interface CategoryValue {
  label: string;
  value: number;
}

export type ScoreSchema =
  | { type: "numeric"; min?: number; max?: number }
  | { type: "categorical"; categories: CategoryValue[] }
  | { type: "boolean" };

export interface SerializedScoreConfig {
  name: string;
  schema: ScoreSchema;
  description?: string;
  hasEval: boolean;
}

export interface StoredScore {
  score: number;
  label: string;
  reason: string;
  dataType: "boolean" | "numeric" | "categorical";
}

export function toStoredScore(
  schema: ScoreSchema,
  result: EvalResult,
): StoredScore {
  switch (schema.type) {
    case "boolean": {
      const passed =
        result.passed ?? (result.score != null ? result.score >= 0.5 : false);
      return {
        score: passed ? 1 : 0,
        label: passed ? "PASS" : "FAIL",
        reason: result.reason ?? "",
        dataType: "boolean",
      };
    }
    case "numeric": {
      let score = result.score ?? 0;
      if (schema.min != null && score < schema.min) score = schema.min;
      if (schema.max != null && score > schema.max) score = schema.max;
      return {
        score,
        label: String(score),
        reason: result.reason ?? "",
        dataType: "numeric",
      };
    }
    case "categorical": {
      const label = result.label ?? "";
      const match = schema.categories.find((c) => c.label === label);
      return {
        score: match?.value ?? 0,
        label,
        reason: result.reason ?? "",
        dataType: "categorical",
      };
    }
  }
}
