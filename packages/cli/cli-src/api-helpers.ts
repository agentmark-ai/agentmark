/**
 * HTTP helpers for the OSS CLI dev server.
 *
 * Shape matches the cloud gateway's canonical error envelope so that
 * agents written against `npx agentmark dev` receive the same error body
 * they'd see in production. Body construction goes through the
 * `@agentmark-ai/api-schemas` package's envelope helpers — the same
 * functions the cloud gateway calls. Any divergence between cloud and
 * local dev is prevented by construction.
 */

import type { Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import {
  structuredError,
  zodErrorToEnvelope,
  type ValidationSource,
  type SharedErrorCode,
} from '@agentmark-ai/api-schemas';

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------

/**
 * Codes the OSS CLI dev server may emit. Cloud has a superset with
 * tenant-scoped codes (`trace_not_found`, `span_limit_exceeded`, etc.)
 * that don't apply locally; OSS stays minimal on purpose. All codes here
 * are a subset of cloud's `GatewayErrorCode` — an agent receiving a
 * `DevServerErrorCode` from `npx agentmark dev` will always receive a
 * superset-compatible code from cloud for the same failure kind.
 */
export type DevServerErrorCode = SharedErrorCode;

function sendEnvelope(
  res: Response,
  status: number,
  body: ReturnType<typeof structuredError>,
): void {
  res.status(status).json(body);
}

export function sendNotFound(res: Response, message = 'Not found'): void {
  sendEnvelope(res, 404, structuredError('not_found', message));
}

export function sendInternalError(res: Response, message = 'Internal server error'): void {
  sendEnvelope(res, 500, structuredError('internal_error', message));
}

export function sendServiceUnavailable(res: Response, message: string): void {
  sendEnvelope(res, 503, structuredError('service_unavailable', message));
}

// ---------------------------------------------------------------------------
// Schema-driven input parsing
// ---------------------------------------------------------------------------

/**
 * Parse `input` against `schema`. On success returns `{ ok: true, data }`.
 * On failure writes a 400 response with the canonical envelope and returns
 * `{ ok: false }` so the caller can early-return without further work.
 *
 * The `source` discriminates which error code we emit — `query` vs `body`
 * vs `params`. Keeping this explicit (rather than letting every parse
 * failure be `invalid_request_body`) means API consumers can programmatically
 * branch: "your URL path is wrong" vs "your JSON body is wrong" surface
 * as different `.error.code` values.
 *
 * Envelope body is built by the shared `zodErrorToEnvelope` — the same
 * function cloud's `app.onError` calls for Chanfana-originated zod
 * failures. Identical bytes across cloud and local dev.
 */
export function parseOrBadRequest<T extends ZodType>(
  schema: T,
  input: unknown,
  res: Response,
  source: ValidationSource,
): { ok: true; data: ReturnType<T['parse']> } | { ok: false } {
  const result = schema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data as ReturnType<T['parse']> };
  }

  sendEnvelope(res, 400, zodErrorToEnvelope(result.error as ZodError, source));
  return { ok: false };
}
