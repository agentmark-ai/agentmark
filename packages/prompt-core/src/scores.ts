import { z } from "zod";
import type { EvalFunction } from "./types";

// ── Type Definitions ────────────────────────────────────────────────────────

export type ScoreSchema =
  | { type: "numeric"; min?: number; max?: number }
  | { type: "categorical"; categories: string[] }
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
    categories: z.array(z.string()).min(1),
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
