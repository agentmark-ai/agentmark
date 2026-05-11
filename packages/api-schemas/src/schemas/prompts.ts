import { z } from "zod";
import { stripNullBytes, itemResponse } from "./common";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

/**
 * Query parameters for `GET /v1/prompts`.
 *
 * `name` filters the listing to prompts whose frontmatter `name` matches —
 * the trace drawer's "Test prompt" dialog uses this to map a span's
 * `promptName` (the only id carried in trace telemetry today) back to a
 * file path. Without `name`, the listing is returned unfiltered (OSS) or
 * 501'd (cloud — the full project listing is exposed via the dashboard's
 * own template browser, not the public REST API).
 *
 * Names are user-controlled frontmatter — multiple prompts can legitimately
 * share a `name` if they live in different folders (the platform's
 * `(app_id, name, parent_path, file_extension)` constraint allows it). The
 * response is therefore an array, not a single resource: zero, one, or
 * many matches.
 */
export const ListPromptsQuerySchema = z.object({
  name: z
    .preprocess(stripNullBytes, z.string().min(1).max(255))
    .optional()
    .describe(
      "Frontmatter `name` to filter by. Returns paths of all prompts whose name matches; empty array on miss."
    ),
});

export type ListPromptsQuery = z.infer<typeof ListPromptsQuerySchema>;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

/**
 * Inner body of the `GET /v1/prompts` response. Wrapped with
 * `itemResponse` to produce the canonical `{ data }` envelope.
 *
 * `paths` are the relative file paths inside the templates dir
 * (`<projectRoot>/agentmark/` by default). Callers that need a
 * project-root-relative path combine these with the prefix exposed by
 * `/v1/config`.
 */
export const ListPromptsBodySchema = z.object({
  paths: z
    .array(z.string())
    .describe("Relative paths inside the templates dir."),
});

/**
 * Wire response: `{ data: { paths: string[] } }`. Matches the gateway-wide
 * envelope convention enforced by `envelope-coverage.test.ts`.
 */
export const ListPromptsResponseSchema = itemResponse(ListPromptsBodySchema);

export type ListPromptsBody = z.infer<typeof ListPromptsBodySchema>;
export type ListPromptsResponse = z.infer<typeof ListPromptsResponseSchema>;
