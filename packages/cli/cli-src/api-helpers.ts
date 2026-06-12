/**
 * HTTP helpers for the OSS CLI dev server.
 *
 * Shape matches the cloud gateway's canonical error envelope so that
 * agents written against `npx @agentmark-ai/cli dev` receive the same error body
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
 * `DevServerErrorCode` from `npx @agentmark-ai/cli dev` will always receive a
 * superset-compatible code from cloud for the same failure kind.
 */
/**
 * Codes the local dev server can emit. Includes the shared canonical
 * codes plus a few OSS-only ones (e.g. `not_available_locally` for
 * endpoints that only exist on the cloud target).
 */
export type DevServerErrorCode =
  | SharedErrorCode
  | 'not_available_locally'
  | 'config_not_found'
  | 'spec_unavailable'
  | 'protobuf_decode_failed'
  | 'invalid_otlp_payload';

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

/**
 * Emit a 400 with the canonical envelope. Use for non-zod request
 * failures (e.g. wrong query string, decode errors) — for zod
 * validation, prefer `parseOrBadRequest`.
 */
export function sendBadRequest(
  res: Response,
  code: DevServerErrorCode,
  message: string,
  details?: Record<string, unknown>,
): void {
  sendEnvelope(
    res,
    400,
    structuredError(code, message, details ? { details } : undefined),
  );
}

/**
 * Emit a 501 in the canonical nested envelope. Carries the `hint`
 * extra at the error level so the not-available-formatter can pick it
 * up. Used for endpoint stubs not available on the local dev server.
 */
export function sendNotImplemented(
  res: Response,
  message: string,
  hint?: string,
): void {
  const extras: Record<string, unknown> = {};
  if (hint) extras.hint = hint;
  sendEnvelope(
    res,
    501,
    structuredError(
      'not_available_locally' as DevServerErrorCode,
      message,
      Object.keys(extras).length > 0 ? extras : undefined,
    ),
  );
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
