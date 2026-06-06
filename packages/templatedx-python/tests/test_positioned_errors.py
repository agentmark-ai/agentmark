"""Tests for positioned semantic errors (TemplateDXError).

Mirrors ``packages/templatedx/src/test/positioned-errors/positionedErrors.test.ts``.
The TypeScript tests parse real source strings; this package consumes pre-parsed
ASTs, so each fixture embeds the position the TS parser would have produced for
the cited source string — the assertions use the same numbers as the TS tests.
"""

import pytest

from templatedx import MDX_JSX_ATTRIBUTE_TYPES, NODE_TYPES, TemplateDXError, transform_tree
from templatedx.errors import to_positioned_error

# `{bogusFilter(props.name)}` in 'Line one.\n\nHello {bogusFilter(props.name)}!\n'
# — starts at line 3, column 7 (1-based), offset 17 (0-based), 25 chars wide.
EXPRESSION_POSITION = {
    "start": {"line": 3, "column": 7, "offset": 17},
    "end": {"line": 3, "column": 32, "offset": 42},
}

# `{bogusFilter(1)}` in '<div>\n  value: {bogusFilter(1)}\n</div>\n' — line 2.
INNER_EXPRESSION_POSITION = {
    "start": {"line": 2, "column": 10, "offset": 15},
    "end": {"line": 2, "column": 26, "offset": 31},
}

# The wrapping `<div>` element in the same document — lines 1 through 3.
ELEMENT_POSITION = {
    "start": {"line": 1, "column": 1, "offset": 0},
    "end": {"line": 3, "column": 7, "offset": 38},
}

# A `condition={...}` attribute sitting inside the element above.
ATTRIBUTE_POSITION = {
    "start": {"line": 1, "column": 5, "offset": 4},
    "end": {"line": 1, "column": 30, "offset": 29},
}


def _expression_node(expression: str, position: dict | None) -> dict:
    node: dict = {"type": NODE_TYPES["MDX_TEXT_EXPRESSION"], "value": expression}
    if position is not None:
        node["position"] = position
    return node


def _root(*children: dict) -> dict:
    return {"type": "root", "children": list(children)}


class TestPositionedExpressionErrors:
    """Expression failures carry the position of the `{...}` node."""

    @pytest.mark.asyncio
    async def test_unregistered_filter_error_points_at_the_failing_expression(self) -> None:
        tree = _root(_expression_node("bogusFilter(props.name)", EXPRESSION_POSITION))

        with pytest.raises(TemplateDXError) as exc_info:
            await transform_tree(tree, {"name": "x"})

        error = exc_info.value
        # Same message the TypeScript package produces for this input.
        assert str(error) == (
            'Error evaluating expression "bogusFilter(props.name)": '
            'Filter "bogusFilter" is not registered.'
        )
        assert error.position == EXPRESSION_POSITION
        assert error.line == 3
        assert error.column == 7
        assert error.offset == 17
        assert error.end_line == 3
        assert error.end_column == 32
        assert error.end_offset == 42

    @pytest.mark.asyncio
    async def test_unparseable_expression_error_carries_the_expression_position(self) -> None:
        # `{props.name | upper}` at the very start of the document. The Python
        # expression engine rejects `|` at lex time (the TS engine rejects it at
        # eval time) — either way the error must carry the expression position.
        position = {
            "start": {"line": 1, "column": 1, "offset": 0},
            "end": {"line": 1, "column": 21, "offset": 20},
        }
        tree = _root(
            {
                "type": NODE_TYPES["MDX_FLOW_EXPRESSION"],
                "value": "props.name | upper",
                "position": position,
            }
        )

        with pytest.raises(TemplateDXError) as exc_info:
            await transform_tree(tree, {"name": "x"})

        error = exc_info.value
        assert str(error) == (
            'Error evaluating expression "props.name | upper": '
            'Failed to parse expression "props.name | upper": '
            "Unknown operator starting at position 11"
        )
        assert error.line == 1
        assert error.column == 1
        assert error.offset == 0

    @pytest.mark.asyncio
    async def test_error_inside_nested_element_keeps_the_inner_expression_position(self) -> None:
        # The failing `{bogusFilter(1)}` is on line 2 — the wrapper <div> on
        # line 1 must NOT clobber the inner position when it re-raises.
        tree = _root(
            {
                "type": NODE_TYPES["MDX_JSX_FLOW_ELEMENT"],
                "name": "div",
                "position": ELEMENT_POSITION,
                "attributes": [],
                "children": [
                    {"type": NODE_TYPES["TEXT"], "value": "value: "},
                    _expression_node("bogusFilter(1)", INNER_EXPRESSION_POSITION),
                ],
            }
        )

        with pytest.raises(TemplateDXError) as exc_info:
            await transform_tree(tree)

        error = exc_info.value
        # The message is the inner expression error, not the generic JSX wrapper.
        assert str(error) == (
            'Error evaluating expression "bogusFilter(1)": '
            'Filter "bogusFilter" is not registered.'
        )
        assert error.position == INNER_EXPRESSION_POSITION
        assert error.line == 2
        assert error.column == 10
        assert error.offset == 15

    @pytest.mark.asyncio
    async def test_position_less_inner_error_is_wrapped_with_the_element_position(self) -> None:
        # When the inner expression node has no position (hand-built ASTs), the
        # enclosing element is the best location available — the wrapper both
        # re-labels the message and attaches its own position.
        tree = _root(
            {
                "type": NODE_TYPES["MDX_JSX_FLOW_ELEMENT"],
                "name": "div",
                "position": ELEMENT_POSITION,
                "attributes": [],
                "children": [_expression_node("bogusFilter(1)", None)],
            }
        )

        with pytest.raises(TemplateDXError) as exc_info:
            await transform_tree(tree)

        error = exc_info.value
        assert str(error) == (
            "Error processing MDX JSX Element: "
            'Error evaluating expression "bogusFilter(1)": '
            'Filter "bogusFilter" is not registered.'
        )
        assert error.position == ELEMENT_POSITION
        assert error.line == 1
        assert error.column == 1
        assert error.offset == 0

    @pytest.mark.asyncio
    async def test_transform_errors_still_catchable_as_value_error(self) -> None:
        # Pre-0.2 versions raised ValueError from these paths — existing
        # `except ValueError` call sites must keep working.
        tree = _root(_expression_node("bogusFilter(1)", EXPRESSION_POSITION))

        try:
            await transform_tree(tree)
        except ValueError as error:
            assert isinstance(error, TemplateDXError)
        else:
            raise AssertionError("expected transform_tree to raise")


