import type { Position } from 'unist';

/**
 * An Error that carries the source position of the mdast node that caused it.
 *
 * Syntax errors thrown during parsing already carry positions (they are
 * `VFileMessage`s from the unified ecosystem, with `line`, `column` and
 * `place.offset`). `TemplateDXError` gives semantic errors (unsupported tags,
 * expression evaluation failures, invalid imports/attributes) the same shape,
 * so editors and linters can map ANY templatedx error to a source range with
 * one code path:
 *
 *   line/column — 1-based, matching VFileMessage
 *   offset      — 0-based character offset into the source string
 *
 * `position` is the full mdast Position (`{start, end}`) when known, which
 * lets consumers underline the exact node rather than a single point.
 */
export class TemplateDXError extends Error {
  position?: Position;
  line?: number;
  column?: number;
  offset?: number;
  endLine?: number;
  endColumn?: number;
  endOffset?: number;

  constructor(message: string, position?: Position) {
    super(message);
    this.name = 'TemplateDXError';
    if (position) {
      this.position = position;
      this.line = position.start?.line;
      this.column = position.start?.column;
      this.offset = position.start?.offset;
      this.endLine = position.end?.line;
      this.endColumn = position.end?.column;
      this.endOffset = position.end?.offset;
    }
  }
}

/**
 * Re-throw helper: wraps `error` in a `TemplateDXError` at `position`, unless
 * it already carries a position (its own, more precise, location wins — an
 * ancestor wrapping a child's error must not clobber the child's range).
 */
export function toPositionedError(error: unknown, message: string, position?: Position): TemplateDXError {
  if (error instanceof TemplateDXError && error.position) {
    return error;
  }
  return new TemplateDXError(message, position);
}
