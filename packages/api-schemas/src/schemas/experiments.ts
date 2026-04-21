import { z } from "zod";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

// Note: when PR #2103 (input-validation helpers) lands, the date/string
// fields below should adopt its `reasonableChDate` and `noLoneSurrogates`
// refines for consistency with scores endpoints.
export const ExperimentsListParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  prompt_name: z.string().optional(),
  dataset_path: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

export const ExperimentItemScoreSchema = z.object({
  name: z.string(),
  score: z.number(),
  label: z.string(),
  reason: z.string(),
});

export const ExperimentSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  datasetPath: z.string(),
  promptName: z.string(),
  start: z.string().optional(),
  end: z.string().optional(),
  itemCount: z.number(),
  avgLatencyMs: z.number(),
  totalCost: z.number(),
  totalTokens: z.number().optional(),
  avgScore: z.number().nullable(),
  commitSha: z.string().optional(),
  createdAt: z.string().optional(),
});

export const ExperimentItemSummarySchema = z.object({
  traceId: z.string(),
  itemName: z.string(),
  expectedOutput: z.string(),
  input: z.string(),
  output: z.string(),
  latencyMs: z.number(),
  cost: z.number(),
  tokens: z.number(),
  model: z.string(),
  scores: z.array(ExperimentItemScoreSchema),
});

export const ExperimentDetailSchema = ExperimentSummarySchema.extend({
  items: z.array(ExperimentItemSummarySchema),
});

// Listing response envelope — matches the `{ data, pagination }` wire
// format served by the OSS local dev server
// (apps/agentmark/packages/cli/cli-src/api-server.ts) and enforced by
// the gateway's envelope-coverage smoke test. The underlying analytics
// service can surface filter-option hints (distinct prompt names,
// dataset paths), but those are dashboard-internal — not on the public
// /v1/* wire.
export const ExperimentsListResponseSchema = z.object({
  data: z.array(ExperimentSummarySchema),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  }),
});

// Detail response envelope — matches `{ data: ExperimentDetail }`.
export const ExperimentDetailResponseSchema = z.object({
  data: ExperimentDetailSchema,
});

// ---------------------------------------------------------------------------
// Inferred types (for callers who want TS types rather than Zod schemas).
// ---------------------------------------------------------------------------

export type ExperimentsListParams = z.infer<typeof ExperimentsListParamsSchema>;
export type ExperimentsListResponse = z.infer<typeof ExperimentsListResponseSchema>;
export type ExperimentDetailResponse = z.infer<typeof ExperimentDetailResponseSchema>;
