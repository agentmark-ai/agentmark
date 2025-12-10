"""Tests for PydanticAIToolRegistry."""

from __future__ import annotations

from typing import Any

from agentmark_pydantic_ai_v0 import PydanticAIToolRegistry


class TestPydanticAIToolRegistry:
    """Tests for the tool registry."""

    def test_register_sync_tool(self) -> None:
        """Test registering a synchronous tool."""
        registry = PydanticAIToolRegistry()

        def add(args: dict[str, Any], ctx: dict[str, Any] | None) -> int:
            return args["a"] + args["b"]

        registry.register("add", add)

        assert registry.has("add")
        tool = registry.get("add")
        assert tool is not None
        assert tool.name == "add"
        assert tool.execute({"a": 2, "b": 3}, None) == 5

    def test_register_async_tool(self) -> None:
        """Test registering an asynchronous tool."""
        registry = PydanticAIToolRegistry()

        async def async_add(
            args: dict[str, Any], ctx: dict[str, Any] | None
        ) -> int:
            return args["a"] + args["b"]

        registry.register("async_add", async_add)

        assert registry.has("async_add")
        tool = registry.get("async_add")
        assert tool is not None
        assert tool.name == "async_add"
        # Note: We can't await here in sync test, but the tool is registered

    def test_register_with_takes_ctx(self) -> None:
        """Test registering a tool that takes RunContext."""
        registry = PydanticAIToolRegistry()

        def ctx_tool(args: dict[str, Any], ctx: dict[str, Any] | None) -> str:
            return f"ctx:{ctx}"

        registry.register("ctx_tool", ctx_tool, takes_ctx=True)

        tool = registry.get("ctx_tool")
        assert tool is not None
        assert tool.takes_ctx is True

    def test_get_nonexistent_tool(self) -> None:
        """Test getting a tool that doesn't exist returns None."""
        registry = PydanticAIToolRegistry()

        assert registry.get("nonexistent") is None
        assert not registry.has("nonexistent")

    def test_list_names(self) -> None:
        """Test listing all registered tool names."""
        registry = PydanticAIToolRegistry()

        registry.register("tool1", lambda args, ctx: None)
        registry.register("tool2", lambda args, ctx: None)
        registry.register("tool3", lambda args, ctx: None)

        names = registry.list_names()
        assert set(names) == {"tool1", "tool2", "tool3"}

    def test_list_names_empty(self) -> None:
        """Test listing names from empty registry."""
        registry = PydanticAIToolRegistry()

        assert registry.list_names() == []

    def test_remove_tool(self) -> None:
        """Test removing a tool from the registry."""
        registry = PydanticAIToolRegistry()

        registry.register("removable", lambda args, ctx: None)
        assert registry.has("removable")

        result = registry.remove("removable")
        assert result is True
        assert not registry.has("removable")

    def test_remove_nonexistent_tool(self) -> None:
        """Test removing a tool that doesn't exist returns False."""
        registry = PydanticAIToolRegistry()

        result = registry.remove("nonexistent")
        assert result is False

    def test_method_chaining(self) -> None:
        """Test that register supports method chaining."""
        registry = (
            PydanticAIToolRegistry()
            .register("tool1", lambda args, ctx: 1)
            .register("tool2", lambda args, ctx: 2)
            .register("tool3", lambda args, ctx: 3)
        )

        assert registry.has("tool1")
        assert registry.has("tool2")
        assert registry.has("tool3")

    def test_tool_with_context(self) -> None:
        """Test tool execution with tool_context."""
        registry = PydanticAIToolRegistry()

        def context_aware(
            args: dict[str, Any], ctx: dict[str, Any] | None
        ) -> str:
            if ctx:
                return f"greeting: {ctx.get('greeting', 'hi')} {args['name']}"
            return f"hi {args['name']}"

        registry.register("greet", context_aware)

        tool = registry.get("greet")
        assert tool is not None

        # Without context
        result = tool.execute({"name": "Alice"}, None)
        assert result == "hi Alice"

        # With context
        result = tool.execute({"name": "Bob"}, {"greeting": "Hello"})
        assert result == "greeting: Hello Bob"

    def test_overwrite_tool(self) -> None:
        """Test that registering a tool with the same name overwrites it."""
        registry = PydanticAIToolRegistry()

        registry.register("tool", lambda args, ctx: "v1")
        assert registry.get("tool") is not None
        assert registry.get("tool").execute({}, None) == "v1"

        registry.register("tool", lambda args, ctx: "v2")
        assert registry.get("tool").execute({}, None) == "v2"
