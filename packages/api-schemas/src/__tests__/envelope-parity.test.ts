/**
 * Envelope parity test — the single strongest guard against cloud/OSS
 * divergence.
 *
 * Phase B of #2081 promises: a bad request to `npx agentmark dev`
 * returns the same body as the same bad request to `api.agentmark.co`.
 * Two entry points feed into the envelope — OSS's Zod-driven
 * `parseOrBadRequest` (→ `zodErrorToEnvelope`) and cloud's
 * Chanfana-driven `app.onError` (→ `chanfanaErrorToEnvelope`). This
 * suite asserts they emit byte-equivalent JSON for every equivalent
 * failure.
 *
 * If a future change to either helper shifts the wire format, THIS
 * TEST FAILS — you see the divergence before clients do.
 *
 * Also asserts every helper output conforms to `ErrorEnvelopeSchema`,
 * the runtime invariant clients rely on.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  structuredError,
  zodErrorToEnvelope,
  chanfanaErrorToEnvelope,
  ErrorEnvelopeSchema,
  codeForSource,
  messageForSource,
} from "../error-envelope";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Capture a ZodError from a failed safeParse against the given schema.
 * `safeParse` is the exact call OSS's `parseOrBadRequest` makes — using
 * it here ensures our test drives the helper with a real ZodError, not
 * a hand-constructed stub.
 */
function zodFailure(schema: z.ZodType, input: unknown): z.ZodError {
  const result = schema.safeParse(input);
  if (result.success) {
    throw new Error(
      "zodFailure() expected a parse failure, but the schema succeeded. Fix the test fixture.",
    );
  }
  return result.error;
}

/**
 * Turn a ZodError into the shape Chanfana's `InputValidationException`
 * emits from `buildResponse()` — one issue per flattened path, prefixed
 * by the source (`body` / `query` / `params`). This mirrors how Chanfana
 * actually wires zod issues into its exception class, so feeding the
 * result into `chanfanaErrorToEnvelope` exercises the same codepath as
 * a live request to the gateway.
 */
function zodToChanfana(
  error: z.ZodError,
  source: "body" | "query" | "params",
): { code: number; message: string; path: string[] }[] {
  return error.issues.map((issue) => ({
    code: 7001, // Chanfana's InputValidationException code
    message: issue.message,
    path: [source, ...issue.path.map(String)],
  }));
}

// ---------------------------------------------------------------------------
// Parity table
// ---------------------------------------------------------------------------

const ScoreSchema = z.object({
  resource_id: z.string().min(1),
  score: z.number(),
  name: z.string().min(1),
});

