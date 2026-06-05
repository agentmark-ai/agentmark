"""Base adapter primitives shared by all SDK-specific adapters.

Mirrors `@agentmark-ai/prompt-core/base-adapter`. Absorbs the three
responsibilities that every adapter was doing by hand:

  1. Holding a registry of in-process tools + an McpServerRegistry.
  2. Resolving `tools: [...]` lists — including `mcp://server/*` wildcards.
  3. Building telemetry metadata.

SDK adapters subclass `BaseAdapter[TTool]`, pass in an MCP client factory,
and implement their SDK-native `adapt_text` / `adapt_object` / etc by
calling `resolve_tools()` + `apply_param_map()` with an SDK-specific map.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

from .mcp import McpServers, parse_mcp_uri
from .mcp_registry import McpClientFactory, McpServerRegistry

TTool = TypeVar("TTool")


@dataclass
class ParamMapTransform:
    """Entry that renames AND transforms a value, e.g. wrapping a number
    in an SDK-specific helper. Used when a plain rename isn't enough."""

    key: str
    transform: Callable[[Any], Any]


# A ParamMap entry is one of:
#   - str: rename (input key → output key), pass value through
#   - None: drop the field entirely
#   - ParamMapTransform: rename + transform value
ParamMapEntry = str | None | ParamMapTransform
ParamMap = dict[str, ParamMapEntry]


def apply_param_map(
    input_obj: dict[str, Any] | None, param_map: ParamMap
) -> dict[str, Any]:
    """Translate a snake_case settings dict to SDK-native params.

    Unknown keys (not present in `param_map`) are dropped silently — adapters
    opt fields in explicitly so the wire format stays predictable.
    """
    if not input_obj:
        return {}
    out: dict[str, Any] = {}
    for in_key, value in input_obj.items():
        if value is None:
            continue
        entry = param_map.get(in_key)
        if entry is None or not isinstance(entry, (str, ParamMapTransform)):
            # Drop: entry missing OR explicitly `None`
            continue
        if isinstance(entry, str):
            out[entry] = value
        else:
            out[entry.key] = entry.transform(value)
    return out


def build_telemetry_metadata(
    telemetry: dict[str, Any] | None,
    props: dict[str, Any] | None,
    prompt_name: str,
    agentmark_meta: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Merge user telemetry with prompt-level metadata. Shared across
    adapters so fixes land everywhere at once."""
    if telemetry is None:
        return None
    existing_meta = telemetry.get("metadata") or {}
    metadata = {
        **existing_meta,
        "prompt_name": prompt_name,
        "props": json.dumps(props or {}),
    }
    if agentmark_meta:
        metadata.update(agentmark_meta)
    return {**telemetry, "metadata": metadata}


class BaseAdapter(Generic[TTool]):
    """Base class every SDK adapter extends.

    Subclasses provide the SDK-native tool type via the TTool generic and
    wire in the MCP client factory at construction. Beyond that, subclasses
    only implement `adapt_text` / `adapt_object` / etc by calling
    `resolve_tools()` + `apply_param_map()`.
    """

    def __init__(
        self,
        mcp_client_factory: McpClientFactory[TTool],
        tools: dict[str, TTool] | None = None,
        mcp_servers: McpServers | None = None,
    ) -> None:
        self._tools: dict[str, TTool] | None = tools
        self._mcp_registry: McpServerRegistry[TTool] = McpServerRegistry(
            mcp_client_factory
        )
        if mcp_servers:
            self._mcp_registry.register_servers(mcp_servers)

    @property
    def mcp_registry(self) -> McpServerRegistry[TTool]:
        return self._mcp_registry

    async def resolve_tools(self, tool_names: list[str]) -> dict[str, TTool]:
        """Resolve a list of tool refs. Supports plain names,
        `mcp://server/tool`, and `mcp://server/*` wildcard expansion."""
        out: dict[str, TTool] = {}
        for tool_name in tool_names:
            if tool_name.startswith("mcp://"):
                parsed = parse_mcp_uri(tool_name)
                server, tool = parsed["server"], parsed["tool"]
                if tool == "*":
                    all_tools = await self._mcp_registry.get_all_tools(server)
                    out.update(all_tools)
                    continue
                out[tool] = await self._mcp_registry.get_tool(server, tool)
                continue
            if self._tools is not None and tool_name in self._tools:
                out[tool_name] = self._tools[tool_name]
                continue
            available = (
                ", ".join(self._tools.keys()) if self._tools else "(none)"
            )
            raise ValueError(
                f"Tool '{tool_name}' referenced in prompt config was not "
                f"found in the provided tools record. Available tools: {available}"
            )
        return out
