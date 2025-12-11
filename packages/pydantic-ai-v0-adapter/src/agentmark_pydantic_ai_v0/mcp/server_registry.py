"""MCP server registry for Pydantic AI adapter.

Manages MCP server connections and tool resolution using Pydantic AI's
native MCP support (MCPServerHTTP, MCPServerStdio).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from agentmark.prompt_core.mcp import (
    McpServerConfig,
    McpServers,
    interpolate_env_in_object,
)

if TYPE_CHECKING:
    from pydantic_ai import Tool


def _is_url_config(cfg: McpServerConfig) -> bool:
    """Check if config is URL-based."""
    return "url" in cfg


def _is_stdio_config(cfg: McpServerConfig) -> bool:
    """Check if config is stdio-based."""
    return "command" in cfg


class McpServerRegistry:
    """Registry for MCP servers in Pydantic AI.

    Manages server configurations and provides tool resolution from MCP servers.
    Mirrors the TypeScript McpServerRegistry pattern.

    Pydantic AI uses MCPServerHTTP and MCPServerStdio classes which act as
    toolsets that can be passed directly to Agent. This registry manages
    the configuration and provides a unified interface for tool lookup.

    Example:
        registry = McpServerRegistry()

        # Register URL-based server
        registry.register("search-server", {"url": "http://localhost:8000/mcp"})

        # Register stdio-based server
        registry.register("python-runner", {
            "command": "python",
            "args": ["-m", "mcp_server"],
        })

        # Get a specific tool
        tool = await registry.get_tool("search-server", "web_search")

        # Get all tools from a server
        tools = await registry.get_all_tools("search-server")
    """

    def __init__(self) -> None:
        """Initialize the registry."""
        self._servers: dict[str, McpServerConfig] = {}
        self._clients: dict[str, Any] = {}  # Cached MCP server instances
        self._tools_cache: dict[str, dict[str, Tool[Any]]] = {}

    def register(self, name: str, config: McpServerConfig) -> McpServerRegistry:
        """Register an MCP server with the given configuration.

        Args:
            name: The name of the MCP server (used in mcp:// URIs).
            config: The server configuration (URL or stdio).

        Returns:
            Self for method chaining.
        """
        self._servers[name] = config
        return self

    def register_servers(self, servers: McpServers) -> McpServerRegistry:
        """Register multiple MCP servers at once.

        Args:
            servers: A dict mapping server names to configurations.

        Returns:
            Self for method chaining.
        """
        for name, config in servers.items():
            self.register(name, config)
        return self

    def has(self, name: str) -> bool:
        """Check if an MCP server is registered.

        Args:
            name: Server name.

        Returns:
            True if server is registered.
        """
        return name in self._servers

    def get_config(self, name: str) -> McpServerConfig | None:
        """Get the configuration for a registered MCP server.

        Args:
            name: Server name.

        Returns:
            Server configuration or None if not found.
        """
        return self._servers.get(name)

    def _get_config_or_throw(self, name: str) -> McpServerConfig:
        """Get config or raise error if not found."""
        cfg = self._servers.get(name)
        if not cfg:
            available = ", ".join(self._servers.keys()) or "(none)"
            raise ValueError(
                f"MCP server '{name}' not registered. Available servers: {available}"
            )
        return cfg

    async def _create_client(self, server_name: str) -> Any:
        """Create an MCP client for the given server.

        Uses Pydantic AI's MCPServerHTTP or MCPServerStdio based on config.
        """
        # Import here to avoid requiring pydantic-ai-mcp if not using MCP
        try:
            from pydantic_ai.mcp import MCPServerHTTP, MCPServerStdio
        except ImportError as e:
            raise ImportError(
                "MCP support requires pydantic-ai with MCP extras. "
                "Install with: pip install pydantic-ai[mcp]"
            ) from e

        raw_cfg = self._get_config_or_throw(server_name)
        cfg = interpolate_env_in_object(raw_cfg)

        if _is_url_config(cfg):
            return MCPServerHTTP(
                url=cfg["url"],
                headers=cfg.get("headers"),
            )

        if _is_stdio_config(cfg):
            return MCPServerStdio(
                command=cfg["command"],
                args=cfg.get("args", []),
                cwd=cfg.get("cwd"),
                env=cfg.get("env"),
            )

        raise ValueError("Invalid MCP server config: expected 'url' or 'command'")

    async def _get_client(self, server_name: str) -> Any:
        """Get or create an MCP client for the server."""
        if server_name in self._clients:
            return self._clients[server_name]

        client = await self._create_client(server_name)
        self._clients[server_name] = client
        return client

    async def _fetch_tools(self, server_name: str) -> dict[str, Tool[Any]]:
        """Fetch all tools from an MCP server.

        Pydantic AI's MCP servers expose tools via the toolset interface.
        We need to connect and list available tools.
        """
        if server_name in self._tools_cache:
            return self._tools_cache[server_name]

        client = await self._get_client(server_name)

        # Connect to the server and get tools
        # Pydantic AI MCP servers are async context managers
        async with client:
            # Get the list of tools from the MCP server
            # The MCP server exposes tools that can be prepared
            tools_list = await client.list_tools()

        # Convert to dict keyed by tool name
        tools_dict: dict[str, Tool[Any]] = {}
        for tool_def in tools_list:
            # Create a Tool wrapper that calls the MCP server
            tool_name = tool_def.name
            tools_dict[tool_name] = self._create_tool_wrapper(
                server_name, tool_def
            )

        self._tools_cache[server_name] = tools_dict
        return tools_dict

    def _create_tool_wrapper(
        self, server_name: str, tool_def: Any
    ) -> Tool[Any]:
        """Create a Pydantic AI Tool that wraps an MCP tool.

        Args:
            server_name: The MCP server name.
            tool_def: The tool definition from the MCP server.

        Returns:
            A Pydantic AI Tool instance.
        """
        from pydantic_ai import Tool

        async def execute_mcp_tool(**kwargs: Any) -> Any:
            """Execute the MCP tool."""
            client = await self._get_client(server_name)
            async with client:
                result = await client.call_tool(tool_def.name, kwargs)
                return result

        return Tool(
            function=execute_mcp_tool,
            name=tool_def.name,
            description=tool_def.description or "",
        )

    async def get_tool(self, server_name: str, tool_name: str) -> Tool[Any]:
        """Get a specific tool from an MCP server.

        Args:
            server_name: The MCP server name.
            tool_name: The tool name.

        Returns:
            The Pydantic AI Tool instance.

        Raises:
            ValueError: If server or tool not found.
        """
        tools = await self._fetch_tools(server_name)
        tool = tools.get(tool_name)
        if not tool:
            available = ", ".join(tools.keys()) or "(none)"
            raise ValueError(
                f"MCP tool not found: {server_name}/{tool_name}. "
                f"Available tools: {available}"
            )
        return tool

    async def get_all_tools(self, server_name: str) -> dict[str, Tool[Any]]:
        """Get all tools from an MCP server.

        Args:
            server_name: The MCP server name.

        Returns:
            Dict mapping tool names to Tool instances.

        Raises:
            ValueError: If server not found.
        """
        return await self._fetch_tools(server_name)

    def list_servers(self) -> list[str]:
        """List all registered server names.

        Returns:
            List of server names.
        """
        return list(self._servers.keys())
