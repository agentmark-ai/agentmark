/**
 * Convert an OpenAPI 3.x schema fragment into a Zod schema.
 *
 * Used by the MCP tool registrar to build per-tool input schemas so
 * the MCP SDK can describe the expected input to LLM agents.
 *
 * Scope: minimum needed to cover the AgentMark gateway's spec —
 * primitives, arrays, objects, enums, nullables. Conservative on
 * everything else: anything we can't translate becomes `z.unknown()`
 * with a description so the LLM still sees the parameter, just
 * without strict validation.
 *
 * What we deliberately don't translate fully:
 *   - `oneOf` / `anyOf` / `allOf` with mixed shapes → `z.unknown()`
 *     (LLM-time validation; the gateway is still the source of truth
 *     on accept/reject)
 *   - Format constraints like `uuid` / `email` / `datetime` → the
 *     base type is used; format goes into the description as a hint.
 *     This avoids spurious client-side rejections when the gateway's
 *     spec is stricter than the actual data (we hit this with the
 *     `+00:00`-vs-`Z` ISO drift in PR #2351).
 */

import { z } from 'zod';
import type { OpenAPISchema, OpenAPISpec } from './spec-loader.js';
import { resolveRef } from './spec-loader.js';

export function openApiSchemaToZod(
  schema: OpenAPISchema | undefined,
  spec: OpenAPISpec,
): z.ZodTypeAny {
  if (!schema) return z.unknown();

  // Resolve $ref before doing anything else.
  const resolved = schema.$ref ? resolveRef(spec, schema) : schema;
  if (!resolved) return z.unknown();

  let base: z.ZodTypeAny = z.unknown();

  if (resolved.enum && resolved.enum.length > 0) {
    // Enum values can be strings, numbers, or booleans. Coerce to
    // strings for the input schema so the LLM gets a clean enum.
    const stringValues = resolved.enum
      .filter((v) => typeof v === 'string')
      .map((v) => v as string);
    if (stringValues.length === resolved.enum.length && stringValues.length > 0) {
      base = z.enum(stringValues as [string, ...string[]]);
    } else {
      // Mixed enum or non-string — fall back to unknown.
      base = z.unknown();
    }
  } else {
    switch (resolved.type) {
      case 'string':
        base = z.string();
        if (typeof resolved.minLength === 'number') {
          base = (base as z.ZodString).min(resolved.minLength);
        }
        if (typeof resolved.maxLength === 'number') {
          base = (base as z.ZodString).max(resolved.maxLength);
        }
        break;
      case 'integer':
        base = z.number().int();
        if (typeof resolved.minimum === 'number') {
          base = (base as z.ZodNumber).min(resolved.minimum);
        }
        if (typeof resolved.maximum === 'number') {
          base = (base as z.ZodNumber).max(resolved.maximum);
        }
        break;
      case 'number':
        base = z.number();
        break;
      case 'boolean':
        base = z.boolean();
        break;
      case 'array':
        base = z.array(openApiSchemaToZod(resolved.items, spec));
        break;
      case 'object': {
        const shape: Record<string, z.ZodTypeAny> = {};
        const requiredKeys = new Set(resolved.required || []);
        for (const [key, propSchema] of Object.entries(resolved.properties || {})) {
          const propZod = openApiSchemaToZod(propSchema, spec);
          const described = propSchema.description
            ? propZod.describe(propSchema.description)
            : propZod;
          shape[key] = requiredKeys.has(key) ? described : described.optional();
        }
        base = z.object(shape);
        break;
      }
      default:
        // Unknown/unsupported type (oneOf/anyOf/allOf, missing type, etc.).
        base = z.unknown();
        break;
    }
  }

  if (resolved.nullable) {
    base = base.nullable();
  }

  if (resolved.description) {
    base = base.describe(resolved.description);
  }

  return base;
}
