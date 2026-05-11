/**
 * Canonical error envelope — the single source of truth for the shape of
 * every 4xx/5xx response body emitted by the AgentMark public API, across
 * both the cloud gateway (`apps/gateway`) and the OSS CLI dev server
 * (`oss/agentmark/packages/cli`).
 *
 * Runtime shape:
 *   { error: { code: string, message: string, details?: Record<string, string> } }
 *
 * Why this lives in the shared api-contract package:
 *   Phase B of #2081 wants agents written against `npx agentmark dev`
 *   (local dev) to receive the exact same error body they'd see from
 *   `api.agentmark.co` (cloud). Before Phase B the two diverged — cloud
 *   emitted `chanfana_<num>` codes with no `details`, OSS emitted
 *   semantic codes with `details`. Moving the emitter here means both
 *   sides call the same function and divergence becomes impossible by
 *   construction. The OSS side vendors this file (subtree boundary
 *   prevents workspace deps) and a byte-identical drift test enforces
 *   the copy stays in sync.
 *
 * Extending this:
 *   - Add a new code to `ErrorCode` (or to each side's superset) BEFORE
 *     emitting it — the compile-time constraint prevents string-code
 *     drift (`trace_not_found` vs `not_found_trace` etc.)
 *   - Never inline `{ error: { ... } }` in a handler; always go through
 *     `structuredError()`, `zodErrorToEnvelope()`, or
 *     `chanfanaErrorToEnvelope()`.
 */

import { z, ZodError } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Error codes emitted by any AgentMark API surface. Each side of the
 * system (cloud / OSS) extends this with its own superset — see
 * `GatewayErrorCode` in `apps/gateway/src/openapi/routes/_shared.ts` and
 * `DevServerErrorCode` in the OSS CLI's `api-helpers.ts`.
 *
 * The shared codes here are the ones that MUST be identical across both
 * sides — primarily the validation error codes, since Phase B's promise
 * is that `npx agentmark dev` and cloud produce the same body for the
 * same bad request.
 */
export type SharedErrorCode =
  // Request validation (400)
  | "invalid_request_body"
  | "invalid_query_params"
  | "invalid_path_params"
  // Resource lookup (404) — each side may also define more specific codes
  | "not_found"
  // Generic server-side failures (500 / 503)
  | "internal_error"
  | "service_unavailable";

/**
 * The canonical error envelope body.
 *
 * `code` and `message` are always present. Any additional fields are
 * spread at the `error` level — this matches cloud's pre-existing
 * shape (`{error: {jobId, code, message}}` for things like
 * `structuredError('job_failed', msg, {jobId})`) AND accommodates
 * OSS's `details` key for zod validation failures
 * (`{error: {details: {...}, code, message}}`). A single shape covers
 * both — no per-side schema.
 *
 * `code` is typed as `string` (not `SharedErrorCode`) so each side's
 * superset of codes can be passed without casting. The compile-time
 * code-drift check happens at each side's `structuredError()` wrapper
 * via its own code union.
 */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    [extra: string]: unknown;
  };
}

/**
 * Runtime validator for the envelope. Every 4xx/5xx response body
 * emitted by either side MUST conform to this schema — it's the
 * contract clients rely on.
 *
 * Used by:
 *   - Parity tests — assert both cloud and OSS outputs conform
 *   - Integration tests — assert observed response bodies match
 *   - (Potentially) consumers parsing errors in a type-safe way
 *
 * Extra keys beyond `code` and `message` are allowed (matches cloud's
 * spread-extras style and OSS's `details` key). Validation only
 * enforces the two mandatory fields and their types.
 */
export const ErrorEnvelopeSchema = z.object({
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .loose(),
});

// ---------------------------------------------------------------------------
// Envelope builders
// ---------------------------------------------------------------------------

/**
 * Build a structured error body. This is the one true way to construct
 * `{ error: { ... } }` on either side.
 *
 * Extras are spread at the error level (e.g. `{jobId}` → `error.jobId`,
 * `{details: {...}}` → `error.details`). This matches the pre-migration
 * cloud behaviour and preserves OSS's `details`-key convention for zod
 * validation — both produce envelopes that satisfy `ErrorEnvelopeSchema`.
 *
 * The `Code` generic lets each side pin its own code union at the call
 * site while the function itself accepts any string.
 */
