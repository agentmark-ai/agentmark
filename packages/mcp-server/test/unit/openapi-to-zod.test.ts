/**
 * Unit tests for openApiSchemaToZod.
 *
 * Each test exercises one schema construct that the AgentMark gateway
 * spec actually uses, and validates the resulting Zod schema against
 * a representative good/bad input — i.e. we're testing that the
 * conversion preserves the original validation semantics, not just
 * that "a function was called".
 *
 * Deliberately avoided:
 *   - Snapshot tests on the Zod schema shape — Zod's internal shape
 *     isn't a stable contract; the input → accept/reject *behavior* is.
 *   - Tests that just assert `toBeDefined()` on the result.
 */
import { describe, it, expect } from 'vitest';
import { openApiSchemaToZod } from '../../src/openapi/to-zod.js';
import type { OpenAPISpec } from '../../src/openapi/spec-loader.js';

const emptySpec: OpenAPISpec = { paths: {} };

describe('openApiSchemaToZod', () => {
  it('converts string with length bounds into a Zod string that enforces them', () => {
    const zod = openApiSchemaToZod(
      { type: 'string', minLength: 2, maxLength: 5 },
      emptySpec,
    );
    expect(zod.safeParse('hi').success).toBe(true);
    expect(zod.safeParse('a').success).toBe(false); // too short
    expect(zod.safeParse('toolong').success).toBe(false); // too long
    expect(zod.safeParse(123).success).toBe(false); // wrong type
  });

  it('converts integer with min/max into a Zod integer that enforces them', () => {
    const zod = openApiSchemaToZod(
      { type: 'integer', minimum: 1, maximum: 10 },
      emptySpec,
    );
    expect(zod.safeParse(5).success).toBe(true);
    expect(zod.safeParse(0).success).toBe(false);
    expect(zod.safeParse(11).success).toBe(false);
    expect(zod.safeParse(1.5).success).toBe(false); // not an integer
    expect(zod.safeParse('5').success).toBe(false);
  });

  it('converts enum to a Zod enum that rejects non-members', () => {
    const zod = openApiSchemaToZod(
      { type: 'string', enum: ['github', 'gitlab'] },
      emptySpec,
    );
    expect(zod.safeParse('github').success).toBe(true);
    expect(zod.safeParse('gitlab').success).toBe(true);
    expect(zod.safeParse('bitbucket').success).toBe(false);
  });

  it('converts nullable: true into a Zod schema that accepts null', () => {
    const zod = openApiSchemaToZod(
      { type: 'string', nullable: true },
      emptySpec,
    );
    expect(zod.safeParse(null).success).toBe(true);
    expect(zod.safeParse('value').success).toBe(true);
    expect(zod.safeParse(undefined).success).toBe(false);
  });

  it('converts objects with required fields, marking optionals as optional', () => {
    const zod = openApiSchemaToZod(
      {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
      },
      emptySpec,
    );
    expect(zod.safeParse({ name: 'x' }).success).toBe(true);
    expect(zod.safeParse({ name: 'x', description: 'y' }).success).toBe(true);
    expect(zod.safeParse({ description: 'y' }).success).toBe(false); // missing required name
  });

  it('converts arrays of typed items', () => {
    const zod = openApiSchemaToZod(
      { type: 'array', items: { type: 'integer' } },
      emptySpec,
    );
    expect(zod.safeParse([1, 2, 3]).success).toBe(true);
    expect(zod.safeParse([]).success).toBe(true);
    expect(zod.safeParse(['a']).success).toBe(false);
  });

  it('falls back to z.unknown() for unsupported constructs without throwing', () => {
    const zod = openApiSchemaToZod(
      { oneOf: [{ type: 'string' }, { type: 'integer' }] },
      emptySpec,
    );
    // z.unknown() accepts anything — that's the documented fallback.
    expect(zod.safeParse('x').success).toBe(true);
    expect(zod.safeParse(42).success).toBe(true);
    expect(zod.safeParse({ random: true }).success).toBe(true);
  });

  it('resolves $ref into the referenced schema', () => {
    const spec: OpenAPISpec = {
      paths: {},
      components: {
        schemas: {
          AppId: { type: 'string', minLength: 36, maxLength: 36 },
        },
      },
    };
    const zod = openApiSchemaToZod({ $ref: '#/components/schemas/AppId' }, spec);
    expect(zod.safeParse('a'.repeat(36)).success).toBe(true);
    expect(zod.safeParse('tooshort').success).toBe(false);
  });

  it('returns z.unknown() when a $ref points to a missing schema (no crash)', () => {
    const spec: OpenAPISpec = { paths: {}, components: { schemas: {} } };
    const zod = openApiSchemaToZod({ $ref: '#/components/schemas/Nope' }, spec);
    expect(zod.safeParse('anything').success).toBe(true);
  });
});
