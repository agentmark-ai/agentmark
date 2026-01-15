"""Tests for ClaudeAgentToolRegistry.

Ported from TypeScript: packages/claude-agent-sdk-adapter/test/agentmark.test.ts
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from agentmark_claude_agent_sdk.tool_registry import ClaudeAgentToolRegistry


class TestClaudeAgentToolRegistry:
    """Test suite for ClaudeAgentToolRegistry."""

    def test_registers_and_retrieves_tools(self) -> None:
        """Should register and retrieve tools."""
        registry = ClaudeAgentToolRegistry().register(
            "search",
            lambda args, _ctx: {"results": [args["query"]]},
        )

        assert registry.has("search") is True
        assert registry.size == 1

    async def test_executes_registered_tools(self) -> None:
        """Should execute registered tools."""

        async def add_tool(args: dict[str, Any], _ctx: dict[str, Any] | None) -> dict[str, int]:
            return {"sum": args["a"] + args["b"]}

        registry = ClaudeAgentToolRegistry().register("add", add_tool)

        executor = registry.get("add")
        assert executor is not None
        result = await executor.execute({"a": 5, "b": 3}, None)
        assert result == {"sum": 8}

    def test_gets_all_tool_names(self) -> None:
        """Should get all tool names."""
        registry = (
            ClaudeAgentToolRegistry()
            .register("tool1", lambda args, _ctx: {})
            .register("tool2", lambda args, _ctx: {})
        )

        names = registry.list_names()
        assert names == ["tool1", "tool2"]

    def test_returns_false_for_unregistered_tools(self) -> None:
        """Should return False for unregistered tools."""
        registry = ClaudeAgentToolRegistry()

        assert registry.has("search") is False

    async def test_handles_tool_executor_that_throws(self) -> None:
        """Should handle tool executor that throws."""

        async def failing_tool(args: dict[str, Any], _ctx: dict[str, Any] | None) -> dict[str, Any]:
            raise RuntimeError("Tool execution failed")

        registry = ClaudeAgentToolRegistry().register("failing", failing_tool)

        executor = registry.get("failing")
        assert executor is not None

        with pytest.raises(RuntimeError, match="Tool execution failed"):
            await executor.execute({}, None)

    def test_allows_chained_registration(self) -> None:
        """Should allow chained registration."""
        registry = (
            ClaudeAgentToolRegistry()
            .register("tool1", lambda args, _ctx: {})
            .register("tool2", lambda args, _ctx: {})
            .register("tool3", lambda args, _ctx: {})
        )

        assert registry.size == 3

    async def test_handles_async_executor_with_complex_return_type(self) -> None:
        """Should handle async executor with complex return type."""

        async def complex_tool(args: dict[str, Any], _ctx: dict[str, Any] | None) -> dict[str, Any]:
            await asyncio.sleep(0.001)
            return {
                "processed": [d.upper() for d in args["data"]],
                "count": len(args["data"]),
                "timestamp": 1234567890,
            }

        registry = ClaudeAgentToolRegistry().register("complex", complex_tool)

        executor = registry.get("complex")
        assert executor is not None
        result = await executor.execute({"data": ["a", "b", "c"]}, None)

        assert "processed" in result
        assert result["count"] == 3

    def test_get_returns_none_for_unregistered_tool(self) -> None:
        """Should return None when getting unregistered tool."""
        registry = ClaudeAgentToolRegistry()

        result = registry.get("nonexistent")
        assert result is None
