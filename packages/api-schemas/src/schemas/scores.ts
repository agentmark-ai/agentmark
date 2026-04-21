import { z } from "zod";
import { SCORE_RESOURCE_TYPES, SCORE_SOURCE_TYPES } from "./constants";
import {
  PaginationParamsSchema,
  DateRangeParamsSchema,
  itemResponse,
  listResponse,
} from "./common";
import { noLoneSurrogates, reasonableChDate } from "../validators";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

// String fields below flow into ClickHouse UTF-8 columns. `noLoneSurrogates`
// rejects JS strings with unpaired UTF-16 surrogates that would stall the
// CH driver mid-insert (see validators.ts).
export const CreateScoreBodySchema = z.object({
  resource_id: z.string().min(1).refine(...noLoneSurrogates),
  name: z.string().min(1).refine(...noLoneSurrogates),
  score: z.number().finite(),
  label: z.string().refine(...noLoneSurrogates).optional(),
  reason: z.string().refine(...noLoneSurrogates).optional(),
  source: z.enum(SCORE_SOURCE_TYPES).optional().default("eval"),
});

export const MAX_SCORES_BATCH_SIZE = 1000;

export const CreateScoresBatchItemSchema = CreateScoreBodySchema.extend({
  client_id: z.string().max(128).optional(),
});

export const CreateScoresBatchBodySchema = z.object({
  scores: z
    .array(CreateScoresBatchItemSchema)
    .min(1, "scores must contain at least one item")
    .max(MAX_SCORES_BATCH_SIZE, `scores exceeds max batch size of ${MAX_SCORES_BATCH_SIZE}`),
});

// Date fields below are forwarded to ClickHouse DateTime64 comparisons.
// `reasonableChDate` rejects far-future / far-past dates that overflow CH's
// internal representation and stall queries (see validators.ts).
// String fields get `noLoneSurrogates` for the same reason as the body fields
// above — they appear in WHERE clauses as UTF-8.
export const ScoresListParamsSchema = PaginationParamsSchema
  .merge(DateRangeParamsSchema)
  .extend({
    // Pre-migration contract: YYYY-MM-DD date strings (format: date).
    // Overrides the shared DateRangeParamsSchema's plain-string typing.
    start_date: z.string().date().refine(...reasonableChDate).optional(),
    end_date: z.string().date().refine(...reasonableChDate).optional(),
    resource_id: z.string().refine(...noLoneSurrogates).optional(),
    resource_type: z.enum(SCORE_RESOURCE_TYPES).optional(),
    name: z.string().refine(...noLoneSurrogates).optional(),
    source: z.enum(SCORE_SOURCE_TYPES).optional(),
  });

export const ScoreAggregationsParamsSchema = z.object({
  start_date: z.string().date().refine(...reasonableChDate).optional(),
  end_date: z.string().date().refine(...reasonableChDate).optional(),
});

// ---------------------------------------------------------------------------
// Response schemas (snake_case, matching actual API responses)
// ---------------------------------------------------------------------------

export const ScoreResponseSchema = z.object({
  id: z.string().uuid(),
  resource_id: z.string(),
  name: z.string(),
  score: z.number(),
  label: z.string(),
  reason: z.string(),
  source: z.string(),
  user_id: z.string().optional(),
  created_at: z.string().datetime(),
});

export const ScoresListResponseSchema = listResponse(ScoreResponseSchema);

export const ScoreAggregationSchema = z.object({
  name: z.string(),
  avg_score: z.number(),
  count: z.number().int().nonnegative(),
  min_score: z.number(),
  max_score: z.number(),
});

export const ScoreAggregationsResponseSchema = itemResponse(z.array(ScoreAggregationSchema));

export const ScoreDetailResponseSchema = itemResponse(ScoreResponseSchema);

export const ScoreNamesResponseSchema = itemResponse(z.array(z.string()));

export const CreateScoresBatchResultItemSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    client_id: z.string().optional(),
    id: z.string().uuid(),
  }),
  z.object({
    status: z.literal("error"),
    client_id: z.string().optional(),
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  }),
]);

export const CreateScoresBatchResponseSchema = itemResponse(
  z.object({
    results: z.array(CreateScoresBatchResultItemSchema),
    summary: z.object({
      total: z.number().int().nonnegative(),
      succeeded: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    }),
  }),
);

export type CreateScoreBody = z.infer<typeof CreateScoreBodySchema>;
export type CreateScoresBatchBody = z.infer<typeof CreateScoresBatchBodySchema>;
export type CreateScoresBatchResultItem = z.infer<typeof CreateScoresBatchResultItemSchema>;
export type CreateScoresBatchResponse = z.infer<typeof CreateScoresBatchResponseSchema>;
export type ScoresListParams = z.infer<typeof ScoresListParamsSchema>;
export type ScoreResponse = z.infer<typeof ScoreResponseSchema>;
export type ScoresListResponse = z.infer<typeof ScoresListResponseSchema>;
export type ScoreAggregation = z.infer<typeof ScoreAggregationSchema>;
export type ScoreAggregationsResponse = z.infer<typeof ScoreAggregationsResponseSchema>;
export type ScoreDetailResponse = z.infer<typeof ScoreDetailResponseSchema>;
export type ScoreNamesResponse = z.infer<typeof ScoreNamesResponseSchema>;
