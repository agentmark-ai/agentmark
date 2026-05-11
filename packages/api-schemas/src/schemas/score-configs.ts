import { z } from "zod";
import { PaginationParamsSchema, listResponse, itemResponse } from "./common";

// ---------------------------------------------------------------------------
// Score Configs (Tier-1, §3.2) — read-only REST surface
//
// Score configs are git-native: defined in `agentmark.json` under
// `config.scores` (object map keyed by score name) and synced to Supabase
// at `puzzlet_config.config.scores`. Per the T014 shape verification, we
// preserve the `{label, value}` category shape end-to-end (Langfuse parity)
// rather than flattening to `categorical_values: string[]` as the original
// OpenAPI sketch suggested.
// ---------------------------------------------------------------------------

const ScoreCategorySchema = z.object({
  label: z.string().min(1),
  value: z.number().finite(),
});

const ScoreConfigBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  commit_sha: z.string(),
});

export const ScoreConfigSchema = z.discriminatedUnion("data_type", [
  ScoreConfigBaseSchema.extend({
    data_type: z.literal("boolean"),
  }),
  ScoreConfigBaseSchema.extend({
    data_type: z.literal("numeric"),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  }),
  ScoreConfigBaseSchema.extend({
    data_type: z.literal("categorical"),
    categories: z.array(ScoreCategorySchema).min(1),
  }),
]);

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

// List endpoint accepts standard pagination only — score configs are
// per-app and small in cardinality, no filtering needed.
export const ScoreConfigsListParamsSchema = PaginationParamsSchema;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

export const ScoreConfigsListResponseSchema = listResponse(ScoreConfigSchema);
export const ScoreConfigResponseSchema = itemResponse(ScoreConfigSchema);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ScoreCategory = z.infer<typeof ScoreCategorySchema>;
export type ScoreConfig = z.infer<typeof ScoreConfigSchema>;
export type ScoreConfigsListParams = z.infer<typeof ScoreConfigsListParamsSchema>;
export type ScoreConfigsListResponse = z.infer<typeof ScoreConfigsListResponseSchema>;
export type ScoreConfigResponse = z.infer<typeof ScoreConfigResponseSchema>;
