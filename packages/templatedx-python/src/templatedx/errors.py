"""Positioned semantic errors.

Mirrors ``packages/templatedx/src/errors.ts`` — keep the two in sync.
"""

from typing import Any

# mdast position dict: {"start": {"line", "column", "offset"}, "end": {...}}.
# Positions arrive on the pre-parsed AST (serialized from the TypeScript
# parser), so they are plain dicts with the unist Position shape.
Position = dict[str, Any]


class TemplateDXError(ValueError):
    """An error that carries the source position of the mdast node that caused it.

    Syntax errors already carry positions when the document is parsed (in the
    TypeScript parser, they are ``VFileMessage``s with ``line``, ``column`` and
    ``place.offset``). ``TemplateDXError`` gives semantic errors (expression
    evaluation failures, invalid attributes) the same shape, so editors and
    linters can map ANY templatedx error to a source range with one code path:

        line/column — 1-based, matching VFileMessage
        offset      — 0-based character offset into the source string

    ``position`` is the full mdast position dict (``{"start": ..., "end": ...}``)
    when known, which lets consumers underline the exact node rather than a
    single point.

    Subclasses ``ValueError`` because the transformer previously raised
    ``ValueError`` — existing ``except ValueError`` sites keep working, the same
    way the TypeScript ``TemplateDXError extends Error`` left existing catch
    sites unaffected.
    """

    def __init__(self, message: str, position: Position | None = None) -> None:
        super().__init__(message)
        self.position = position
        start = (position or {}).get("start") or {}
        end = (position or {}).get("end") or {}
        self.line: int | None = start.get("line")
        self.column: int | None = start.get("column")
        self.offset: int | None = start.get("offset")
        self.end_line: int | None = end.get("line")
        self.end_column: int | None = end.get("column")
        self.end_offset: int | None = end.get("offset")


def to_positioned_error(
    error: object, message: str, position: Position | None = None
) -> TemplateDXError:
    """Wrap ``error`` in a ``TemplateDXError`` at ``position``, unless it already
    carries a position (its own, more precise, location wins — an ancestor
    wrapping a child's error must not clobber the child's range).
    """
    if isinstance(error, TemplateDXError) and error.position:
        return error
    return TemplateDXError(message, position)
