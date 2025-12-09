"""Tests for the NodeTransformer and TemplateDX engine."""

import pytest

from templatedx import NODE_TYPES, TemplateDX


class TestTemplateDXEngine:
    """Tests for the TemplateDX engine."""

    @pytest.mark.asyncio
    async def test_transform_simple_text(self, engine: TemplateDX) -> None:
        tree = {
            "type": "root",
            "children": [{"type": NODE_TYPES["TEXT"], "value": "Hello World"}],
        }

        result = await engine.transform(tree)

        assert result["children"][0]["value"] == "Hello World"

    @pytest.mark.asyncio
    async def test_transform_expression(self, engine: TemplateDX) -> None:
        tree = {
            "type": "root",
            "children": [
                {"type": NODE_TYPES["MDX_TEXT_EXPRESSION"], "value": "props.name"}
            ],
        }

        result = await engine.transform(tree, props={"name": "Alice"})

        assert result["children"][0]["value"] == "Alice"

    @pytest.mark.asyncio
    async def test_transform_expression_with_filter(self, engine: TemplateDX) -> None:
        tree = {
            "type": "root",
            "children": [
                {"type": NODE_TYPES["MDX_TEXT_EXPRESSION"], "value": "upper(props.name)"}
            ],
        }

        result = await engine.transform(tree, props={"name": "alice"})

        assert result["children"][0]["value"] == "ALICE"

    @pytest.mark.asyncio
    async def test_transform_if_true(self, engine: TemplateDX) -> None:
        tree = {
            "type": "root",
            "children": [
                {
                    "type": NODE_TYPES["MDX_JSX_FLOW_ELEMENT"],
                    "name": "If",
                    "attributes": [
                        {
                            "type": "mdxJsxAttribute",
                            "name": "condition",
                            "value": {
                                "type": "mdxJsxAttributeValueExpression",
                                "value": "props.show",
                            },
                        }
                    ],
                    "children": [{"type": NODE_TYPES["TEXT"], "value": "Visible"}],
                }
            ],
        }

        result = await engine.transform(tree, props={"show": True})

        assert len(result["children"]) == 1
        assert result["children"][0]["value"] == "Visible"

    @pytest.mark.asyncio
    async def test_transform_if_false(self, engine: TemplateDX) -> None:
        tree = {
            "type": "root",
            "children": [
                {
                    "type": NODE_TYPES["MDX_JSX_FLOW_ELEMENT"],
                    "name": "If",
                    "attributes": [
                        {
                            "type": "mdxJsxAttribute",
                            "name": "condition",
                            "value": {
                                "type": "mdxJsxAttributeValueExpression",
                                "value": "props.show",
                            },
                        }
                    ],
                    "children": [{"type": NODE_TYPES["TEXT"], "value": "Visible"}],
                }
            ],
        }

        result = await engine.transform(tree, props={"show": False})

        assert len(result["children"]) == 0

    @pytest.mark.asyncio
    async def test_transform_if_else(self, engine: TemplateDX) -> None:
        tree = {
            "type": "root",
            "children": [
                {
                    "type": NODE_TYPES["MDX_JSX_FLOW_ELEMENT"],
                    "name": "If",
                    "attributes": [
                        {
                            "type": "mdxJsxAttribute",
                            "name": "condition",
                            "value": {
                                "type": "mdxJsxAttributeValueExpression",
                                "value": "props.show",
                            },
                        }
                    ],
                    "children": [{"type": NODE_TYPES["TEXT"], "value": "If branch"}],
                },
                {
                    "type": NODE_TYPES["MDX_JSX_FLOW_ELEMENT"],
                    "name": "Else",
                    "attributes": [],
                    "children": [{"type": NODE_TYPES["TEXT"], "value": "Else branch"}],
                },
            ],
        }

        result = await engine.transform(tree, props={"show": False})

        assert len(result["children"]) == 1
        assert result["children"][0]["value"] == "Else branch"

    @pytest.mark.asyncio
    async def test_transform_foreach(self, engine: TemplateDX) -> None:
        tree = {
            "type": "root",
            "children": [
                {
                    "type": NODE_TYPES["MDX_JSX_FLOW_ELEMENT"],
                    "name": "ForEach",
                    "attributes": [
                        {
                            "type": "mdxJsxAttribute",
                            "name": "arr",
                            "value": {
                                "type": "mdxJsxAttributeValueExpression",
                                "value": "props.items",
                            },
                        }
                    ],
                    "children": [
                        {
                            "type": NODE_TYPES["MDX_FLOW_EXPRESSION"],
                            "value": "(item) => item",
                            "children": [
                                {
                                    "type": NODE_TYPES["MDX_TEXT_EXPRESSION"],
                                    "value": "item",
                                }
                            ],
                        }
                    ],
                }
            ],
        }

        result = await engine.transform(tree, props={"items": ["a", "b", "c"]})

        # ForEach should produce one node per item
        assert len(result["children"]) == 3

    @pytest.mark.asyncio
    async def test_custom_filter(self, engine: TemplateDX) -> None:
        engine.register_filter("reverse", lambda s: s[::-1])

        tree = {
            "type": "root",
            "children": [
                {"type": NODE_TYPES["MDX_TEXT_EXPRESSION"], "value": 'reverse("hello")'}
            ],
        }

        result = await engine.transform(tree)

        assert result["children"][0]["value"] == "olleh"

    @pytest.mark.asyncio
    async def test_nested_props_access(self, engine: TemplateDX) -> None:
        tree = {
            "type": "root",
            "children": [
                {"type": NODE_TYPES["MDX_TEXT_EXPRESSION"], "value": "props.user.name"}
            ],
        }

        result = await engine.transform(tree, props={"user": {"name": "Alice"}})

        assert result["children"][0]["value"] == "Alice"

    @pytest.mark.asyncio
    async def test_array_access(self, engine: TemplateDX) -> None:
        tree = {
            "type": "root",
            "children": [
                {"type": NODE_TYPES["MDX_TEXT_EXPRESSION"], "value": "props.items[0]"}
            ],
        }

        result = await engine.transform(tree, props={"items": ["first", "second"]})

        assert result["children"][0]["value"] == "first"

    @pytest.mark.asyncio
    async def test_binary_expression(self, engine: TemplateDX) -> None:
        tree = {
            "type": "root",
            "children": [
                {"type": NODE_TYPES["MDX_TEXT_EXPRESSION"], "value": "props.a + props.b"}
            ],
        }

        result = await engine.transform(tree, props={"a": 10, "b": 5})

        assert result["children"][0]["value"] == "15"

    @pytest.mark.asyncio
    async def test_comparison_in_condition(self, engine: TemplateDX) -> None:
        tree = {
            "type": "root",
            "children": [
                {
                    "type": NODE_TYPES["MDX_JSX_FLOW_ELEMENT"],
                    "name": "If",
                    "attributes": [
                        {
                            "type": "mdxJsxAttribute",
                            "name": "condition",
                            "value": {
                                "type": "mdxJsxAttributeValueExpression",
                                "value": "props.count > 5",
                            },
                        }
                    ],
                    "children": [{"type": NODE_TYPES["TEXT"], "value": "Many"}],
                }
            ],
        }

        result_many = await engine.transform(tree, props={"count": 10})
        result_few = await engine.transform(tree, props={"count": 3})

        assert len(result_many["children"]) == 1
        assert len(result_few["children"]) == 0

    @pytest.mark.asyncio
    async def test_shared_context(self, engine: TemplateDX) -> None:
        tree = {
            "type": "root",
            "children": [
                {"type": NODE_TYPES["MDX_TEXT_EXPRESSION"], "value": "shared_var"}
            ],
        }

        result = await engine.transform(tree, shared={"shared_var": "from_shared"})

        assert result["children"][0]["value"] == "from_shared"


