/**
 * Format 501 "not available" responses from the gateway / local dev server
 * as human-readable CLI output instead of raw JSON or stack traces.
 *
 * Tolerates two envelope shapes for forward compatibility with the
 * canonical error migration (gateway PR #2014 and follow-up #2017):
 *
 *   Legacy (sibling):
 *     { error: "not_available_on_cloud", message: "...", hint: "..." }
 *
 *   Canonical (nested):
 *     { error: { code: "not_available_on_cloud", message: "...", hint: "..." } }
 *
 * Both shapes may appear during the rollout window (older gateway deploys,
 * local dev server stubs, cached OpenAPI spec). Reading either shape keeps
 * the CLI friendly without pinning it to the server version.
 */

interface ShapeAgnosticBody {
  error?: string | { code?: string; message?: string; hint?: string };
  message?: string;
  hint?: string;
}

/**
 * Extract the `not_available_*` classification + human message + hint from
 * either shape, or return `null` if the body isn't recognizable.
 */
function extractNotAvailable(body: unknown): { message: string; hint?: string } | null {
  if (!body || typeof body !== 'object') return null;

  const b = body as ShapeAgnosticBody;

  // Canonical nested shape: body.error is an object with a `code` field.
  if (b.error && typeof b.error === 'object') {
    const { code, message, hint } = b.error;
    if (typeof code !== 'string' || !code.startsWith('not_available')) return null;
    return {
      message: message ?? 'This endpoint is not available on the current target.',
      hint,
    };
  }

  // Legacy flat shape: body.error is a string, message/hint are siblings.
  if (typeof b.error === 'string' && b.error.startsWith('not_available')) {
    return {
      message: b.message ?? 'This endpoint is not available on the current target.',
      hint: b.hint,
    };
  }

  return null;
}

/**
 * Detect a 501 "not available" response inside an Error's message and format
 * it for display. Returns `null` when the error isn't a recognized 501.
 *
 * specli (the OpenAPI CLI runner) typically wraps the HTTP response body
 * into `error.message`, so we extract JSON via regex before parsing.
 */
export function format501Error(error: Error): string | null {
  const msg = error.message;

  // First: try to extract and parse an embedded JSON body.
  // The regex is intentionally greedy about braces so nested objects
  // (canonical shape) still match in one shot.
  const jsonMatch = msg.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const body: unknown = JSON.parse(jsonMatch[0]);
      const extracted = extractNotAvailable(body);
      if (extracted) {
        const lines = [`\n  ${extracted.message}`];
        if (extracted.hint) lines.push(`\n  Hint: ${extracted.hint}`);
        return lines.join('');
      }
    } catch {
      // Fall through to the plain-text check below.
    }
  }

  // Fallback: no parseable JSON but the error text looks like a 501.
  // specli sometimes collapses the body — give the user a generic hint.
  if (msg.includes('501') && (msg.includes('not_available') || msg.includes('Not Implemented'))) {
    return `\n  This endpoint is not available on the current target.\n  Hint: Use --remote to target cloud, or omit it for local.`;
  }

  return null;
}
