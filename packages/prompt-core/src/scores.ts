import { z } from "zod";
import type { EvalFunction, EvalResult } from "./types";

// ── Type Definitions ────────────────────────────────────────────────────────

export interface CategoryValue {
  label: string;
  value: number;
}

export type ScoreSchema =
  | { type: "numeric"; min?: number; max?: number }
  | { type: "categorical"; categories: CategoryValue[] }
  | { type: "boolean" };

export interface ScoreDefinition {
  schema: ScoreSchema;
  description?: string;
  eval?: EvalFunction;
}

export type ScoreRegistry = Record<string, ScoreDefinition>;

// ── Serialized shape (no functions, safe for JSON transport) ────────────────

export interface SerializedScoreConfig {
  name: string;
  schema: ScoreSchema;
  description?: string;
  hasEval: boolean;
}

// ── Zod Validation Schemas ──────────────────────────────────────────────────

export const ScoreSchemaDefinition = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("numeric"),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({
    type: z.literal("categorical"),
    categories: z.array(z.object({
      label: z.string().min(1),
      value: z.number(),
    })).min(1),
  }),
  z.object({
    type: z.literal("boolean"),
  }),
]);

export const ScoreDefinitionSchema = z.object({
  schema: ScoreSchemaDefinition,
  description: z.string().optional(),
  eval: z.any().optional(),
});

export const ScoreRegistrySchema = z.record(
  z.string(),
  ScoreDefinitionSchema
);

// ── Storage format ──────────────────────────────────────────────────────

export interface StoredScore {
  score: number;
  label: string;
  reason: string;
  dataType: "boolean" | "numeric" | "categorical";
}

/**
 * Convert an EvalResult into canonical storage format using the schema.
 *
 * Both the annotation UI and the eval runner call this so that human
 * and automated scores produce identical representations in ClickHouse.
 */
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

// ── Serialization ───────────────────────────────────────────────────────────

export function serializeScoreRegistry(
  registry: ScoreRegistry
): SerializedScoreConfig[] {
  return Object.entries(registry).map(([name, def]) => {
    const serialized: SerializedScoreConfig = {
      name,
      schema: def.schema,
      hasEval: typeof def.eval === "function",
    };
    if (def.description) {
      serialized.description = def.description;
    }
    return serialized;
  });
}
