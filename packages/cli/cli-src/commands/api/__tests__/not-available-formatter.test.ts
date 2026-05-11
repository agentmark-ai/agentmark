import { describe, it, expect } from 'vitest';
import { format501Error } from '../not-available-formatter';

// ---------------------------------------------------------------------------
// Tolerant-parser guarantee:
//   The CLI reads BOTH the legacy flat shape and the canonical nested shape
//   of the 501 error envelope. Failing either side strands users whose
//   CLI version and remote-API version disagree on the envelope shape.
// ---------------------------------------------------------------------------

describe('format501Error — canonical nested envelope', () => {
  it('formats `not_available_on_cloud` with hint', () => {
    const err = new Error(
      `Request failed with status code 501: ${JSON.stringify({
        error: {
          code: 'not_available_on_cloud',
          message: 'Prompts are only available locally.',
          hint: 'Run `agentmark dev` and use the local API, or omit --remote.',
        },
      })}`,
    );
    const formatted = format501Error(err);
    expect(formatted).not.toBeNull();
    expect(formatted).toContain('Prompts are only available locally.');
    expect(formatted).toContain('Hint: Run `agentmark dev` and use the local API');
  });

  it('formats `not_available_locally` with hint', () => {
    const err = new Error(
      JSON.stringify({
        error: {
          code: 'not_available_locally',
          message: 'Metrics are not available on the local dev server.',
          hint: 'Use --remote to target a hosted backend.',
        },
      }),
    );
    const formatted = format501Error(err);
    expect(formatted).toContain('Metrics are not available on the local dev server.');
    expect(formatted).toContain('Hint: Use --remote to target a hosted backend.');
  });

  it('handles canonical shape without hint', () => {
    const err = new Error(
      JSON.stringify({
        error: { code: 'not_available_on_cloud', message: 'Not available.' },
      }),
    );
    const formatted = format501Error(err);
    expect(formatted).toBe('\n  Not available.');
  });
});

describe('format501Error — legacy flat envelope (pre-migration)', () => {
  it('formats legacy `not_available_on_cloud` with hint', () => {
    const err = new Error(
      `501 Not Implemented: ${JSON.stringify({
        error: 'not_available_on_cloud',
        message: 'Prompts require the local dev server.',
        hint: 'Run `agentmark dev`.',
      })}`,
    );
    const formatted = format501Error(err);
    expect(formatted).toContain('Prompts require the local dev server.');
    expect(formatted).toContain('Hint: Run `agentmark dev`.');
  });

  it('formats legacy `not_available_locally` with hint', () => {
    const err = new Error(
      JSON.stringify({
        error: 'not_available_locally',
        message: 'Not available on the local dev server.',
        hint: 'Use --remote.',
      }),
    );
    const formatted = format501Error(err);
    expect(formatted).toContain('Not available on the local dev server.');
    expect(formatted).toContain('Hint: Use --remote.');
  });
});

describe('format501Error — fallbacks', () => {
  it('returns a generic hint when body cannot be parsed but text signals 501', () => {
    const err = new Error('HTTP 501 Not Implemented - not_available');
    const formatted = format501Error(err);
    expect(formatted).toContain('not available on the current target');
    expect(formatted).toContain('--remote');
  });

  it('returns null for unrelated errors', () => {
    expect(format501Error(new Error('Network timeout'))).toBeNull();
    expect(format501Error(new Error('{ "error": "bad_request" }'))).toBeNull();
  });

  it('returns null when the embedded JSON is not a not_available code', () => {
    const err = new Error(
      JSON.stringify({ error: { code: 'trace_not_found', message: 'x' } }),
    );
    expect(format501Error(err)).toBeNull();
  });

  it('returns null when legacy shape has a different error code', () => {
    const err = new Error(JSON.stringify({ error: 'trace_not_found', message: 'x' }));
    expect(format501Error(err)).toBeNull();
  });

  it('tolerates malformed JSON and returns null without throwing', () => {
    const err = new Error('{"error": "not_available_on_cloud", ...malformed}');
    expect(() => format501Error(err)).not.toThrow();
    // Regex may not match the malformed body; if it does, JSON.parse throws
    // and we fall through to the plain-text check, which misses "501".
    expect(format501Error(err)).toBeNull();
  });
});