export function structuredError<Code extends string = SharedErrorCode>(
  code: Code,
  message: string,
  extras?: Record<string, unknown>,
): ErrorEnvelope {
  return {
    error: extras && Object.keys(extras).length > 0
      ? { ...extras, code, message }
      : { code, message },
  };
}

/** Source of a request input — determines which `invalid_*` code fires. */
export type ValidationSource = "body" | "query" | "params";

/** Map a validation source to its corresponding 400 error code. */
export function codeForSource(source: ValidationSource): SharedErrorCode {
  return source === "body"
    ? "invalid_request_body"
    : source === "query"
      ? "invalid_query_params"
      : "invalid_path_params";
}

/** Map a validation source to its human-readable 400 message. */
export function messageForSource(source: ValidationSource): string {
  return source === "body"
    ? "Invalid request body"
    : source === "query"
      ? "Invalid query parameters"
      : "Invalid path parameters";
}

/**
 * Flatten a Zod error into a `details` map suitable for the envelope.
 * Keys are dotted field paths (`"scores.0.resource_id"`) or `"_"` for
 * root-level issues. First issue per path wins — later duplicates are
 * dropped for brevity (clients usually only show the first anyway).
 */
export function zodIssuesToDetails(error: ZodError): Record<string, string> {
  const details: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    if (!(path in details)) details[path] = issue.message;
  }
  return details;
}

/**
 * Build an envelope from a Zod validation failure. Called by OSS's
 * `parseOrBadRequest` and by the cloud gateway's `app.onError` when a
 * Chanfana-raised validation error carries an underlying Zod error.
 * Emits `{error: {details: {field: msg}, code, message}}`.
 */
export function zodErrorToEnvelope(
  error: ZodError,
  source: ValidationSource,
): ErrorEnvelope {
  const details = zodIssuesToDetails(error);
  return structuredError(
    codeForSource(source),
    messageForSource(source),
    Object.keys(details).length > 0 ? { details } : undefined,
  );
}

/**
 * Shape of a single validation error as surfaced by Chanfana's
 * `InputValidationException.buildResponse()`.
 *
 * Chanfana's TypeScript declarations say `path: null` but at runtime
 * `path` is the string array that was passed to the exception
 * constructor (e.g. `["body", "email"]`). To avoid call-site casts we
 * accept `path: unknown` and validate shape inside the helper.
 */
export interface ChanfanaValidationIssue {
  code?: number;
  message: string;
  path?: unknown;
}

/** Type guard: ensure a value is an array of strings. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Build an envelope from Chanfana's `buildResponse()` output. Extracts
 * the source from `path[0]` so we can emit the same semantic code
 * (`invalid_request_body` / `invalid_query_params` / `invalid_path_params`)
 * that OSS emits for the same kind of failure. Field-level details are
 * populated from `path[1..].join(".")`.
 *
 * Fallback: if `path` is missing or unrecognised, defaults to
 * `invalid_request_body` — matches the pre-existing cloud behaviour where
 * most Chanfana errors originate from body validation.
 */
export function chanfanaErrorToEnvelope(
  issues: ChanfanaValidationIssue[],
): ErrorEnvelope {
  const [first] = issues;
  const firstPath = isStringArray(first?.path) ? first.path : [];
  const rawSource = firstPath[0];
  const source: ValidationSource =
    rawSource === "query" || rawSource === "params" ? rawSource : "body";

  const details: Record<string, string> = {};
  for (const issue of issues) {
    if (!isStringArray(issue.path) || issue.path.length < 2) continue;
    const field = issue.path.slice(1).join(".");
    if (field && !(field in details)) details[field] = issue.message;
  }

  return structuredError(
    codeForSource(source),
    messageForSource(source),
    Object.keys(details).length > 0 ? { details } : undefined,
  );
}
