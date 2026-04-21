import { z } from "zod";
import { itemResponse } from "./common";

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

// TODO: Migrate to itemResponse(z.array(DatasetSchema)) during the datasets
// REST redesign — the `{ datasets: string[] }` envelope is a known outlier
// tracked in the follow-up work. Kept as-is here to scope this PR to
// envelope helpers without a breaking contract change.
export const DatasetsListResponseSchema = z.object({
  datasets: z.array(z.string()),
});

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DatasetsListResponse = z.infer<typeof DatasetsListResponseSchema>;
export type AppendDatasetRowResponse = z.infer<typeof AppendDatasetRowResponseSchema>;
