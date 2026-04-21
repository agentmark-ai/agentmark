/**
 * Annotation Queue schemas for the public /v1/annotation-queues/* surface.
 *
 * Canonical competitive parity with LangFuse / Arize / LangSmith: populate a
 * queue from CI, list items, and — critically — submit reviews via API so
 * LLM-as-judge pipelines can land annotations as if they were human reviewers.
 *
 * Wire format is snake_case to match the rest of the public API. Dashboard
 * internal validation (apps/tenant-dashboard/src/lib/annotation-queues/
 * validation.ts) accepts the same field names and is the source of truth
 * for range constraints kept in sync here.
 */

import { z } from "zod";
import { itemResponse, listResponse } from "./common";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ANNOTATION_QUEUE_STATUS_VALUES = ["active", "completed", "archived"] as const;
export type AnnotationQueueStatus = (typeof ANNOTATION_QUEUE_STATUS_VALUES)[number];

export const ANNOTATION_ITEM_STATUS_VALUES = ["pending", "in_progress", "completed", "skipped"] as const;
export type AnnotationItemStatus = (typeof ANNOTATION_ITEM_STATUS_VALUES)[number];

export const ANNOTATION_RESOURCE_TYPE_VALUES = ["trace", "span", "session"] as const;
export type AnnotationResourceType = (typeof ANNOTATION_RESOURCE_TYPE_VALUES)[number];

export const ANNOTATION_REVIEWER_STATUS_VALUES = ["assigned", "completed", "skipped"] as const;
export type AnnotationReviewerStatus = (typeof ANNOTATION_REVIEWER_STATUS_VALUES)[number];

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const CreateAnnotationQueueBodySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  score_config_names: z.array(z.string()).min(1, "at least one score config is required"),
  dataset_id: z.string().uuid().optional(),
  instructions: z.string().max(5000).optional(),
  reviewers_required: z.number().int().min(1).optional(),
});

export const UpdateAnnotationQueueBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: z.enum(ANNOTATION_QUEUE_STATUS_VALUES).optional(),
  score_config_names: z.array(z.string()).nullable().optional(),
  instructions: z.string().max(5000).nullable().optional(),
  reviewers_required: z.number().int().min(1).optional(),
});

export const AddAnnotationQueueItemsBodySchema = z.object({
  items: z
    .array(
      z.object({
        resource_id: z.string().min(1),
        resource_type: z.enum(ANNOTATION_RESOURCE_TYPE_VALUES).optional().default("trace"),
      }),
    )
    .min(1, "at least one item is required"),
});

export const UpdateAnnotationQueueItemBodySchema = z.object({
  status: z.enum(ANNOTATION_ITEM_STATUS_VALUES).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

export const SubmitAnnotationQueueReviewBodySchema = z.object({
  status: z.enum(["completed", "skipped"]),
});

// ---------------------------------------------------------------------------
// Response object schemas
// ---------------------------------------------------------------------------

export const AnnotationQueueProgressSchema = z.object({
  pending: z.number().int().nonnegative(),
  in_progress: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const AnnotationQueueSchema = z.object({
  id: z.string().uuid(),
  app_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  score_config_names: z.array(z.string()).nullable(),
  dataset_id: z.string().uuid().nullable(),
  status: z.enum(ANNOTATION_QUEUE_STATUS_VALUES),
  instructions: z.string().nullable(),
  reviewers_required: z.number().int().min(1),
  created_by: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().nullable(),
});

export const AnnotationQueueListItemSchema = AnnotationQueueSchema.extend({
  progress: AnnotationQueueProgressSchema,
});

export const AnnotationQueueItemSchema = z.object({
  id: z.string().uuid(),
  queue_id: z.string().uuid(),
  resource_id: z.string(),
  resource_type: z.enum(ANNOTATION_RESOURCE_TYPE_VALUES),
  status: z.enum(ANNOTATION_ITEM_STATUS_VALUES),
  assigned_to: z.string().nullable(),
  completed_by: z.string().nullable(),
  completed_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});

export const AnnotationReviewerSchema = z.object({
  id: z.string().uuid(),
  item_id: z.string().uuid(),
  user_id: z.string(),
  status: z.enum(ANNOTATION_REVIEWER_STATUS_VALUES),
  completed_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});

export const AnnotationReviewProgressSchema = z.object({
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  required: z.number().int().min(1),
});

// ---------------------------------------------------------------------------
// Response envelopes
// ---------------------------------------------------------------------------

export const AnnotationQueueListResponseSchema = listResponse(AnnotationQueueListItemSchema);
export const AnnotationQueueDetailResponseSchema = itemResponse(AnnotationQueueSchema);
export const AnnotationQueueItemsListResponseSchema = listResponse(AnnotationQueueItemSchema);
export const AnnotationQueueItemDetailResponseSchema = itemResponse(AnnotationQueueItemSchema);

export const AddAnnotationQueueItemsResponseSchema = itemResponse(
  z.object({
    added: z.number().int().nonnegative(),
  }),
);

export const SubmitAnnotationQueueReviewResponseSchema = itemResponse(
  z.object({
    reviewer: AnnotationReviewerSchema,
    item: AnnotationQueueItemSchema,
    review_progress: AnnotationReviewProgressSchema,
  }),
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type CreateAnnotationQueueBody = z.infer<typeof CreateAnnotationQueueBodySchema>;
export type UpdateAnnotationQueueBody = z.infer<typeof UpdateAnnotationQueueBodySchema>;
export type AddAnnotationQueueItemsBody = z.infer<typeof AddAnnotationQueueItemsBodySchema>;
export type UpdateAnnotationQueueItemBody = z.infer<typeof UpdateAnnotationQueueItemBodySchema>;
export type SubmitAnnotationQueueReviewBody = z.infer<typeof SubmitAnnotationQueueReviewBodySchema>;

export type AnnotationQueue = z.infer<typeof AnnotationQueueSchema>;
export type AnnotationQueueListItem = z.infer<typeof AnnotationQueueListItemSchema>;
export type AnnotationQueueItem = z.infer<typeof AnnotationQueueItemSchema>;
export type AnnotationReviewer = z.infer<typeof AnnotationReviewerSchema>;
export type AnnotationReviewProgress = z.infer<typeof AnnotationReviewProgressSchema>;
export type AnnotationQueueProgress = z.infer<typeof AnnotationQueueProgressSchema>;
