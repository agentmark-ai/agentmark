/**
 * Alert schemas for the public /v1/alerts/* surface.
 *
 * Alerts are threshold-based monitors evaluated by a scheduled job in the
 * gateway. The API surface here is the CRUD + history-list contract that an
 * LLM agent or the dashboard uses to provision and inspect alerts. The
 * agent provisioning use case is the design target — error messages and
 * field names are tuned so an agent can self-correct from a 400.
 *
 * Field-coupling rule (metric=evaluation_score requires evaluation_*
 * fields) is enforced here via `superRefine` so the gateway returns 400
 * with a `field` extra before any DB call. The SQL CHECK constraint in
 * `50-alerts.sql` stays as defense-in-depth but should never fire on the
 * happy path.
 */

import { z } from "zod";
import {
  PaginationParamsSchema,
  itemResponse,
  listResponse,
  stripNullBytes,
} from "./common";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ALERT_METRIC_VALUES = [
  "error_rate",
  "latency",
  "cost",
  "evaluation_score",
] as const;
export type AlertMetric = (typeof ALERT_METRIC_VALUES)[number];

export const ALERT_STATUS_VALUES = ["triggered", "resolved"] as const;
export type AlertStatus = (typeof ALERT_STATUS_VALUES)[number];

export const EVALUATION_AGGREGATION_VALUES = ["avg", "individual"] as const;
export type EvaluationAggregation = (typeof EVALUATION_AGGREGATION_VALUES)[number];

export const EVALUATION_DIRECTION_VALUES = ["above", "below"] as const;
export type EvaluationDirection = (typeof EVALUATION_DIRECTION_VALUES)[number];

// ---------------------------------------------------------------------------
// Time window limits (minutes)
//
// Matches the dashboard Yup schema's bounds today (5–100 minutes). Keep
// the same bounds so agent-provisioned alerts and dashboard-provisioned
// alerts behave identically.
// ---------------------------------------------------------------------------
export const ALERT_TIME_WINDOW_MIN = 5;
export const ALERT_TIME_WINDOW_MAX = 100;

// ---------------------------------------------------------------------------
// Per-metric threshold validators
//
// Each metric carries its own range constraint. The dashboard's Yup
// schema does this with a `.when("metric", ...)` switch; Zod does the
// same via superRefine below since `discriminatedUnion` would force the
// threshold field into the discriminator, which is awkward for clients.
// ---------------------------------------------------------------------------

