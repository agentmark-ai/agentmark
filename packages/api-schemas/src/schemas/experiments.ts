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

// Baseline-scores lookup: the prior run a candidate run is compared against for
// the regression gate. Resolved by `experiment_key` (the stable, composition-
// agnostic identity of the evaluation — prompt/workflow/agent) preferring the
// run at the exact `tree_hash` (the base code state), else the most recent
// prior run of that key. `dataset_path` is a soft signal only — row matching is
// inputHash-based, so it does not scope resolution.
export const ExperimentBaselineParamsSchema = z.object({
  experiment_key: z.string().min(1),
  tree_hash: z.string().min(1),
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
  // Placeholder states for a dispatched run whose spans have not landed in
  // analytics storage yet — no items/stats, not navigable. `running` = still
  // inside the expected ingestion window; `stalled` = no data after the
  // window (telemetry likely not configured), rendered as a dismissible
  // warning rather than an active run.
  status: z.enum(["running", "stalled"]).optional(),
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

// One baseline (row × scorer) score. `inputHash` is `hashRowInput` of the
// row's dataset input — the join key a live run uses to find its baseline.
export const BaselineScoreRowSchema = z.object({
  inputHash: z.string(),
  scorer: z.string(),
  score: z.number(),
});

// Which baseline run was resolved, echoed back so the CLI never gates silently.
// `matchedExactCommit: false` means no run existed at the requested tree hash
// and the endpoint fell back to the most recent prior run of the experiment_key.
export const BaselineResolvedSchema = z.object({
  runId: z.string(),
  treeHash: z.string(),
  matchedExactCommit: z.boolean(),
});

// Baseline response envelope — `{ data: { resolved, rows } }`. `resolved` is
// null when no baseline run exists at all (gate degrades to absolute pass/fail).
export const ExperimentBaselineResponseSchema = z.object({
  data: z.object({
    resolved: BaselineResolvedSchema.nullable(),
    rows: z.array(BaselineScoreRowSchema),
  }),
});

// ---------------------------------------------------------------------------
// Inferred types (for callers who want TS types rather than Zod schemas).
// ---------------------------------------------------------------------------

// Core experiment types — canonical TypeScript shapes inferred from the Zod
// schemas above. Other workspace packages (api-types, ui-components) re-export
// these names for backward compatibility; this module is the source of truth.
export type ExperimentItemScore = z.infer<typeof ExperimentItemScoreSchema>;
export type ExperimentSummary = z.infer<typeof ExperimentSummarySchema>;
export type ExperimentItemSummary = z.infer<typeof ExperimentItemSummarySchema>;
export type ExperimentDetail = z.infer<typeof ExperimentDetailSchema>;

export type ExperimentsListParams = z.infer<typeof ExperimentsListParamsSchema>;
export type ExperimentsListResponse = z.infer<typeof ExperimentsListResponseSchema>;
export type ExperimentDetailResponse = z.infer<typeof ExperimentDetailResponseSchema>;
export type ExperimentBaselineParams = z.infer<typeof ExperimentBaselineParamsSchema>;
export type BaselineScoreRow = z.infer<typeof BaselineScoreRowSchema>;
export type BaselineResolved = z.infer<typeof BaselineResolvedSchema>;
export type ExperimentBaselineResponse = z.infer<typeof ExperimentBaselineResponseSchema>;
