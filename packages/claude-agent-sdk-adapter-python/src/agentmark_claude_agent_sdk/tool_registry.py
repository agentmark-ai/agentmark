"""Tool registry for Claude Agent SDK adapter.

Ported from TypeScript: packages/claude-agent-sdk-adapter/src/tool-registry.ts
"""

from __future__ import annotations

import asyncio
import inspect
from dataclasses import dataclass
from typing import Any

from .types import AsyncToolFunction, ToolFunction


@dataclass
class RegisteredToolExecutor:
    """A registered tool executor wrapper."""

    name: str
    """Tool name."""

    _fn: ToolFunction | AsyncToolFunction
    """The registered function."""

    async def execute(self, args: dict[str, Any], ctx: dict[str, Any] | None = None) -> Any:
        """Execute the tool function.

        Args:
            args: Tool arguments.
            ctx: Optional context.

        Returns:
            Tool execution result.
        """
        result = self._fn(args, ctx)
        if inspect.iscoroutine(result) or asyncio.isfuture(result):
            return await result
        return result


class ClaudeAgentToolRegistry:
    """Type-safe tool registry for Claude Agent SDK adapter.

    Tools registered here are bridged to the Claude Agent SDK via MCP.
    Tool descriptions and parameters are derived from the prompt's tool schema.

    Example:
        tool_registry = ClaudeAgentToolRegistry()
        tool_registry.register("search_documents", async_search_fn)
        tool_registry.register("get_weather", get_weather_fn)
    """

    def __init__(self) -> None:
        """Create a new tool registry."""
        self._map: dict[str, ToolFunction | AsyncToolFunction] = {}

    def register(
        self,
        name: str,
        fn: ToolFunction | AsyncToolFunction,
    ) -> ClaudeAgentToolRegistry:
        """Register a tool execution function.

        Tool description and parameters are derived from the prompt's tool schema.

        Args:
            name: Unique tool name (must match tool name in prompt config).
            fn: Function to execute the tool (sync or async).

        Returns:
            self for chaining.
        """
        self._map[name] = fn
        return self

    def get(self, name: str) -> RegisteredToolExecutor | None:
        """Get a tool executor by name.

        Args:
            name: Tool name to retrieve.

        Returns:
            RegisteredToolExecutor or None if not found.
        """
        fn = self._map.get(name)
        if fn is None:
            return None
        return RegisteredToolExecutor(name=name, _fn=fn)

    def has(self, name: str) -> bool:
        """Check if a tool is registered.

        Args:
            name: Tool name to check.

        Returns:
            True if the tool is registered.
        """
        return name in self._map

    @property
    def size(self) -> int:
        """Get the number of registered tools."""
        return len(self._map)

    def list_names(self) -> list[str]:
        """Get all tool names.

        Returns:
            List of registered tool names.
        """
        return list(self._map.keys())
