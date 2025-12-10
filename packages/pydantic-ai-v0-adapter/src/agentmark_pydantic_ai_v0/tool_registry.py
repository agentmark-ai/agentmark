"""Type-safe tool registry for Pydantic AI adapter."""

from __future__ import annotations

from .types import AsyncToolFunction, RegisteredTool, ToolFunction


class PydanticAIToolRegistry:
    """Tool registry matching TypeScript VercelAIToolRegistry patterns.

    Tools are registered with their execution functions. When the adapter
    builds Pydantic AI Tool instances, it looks up the execution function
    from this registry.

    Example:
        registry = PydanticAIToolRegistry()

        # Register sync tool
        registry.register("search", lambda args, ctx: search_web(args["query"]))

        # Register async tool
        async def fetch_data(args: dict, ctx: dict | None) -> dict:
            return await api.get(args["url"])
        registry.register("fetch", fetch_data)

        # Register tool that needs Pydantic AI's RunContext
        registry.register("db_query", db_tool_fn, takes_ctx=True)
    """

    def __init__(self) -> None:
        """Initialize empty tool registry."""
        self._tools: dict[str, RegisteredTool] = {}

    def register(
        self,
        name: str,
        fn: ToolFunction | AsyncToolFunction,
        takes_ctx: bool = False,
    ) -> PydanticAIToolRegistry:
        """Register a tool execution function.

        Args:
            name: Tool name (must match AgentMark config tool key).
            fn: Execution function with signature (args, tool_context) -> result.
                The tool_context is passed from AdaptOptions.toolContext.
            takes_ctx: Whether the tool needs Pydantic AI's RunContext
                       in addition to the AgentMark tool_context.

        Returns:
            Self for method chaining.
        """
        self._tools[name] = RegisteredTool(
            name=name,
            execute=fn,
            takes_ctx=takes_ctx,
        )
        return self

    def get(self, name: str) -> RegisteredTool | None:
        """Get a registered tool by name.

        Args:
            name: Tool name.

        Returns:
            RegisteredTool or None if not found.
        """
        return self._tools.get(name)

    def has(self, name: str) -> bool:
        """Check if a tool is registered.

        Args:
            name: Tool name.

        Returns:
            True if tool is registered.
        """
        return name in self._tools

    def list_names(self) -> list[str]:
        """List all registered tool names.

        Returns:
            List of tool names.
        """
        return list(self._tools.keys())

    def remove(self, name: str) -> bool:
        """Remove a tool from the registry.

        Args:
            name: Tool name.

        Returns:
            True if tool was removed, False if not found.
        """
        if name in self._tools:
            del self._tools[name]
            return True
        return False