class TestRegistryIsolation:
    """Tests for registry isolation between instances."""

    @pytest.mark.asyncio
    async def test_filter_isolation(self) -> None:
        engine1 = TemplateDX()
        engine2 = TemplateDX()

        engine1.register_filter("custom", lambda x: "engine1")

        # engine2 should not have the custom filter
        assert engine2.get_filter("custom") is None
        assert engine1.get_filter("custom") is not None

    @pytest.mark.asyncio
    async def test_remove_filter(self) -> None:
        engine = TemplateDX()
        engine.register_filter("temp", lambda x: x)
        assert engine.get_filter("temp") is not None

        engine.remove_filter("temp")
        assert engine.get_filter("temp") is None

    @pytest.mark.asyncio
    async def test_builtin_filters_available(self) -> None:
        engine = TemplateDX()

        # All built-in filters should be available
        assert engine.get_filter("upper") is not None
        assert engine.get_filter("lower") is not None
        assert engine.get_filter("capitalize") is not None
        assert engine.get_filter("truncate") is not None
        assert engine.get_filter("abs") is not None
        assert engine.get_filter("join") is not None
        assert engine.get_filter("round") is not None
        assert engine.get_filter("replace") is not None
        assert engine.get_filter("urlencode") is not None
        assert engine.get_filter("dump") is not None

    @pytest.mark.asyncio
    async def test_builtin_tags_available(self) -> None:
        engine = TemplateDX()

        # All built-in tags should be available
        assert engine.get_tag_plugin("If") is not None
        assert engine.get_tag_plugin("ElseIf") is not None
        assert engine.get_tag_plugin("Else") is not None
        assert engine.get_tag_plugin("ForEach") is not None
        assert engine.get_tag_plugin("Raw") is not None
