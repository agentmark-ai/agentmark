import { z } from "zod";
import { itemResponse, listResponse, PaginationParamsSchema } from "./common";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

// Keep dataset row fields open to arbitrary JSON-like payloads without using a
// recursive schema, which causes zod-to-openapi to recurse indefinitely during
// spec generation.
const JsonValueSchema = z.unknown();

export const DatasetMetadataSchema = z.record(z.string(), JsonValueSchema);

export const DatasetRowSchema = z.object({
  input: JsonValueSchema,
  expected_output: JsonValueSchema.nullable().optional(),
  metadata: DatasetMetadataSchema.optional(),
}).strict();

export const DatasetImportMappingSchema = z.object({
  input: z.string().min(1).optional(),
  expected_output: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.string().min(1)).optional(),
}).optional();

export const ImportDatasetRowsFromTracesBodySchema = z.object({
  trace_ids: z.array(z.string().min(1)).min(1).max(100),
  mapping: DatasetImportMappingSchema,
});

export const ImportDatasetRowsFromSpansBodySchema = z.object({
  span_ids: z.array(z.string().min(1)).min(1).max(100),
  mapping: DatasetImportMappingSchema,
});

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Dataset resource (canonical)
// ---------------------------------------------------------------------------

export const DatasetSchema = z.object({
  name: z.string(),
  row_count: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
});

export const DatasetsListParamsSchema = PaginationParamsSchema.extend({
  // Exact match on the dataset's leaf name (the file name without the
  // `.jsonl` extension or any folder prefix). Mirrors `/v1/prompts?name=`.
  // Substring/prefix search is intentionally not supported on the wire —
  // clients that need it filter the unfiltered list themselves.
  name: z.string().optional(),
});

export const DatasetsListResponseSchema = listResponse(DatasetSchema);

/**
 * POST /v1/datasets/:datasetName/rows response. HTTP 201 signals success;
 * the body carries the assigned `line_number` so callers can reference the
 * newly appended row.
 */
export const AppendDatasetRowResponseSchema = itemResponse(
  z.object({
    line_number: z.number().int().nonnegative(),
  }),
);

export const DatasetImportResultSchema = z.object({
  source_id: z.string(),
  status: z.enum(["created", "failed"]),
  line_number: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});

export const ImportDatasetRowsResponseSchema = itemResponse(
  z.object({
    added: z.number().int().nonnegative(),
    results: z.array(DatasetImportResultSchema),
  }),
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DatasetRow = z.infer<typeof DatasetRowSchema>;
export type DatasetImportMapping = z.infer<typeof DatasetImportMappingSchema>;
export type Dataset = z.infer<typeof DatasetSchema>;
export type DatasetsListParams = z.infer<typeof DatasetsListParamsSchema>;
export type DatasetsListResponse = z.infer<typeof DatasetsListResponseSchema>;
export type AppendDatasetRowResponse = z.infer<typeof AppendDatasetRowResponseSchema>;
export type ImportDatasetRowsFromTracesBody = z.infer<typeof ImportDatasetRowsFromTracesBodySchema>;
export type ImportDatasetRowsFromSpansBody = z.infer<typeof ImportDatasetRowsFromSpansBodySchema>;
export type ImportDatasetRowsResponse = z.infer<typeof ImportDatasetRowsResponseSchema>;
