"""Shared MCP server registry.

Mirrors the TypeScript `McpServerRegistry` in
`@agentmark-ai/prompt-core/mcp-registry`. Generic over the SDK's native
tool type via TypeVar. Client construction is deferred to a factory
callable so this module stays free of any SDK dependency.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any, Generic, Protocol, TypeVar, runtime_checkable

from .mcp import (
    McpServerConfig,
    McpStdioServerConfig,
    McpUrlServerConfig,
    interpolate_env_in_object,
)

log = logging.getLogger(__name__)

TTool = TypeVar("TTool")


@runtime_checkable
class McpClient(Protocol[TTool]):
    """Minimal contract an MCP client must satisfy."""

    async def tools(self) -> dict[str, TTool]: ...


# Factory signature: takes interpolated config, returns a connected client.
McpClientFactory = Callable[[McpServerConfig], Awaitable[McpClient[TTool]]]


def _is_url_config(cfg: McpServerConfig) -> bool:
    return "url" in cfg and cfg.get("url") is not None


def _is_stdio_config(cfg: McpServerConfig) -> bool:
    return "command" in cfg and cfg.get("command") is not None


class McpServerRegistry(Generic[TTool]):
    """Resolves `mcp://server/tool` URIs (including wildcards) to SDK-native
    tool values. Connection + tool listing is cached per server."""

    def __init__(self, factory: McpClientFactory[TTool]) -> None:
        self._factory = factory
        self._servers: dict[str, McpServerConfig] = {}
        self._clients: dict[str, McpClient[TTool]] = {}
        self._tools_cache: dict[str, dict[str, TTool]] = {}

    def register(self, name: str, config: McpServerConfig) -> "McpServerRegistry[TTool]":
        self._servers[name] = config
        return self

    def register_servers(
        self, servers: dict[str, McpServerConfig]
    ) -> "McpServerRegistry[TTool]":
        for name, config in servers.items():
            self.register(name, config)
        return self

    def has(self, name: str) -> bool:
        return name in self._servers

    def get_config(self, name: str) -> McpServerConfig | None:
        return self._servers.get(name)

    def _get_config_or_raise(self, name: str) -> McpServerConfig:
        cfg = self._servers.get(name)
        if cfg is None:
            raise ValueError(
                f"MCP server '{name}' not registered. "
                f"Available servers: {', '.join(self._servers.keys()) or '(none)'}"
            )
        return cfg

    async def _create_client(self, server_name: str) -> McpClient[TTool]:
        raw_cfg = self._get_config_or_raise(server_name)
        cfg = interpolate_env_in_object(raw_cfg)
        if _is_url_config(cfg) or _is_stdio_config(cfg):
            return await self._factory(cfg)
        raise ValueError("Invalid MCP server config: expected 'url' or 'command'")

    async def get_client(self, server_name: str) -> McpClient[TTool]:
        existing = self._clients.get(server_name)
        if existing is not None:
            return existing
        try:
            created = await self._create_client(server_name)
            self._clients[server_name] = created
            return created
        except Exception as err:
            log.error(
                "[McpServerRegistry] Failed to connect to MCP server '%s': %s",
                server_name,
                err,
            )
            raise

    async def get_tool(self, server_name: str, tool_name: str) -> TTool:
        cached = self._tools_cache.get(server_name)
        if cached is not None and tool_name in cached:
            return cached[tool_name]

        try:
            client = await self.get_client(server_name)
            all_tools = await client.tools()
            self._tools_cache[server_name] = all_tools
        except Exception:
            self._tools_cache.pop(server_name, None)
            raise

        tool = all_tools.get(tool_name)
        if tool is None:
            raise ValueError(
                f"MCP tool not found: {server_name}/{tool_name}. "
                f"Available tools: {', '.join(all_tools.keys())}"
            )
        return tool

    async def get_all_tools(self, server_name: str) -> dict[str, TTool]:
        cached = self._tools_cache.get(server_name)
        if cached is not None:
            return cached
        try:
            client = await self.get_client(server_name)
            all_tools = await client.tools()
            self._tools_cache[server_name] = all_tools
            return all_tools
        except Exception:
            self._tools_cache.pop(server_name, None)
            raise