function validateThresholdForMetric(
  metric: AlertMetric,
  threshold: number,
): { ok: true } | { ok: false; message: string } {
  if (metric === "error_rate") {
    if (threshold < 0 || threshold > 100) {
      return { ok: false, message: "error_rate threshold must be between 0 and 100" };
    }
  } else if (metric === "latency") {
    if (!Number.isInteger(threshold) || threshold <= 0) {
      return { ok: false, message: "latency threshold must be a positive integer (milliseconds)" };
    }
  } else if (metric === "cost") {
    if (threshold <= 0) {
      return { ok: false, message: "cost threshold must be positive (dollars)" };
    }
  } else if (metric === "evaluation_score") {
    if (threshold < 0 || threshold > 1) {
      return { ok: false, message: "evaluation_score threshold must be between 0 and 1" };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Request: Create
// ---------------------------------------------------------------------------

const CreateAlertBodyBase = z.object({
  name: z.preprocess(stripNullBytes, z.string().min(1).max(100)),
  metric: z.enum(ALERT_METRIC_VALUES),
  threshold: z.number().finite(),
  time_window: z
    .number()
    .int()
    .min(ALERT_TIME_WINDOW_MIN)
    .max(ALERT_TIME_WINDOW_MAX),
  use_slack: z.boolean().default(false),
  use_webhook: z.boolean().default(false),

  // Feature 054 (FR-074): environment scope. NULL/omitted = app-wide; a real
  // UUID restricts evaluation to traces tagged with that environment_id.
  // The gateway/dashboard pass NULL through to the DB to mean "all envs".
  environment_id: z.string().uuid().nullable().optional(),

  // Only valid when metric === "evaluation_score". The superRefine below
  // enforces the field-coupling rule so agents see "field: evaluation_name"
  // instead of a Postgres CHECK constraint name.
  evaluation_name: z.preprocess(stripNullBytes, z.string().min(1).max(255)).optional(),
  evaluation_aggregation: z.enum(EVALUATION_AGGREGATION_VALUES).optional(),
  evaluation_threshold_direction: z.enum(EVALUATION_DIRECTION_VALUES).optional(),
});

export const CreateAlertBodySchema = CreateAlertBodyBase.superRefine((val, ctx) => {
  const thresholdCheck = validateThresholdForMetric(val.metric, val.threshold);
  if (!thresholdCheck.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: thresholdCheck.message,
      path: ["threshold"],
    });
  }

  if (val.metric === "evaluation_score") {
    if (!val.evaluation_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "evaluation_name is required when metric is evaluation_score",
        path: ["evaluation_name"],
      });
    }
    if (!val.evaluation_aggregation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "evaluation_aggregation is required when metric is evaluation_score",
        path: ["evaluation_aggregation"],
      });
    }
    if (!val.evaluation_threshold_direction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "evaluation_threshold_direction is required when metric is evaluation_score",
        path: ["evaluation_threshold_direction"],
      });
    }
  } else {
    if (val.evaluation_name !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "evaluation_name is only valid when metric is evaluation_score",
        path: ["evaluation_name"],
      });
    }
    if (val.evaluation_aggregation !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "evaluation_aggregation is only valid when metric is evaluation_score",
        path: ["evaluation_aggregation"],
      });
    }
    if (val.evaluation_threshold_direction !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "evaluation_threshold_direction is only valid when metric is evaluation_score",
        path: ["evaluation_threshold_direction"],
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Request: Update
//
// Update is a full re-validation against the same coupling rules — we
// require the caller to send the resulting state, not a partial. This
// keeps the agent's mental model simple: read the alert, mutate the
// fields, send back the whole object. Matches the dashboard dialog,
// which already does a full edit submit.
// ---------------------------------------------------------------------------

export const UpdateAlertBodySchema = CreateAlertBodySchema;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

export const AlertsListParamsSchema = PaginationParamsSchema.extend({
  status: z.enum(ALERT_STATUS_VALUES).optional(),
  metric: z.enum(ALERT_METRIC_VALUES).optional(),
  /** Feature 057 (FR-007): filter to a specific environment. */
  environment_id: z.string().uuid().optional(),
});

export const AlertHistoryListParamsSchema = PaginationParamsSchema;

// ---------------------------------------------------------------------------
// Response object schemas
// ---------------------------------------------------------------------------

export const AlertSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  app_id: z.string().uuid(),
  environment_id: z.string().uuid().nullable(),
  name: z.string(),
  metric: z.enum(ALERT_METRIC_VALUES),
  threshold: z.number(),
  time_window: z.number().int(),
  status: z.enum(ALERT_STATUS_VALUES),
  use_slack: z.boolean(),
  use_webhook: z.boolean(),

  evaluation_name: z.string().nullable(),
  evaluation_aggregation: z.enum(EVALUATION_AGGREGATION_VALUES).nullable(),
  evaluation_threshold_direction: z.enum(EVALUATION_DIRECTION_VALUES).nullable(),

  commit_sha: z.string().nullable(),
  created_at: z.string().datetime().nullable(),
  created_by: z.string().nullable(),
  updated_at: z.string().datetime().nullable(),
  updated_by: z.string().nullable(),
});

export const AlertHistorySchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  app_id: z.string().uuid(),
  alert_id: z.string().uuid(),
  alert_name: z.string(),
  alert_metric: z.enum(ALERT_METRIC_VALUES),
  triggered_value: z.string(),
  status: z.enum(ALERT_STATUS_VALUES),
  evaluation_name: z.string().nullable(),
  evaluation_aggregation: z.enum(EVALUATION_AGGREGATION_VALUES).nullable(),
  evaluation_threshold_direction: z.enum(EVALUATION_DIRECTION_VALUES).nullable(),
  commit_sha: z.string().nullable(),
  created_at: z.string().datetime().nullable(),
});

// ---------------------------------------------------------------------------
// Slack channel listing (proxies Slack's conversations.list)
//
// Returned shape mirrors Slack's response but only the fields the
// dashboard / agent need to pick a channel. We deliberately drop fields
// like `is_private`, `topic`, `purpose`, member counts — they can be
// added if a real consumer asks. Less surface = fewer agent mistakes.
// ---------------------------------------------------------------------------

export const SlackChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_archived: z.boolean(),
});

// ---------------------------------------------------------------------------
// Response envelopes
// ---------------------------------------------------------------------------

export const AlertListResponseSchema = listResponse(AlertSchema);
export const AlertDetailResponseSchema = itemResponse(AlertSchema);
export const AlertHistoryListResponseSchema = listResponse(AlertHistorySchema);
export const SlackChannelsListResponseSchema = itemResponse(z.array(SlackChannelSchema));

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type CreateAlertBody = z.infer<typeof CreateAlertBodySchema>;
export type UpdateAlertBody = z.infer<typeof UpdateAlertBodySchema>;
export type Alert = z.infer<typeof AlertSchema>;
export type AlertHistory = z.infer<typeof AlertHistorySchema>;
export type SlackChannel = z.infer<typeof SlackChannelSchema>;
export type AlertsListParams = z.infer<typeof AlertsListParamsSchema>;
