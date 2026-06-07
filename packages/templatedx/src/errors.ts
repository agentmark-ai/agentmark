import type { Position } from 'unist';

/**
 * An Error that carries the source position of the mdast node that caused it.
 *
 * Syntax errors thrown during parsing already carry positions (they are
 * `VFileMessage`s from the unified ecosystem, with `line`, `column` and
 * `place.offset`) — except the unclosed-tag-at-EOF family, which
 * `recoverParseErrorPosition` repairs at the parse boundary.
 * `TemplateDXError` gives semantic errors (unsupported tags,
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

/** First `(line:column[-line:column])` range in a message — the unist
 * `stringifyPosition` convention used by the mdx parser's error messages. */
const POSITION_IN_MESSAGE = /\((\d+):(\d+)(?:-(\d+):(\d+))?\)/;

/** Convert a 1-based (line, column) into a 0-based char offset into `source`. */
function lineColToOffset(source: string, line: number, column: number): number | undefined {
  if (line < 1 || column < 1) return undefined;
  let offset = 0;
  for (let currentLine = 1; currentLine < line; currentLine++) {
    const nl = source.indexOf('\n', offset);
    if (nl === -1) return undefined;
    offset = nl + 1;
  }
  const result = offset + column - 1;
  return result <= source.length ? result : undefined;
}

/**
 * Repair a parse error that carries its position in the message text only.
 *
 * `mdast-util-mdx-jsx` raises "Expected a closing tag for `<X>` (L:C-L:C)"
 * when the document ends while a flow-level JSX tag is still open — and in
 * exactly that branch (`onErrorRightIsTag` with no closing construct token,
 * still present in 3.2.0/main) it constructs the `VFileMessage` with
 * `position: undefined`, serializing the opening tag's range into the
 * message string only. Consumers mapping errors to source ranges then fall
 * back to the top of the document — the opposite end of the file from the
 * unclosed tag. (The official MDX language server has the same symptom: it
 * anchors this error at line 0. There is no structural channel to the
 * position — the compile context holding the tag stack dies with the throw,
 * and the error fires after every extension hook.)
 *
 * Recovery is scoped STRUCTURALLY before any prose is read: it only engages
 * for the one error family known to ship without a position, identified by
 * the `VFileMessage` origin fields (`source`/`ruleId`) the error does carry.
 * The range itself must come from the message — upstream puts it nowhere
 * else — using the unist `stringifyPosition` convention `(L:C[-L:C])`,
 * unchanged upstream since 2022. The recovered range fills the error's
 * `place`/`line`/`column` (the fields the parser should have set), including
 * 0-based offsets computed against `sourceText`. Errors that already carry
 * any structured position are returned untouched — a parser-reported
 * location always wins over one recovered from prose.
 */
export function recoverParseErrorPosition(error: unknown, sourceText: string): unknown {
  const err = error as {
    message?: unknown;
    line?: unknown;
    column?: unknown;
    place?: unknown;
    source?: unknown;
    ruleId?: unknown;
  } | null;
  if (!err || typeof err.message !== 'string') return error;
  if (err.place != null || typeof err.line === 'number') return error;
  if (err.source !== 'mdast-util-mdx-jsx' || err.ruleId !== 'end-tag-mismatch') {
    return error;
  }

  const match = POSITION_IN_MESSAGE.exec(err.message);
  if (!match) return error;

  const startLine = Number(match[1]);
  const startColumn = Number(match[2]);
  const endLine = match[3] ? Number(match[3]) : startLine;
  const endColumn = match[4] ? Number(match[4]) : startColumn;
  const startOffset = lineColToOffset(sourceText, startLine, startColumn);
  const endOffset = lineColToOffset(sourceText, endLine, endColumn);

  const repaired = err as { line?: number; column?: number; place?: unknown };
  repaired.line = startLine;
  repaired.column = startColumn;
  repaired.place = {
    start: {
      line: startLine,
      column: startColumn,
      ...(startOffset !== undefined ? { offset: startOffset } : {}),
    },
    end: {
      line: endLine,
      column: endColumn,
      ...(endOffset !== undefined ? { offset: endOffset } : {}),
    },
  };
  return error;
}