const PaginationSchema = z.object({
  limit: z.coerce.number().int().nonnegative().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const TraceIdSchema = z.object({
  traceId: z.string().regex(/^[a-f0-9]{32}$/),
});

interface Case {
  name: string;
  source: "body" | "query" | "params";
  schema: z.ZodType;
  input: unknown;
}

const CASES: Case[] = [
  {
    name: "missing required body field",
    source: "body",
    schema: ScoreSchema,
    input: { score: 0.5, name: "quality" },
  },
  {
    name: "wrong body field type",
    source: "body",
    schema: ScoreSchema,
    input: { resource_id: "r1", score: "not-a-number", name: "quality" },
  },
  {
    name: "multiple body field failures",
    source: "body",
    schema: ScoreSchema,
    input: { resource_id: "", score: "bad", name: "" },
  },
  {
    name: "invalid query param (non-numeric limit)",
    source: "query",
    schema: PaginationSchema,
    input: { limit: "abc" },
  },
  {
    name: "negative query param (offset)",
    source: "query",
    schema: PaginationSchema,
    input: { offset: "-1" },
  },
  {
    name: "invalid path param (malformed traceId)",
    source: "params",
    schema: TraceIdSchema,
    input: { traceId: "not-a-hex-string" },
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("error envelope — cloud/OSS parity", () => {
  for (const c of CASES) {
    it(`${c.source} ${c.name}: OSS and cloud helpers emit byte-identical envelopes`, () => {
      const zErr = zodFailure(c.schema, c.input);

      const ossBody = zodErrorToEnvelope(zErr, c.source);
      const cloudBody = chanfanaErrorToEnvelope(zodToChanfana(zErr, c.source));

      // The strongest possible parity check: the two helpers produce
      // the same JSON bytes for the same conceptual failure. Any future
      // code change that shifts shape or keys on one side breaks this.
      expect(JSON.stringify(cloudBody)).toBe(JSON.stringify(ossBody));
    });

    it(`${c.source} ${c.name}: envelope conforms to ErrorEnvelopeSchema`, () => {
      const zErr = zodFailure(c.schema, c.input);
      const body = zodErrorToEnvelope(zErr, c.source);

      const parsed = ErrorEnvelopeSchema.safeParse(body);
      expect(parsed.success).toBe(true);
    });

    it(`${c.source} ${c.name}: code matches the source`, () => {
      const zErr = zodFailure(c.schema, c.input);
      const body = zodErrorToEnvelope(zErr, c.source);

      expect(body.error.code).toBe(codeForSource(c.source));
      expect(body.error.message).toBe(messageForSource(c.source));
      expect(body.error.details).toBeDefined();
    });
  }
});

describe("error envelope — cross-source isolation", () => {
  it("body/query/params produce distinct codes for the same input", () => {
    const zErr = zodFailure(ScoreSchema, { score: 0.5, name: "q" });
    const bodyEnv = zodErrorToEnvelope(zErr, "body");
    const queryEnv = zodErrorToEnvelope(zErr, "query");
    const paramsEnv = zodErrorToEnvelope(zErr, "params");

    const codes = [bodyEnv.error.code, queryEnv.error.code, paramsEnv.error.code];
    expect(new Set(codes).size).toBe(3);
    expect(codes).toEqual([
      "invalid_request_body",
      "invalid_query_params",
      "invalid_path_params",
    ]);
  });
});

describe("error envelope — structuredError shape", () => {
  it("no extras → {error: {code, message}}", () => {
    const body = structuredError("not_found", "Trace not found");
    expect(body).toEqual({ error: { code: "not_found", message: "Trace not found" } });
    expect(ErrorEnvelopeSchema.safeParse(body).success).toBe(true);
  });

  it("flat extras spread at error level (cloud style)", () => {
    const body = structuredError("not_found", "msg", { jobId: "abc" });
    expect(body).toEqual({
      error: { jobId: "abc", code: "not_found", message: "msg" },
    });
    expect(ErrorEnvelopeSchema.safeParse(body).success).toBe(true);
  });

  it("details extras nest under error.details (OSS validation style)", () => {
    const body = structuredError("invalid_request_body", "Invalid request body", {
      details: { resource_id: "Required" },
    });
    expect(body).toEqual({
      error: {
        details: { resource_id: "Required" },
        code: "invalid_request_body",
        message: "Invalid request body",
      },
    });
    expect(ErrorEnvelopeSchema.safeParse(body).success).toBe(true);
  });

  it("empty extras object is elided", () => {
    const body = structuredError("internal_error", "msg", {});
    expect(body).toEqual({ error: { code: "internal_error", message: "msg" } });
  });
});

describe("error envelope — chanfanaErrorToEnvelope fallbacks", () => {
  it("missing path defaults to invalid_request_body", () => {
    const body = chanfanaErrorToEnvelope([{ message: "Invalid" }]);
    expect(body.error.code).toBe("invalid_request_body");
    // Message is the generic source message — issue-level detail
    // lives in `error.details`, never in the top-level message, to
    // keep parity with OSS's `zodErrorToEnvelope`.
    expect(body.error.message).toBe("Invalid request body");
  });

  it("non-string-array path is treated as missing", () => {
    const body = chanfanaErrorToEnvelope([
      { message: "bad", path: null as unknown as string[] },
    ]);
    expect(body.error.code).toBe("invalid_request_body");
  });

  it("unknown source string falls back to body", () => {
    const body = chanfanaErrorToEnvelope([
      { message: "bad", path: ["headers", "authorization"] },
    ]);
    expect(body.error.code).toBe("invalid_request_body");
  });

  it("empty input produces a body envelope with default message", () => {
    const body = chanfanaErrorToEnvelope([]);
    expect(body.error.code).toBe("invalid_request_body");
    expect(body.error.message).toBe("Invalid request body");
    expect(body.error.details).toBeUndefined();
  });
});