class TestPositionedAttributeErrors:
    """Attribute failures point at the attribute, falling back to the element."""

    @staticmethod
    def _if_element(attribute: dict) -> dict:
        return {
            "type": NODE_TYPES["MDX_JSX_FLOW_ELEMENT"],
            "name": "If",
            "position": ELEMENT_POSITION,
            "attributes": [attribute],
            "children": [{"type": NODE_TYPES["TEXT"], "value": "Visible"}],
        }

    @pytest.mark.asyncio
    async def test_attribute_expression_error_points_at_the_attribute(self) -> None:
        tree = _root(
            self._if_element(
                {
                    "type": MDX_JSX_ATTRIBUTE_TYPES["MDX_JSX_ATTRIBUTE"],
                    "name": "condition",
                    "position": ATTRIBUTE_POSITION,
                    "value": {
                        "type": MDX_JSX_ATTRIBUTE_TYPES["MDX_JSX_ATTRIBUTE_VALUE_EXPRESSION"],
                        "value": "bogusFilter(1)",
                    },
                }
            )
        )

        with pytest.raises(TemplateDXError) as exc_info:
            await transform_tree(tree)

        error = exc_info.value
        # The attribute position wins over the element position, and the
        # positioned error passes through the JSX wrapper unwrapped.
        assert str(error) == (
            'Error evaluating expression "bogusFilter(1)": '
            'Filter "bogusFilter" is not registered.'
        )
        assert error.position == ATTRIBUTE_POSITION
        assert error.line == 1
        assert error.column == 5
        assert error.offset == 4

    @pytest.mark.asyncio
    async def test_attribute_expression_error_falls_back_to_the_element_position(self) -> None:
        tree = _root(
            self._if_element(
                {
                    "type": MDX_JSX_ATTRIBUTE_TYPES["MDX_JSX_ATTRIBUTE"],
                    "name": "condition",
                    "value": {
                        "type": MDX_JSX_ATTRIBUTE_TYPES["MDX_JSX_ATTRIBUTE_VALUE_EXPRESSION"],
                        "value": "bogusFilter(1)",
                    },
                }
            )
        )

        with pytest.raises(TemplateDXError) as exc_info:
            await transform_tree(tree)

        assert exc_info.value.position == ELEMENT_POSITION

    @pytest.mark.asyncio
    async def test_spread_attribute_error_carries_the_attribute_position(self) -> None:
        tree = _root(
            self._if_element(
                {
                    "type": MDX_JSX_ATTRIBUTE_TYPES["MDX_JSX_EXPRESSION_ATTRIBUTE"],
                    "value": "...props.rest",
                    "position": ATTRIBUTE_POSITION,
                }
            )
        )

        with pytest.raises(TemplateDXError) as exc_info:
            await transform_tree(tree)

        error = exc_info.value
        assert str(error) == "Unsupported attribute type in component <If>."
        assert error.position == ATTRIBUTE_POSITION


class TestTemplateDXErrorShape:
    """The error type itself and the to_positioned_error helper."""

    def test_position_fields_are_none_when_no_position_is_available(self) -> None:
        error = TemplateDXError("no position")
        assert error.position is None
        assert error.line is None
        assert error.column is None
        assert error.offset is None
        assert error.end_line is None
        assert error.end_column is None
        assert error.end_offset is None

    def test_is_a_value_error(self) -> None:
        assert isinstance(TemplateDXError("boom"), ValueError)

    def test_to_positioned_error_keeps_an_already_positioned_error(self) -> None:
        original = TemplateDXError("inner", INNER_EXPRESSION_POSITION)

        result = to_positioned_error(original, "outer", ELEMENT_POSITION)

        # Identity, not a copy — the inner, more precise, location wins.
        assert result is original
        assert str(result) == "inner"
        assert result.position == INNER_EXPRESSION_POSITION

    def test_to_positioned_error_wraps_a_position_less_error(self) -> None:
        result = to_positioned_error(ValueError("inner"), "outer", ELEMENT_POSITION)

        assert str(result) == "outer"
        assert result.position == ELEMENT_POSITION
        assert result.line == 1

    def test_to_positioned_error_wraps_a_templatedx_error_without_position(self) -> None:
        result = to_positioned_error(TemplateDXError("inner"), "outer", ELEMENT_POSITION)

        assert str(result) == "outer"
        assert result.position == ELEMENT_POSITION
