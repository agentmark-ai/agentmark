"""MCP bridge for AgentMark tools to Claude Agent SDK.

Ported from TypeScript: packages/claude-agent-sdk-adapter/src/mcp/agentmark-mcp-bridge.ts
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from ..types import AgentMarkToolDefinition

# Package version - updated during build or manually
PACKAGE_VERSION = "1.0.0"


@dataclass
class McpServerConfig:
    """MCP Server configuration that can be passed to Claude Agent SDK."""

    name: str
    """Server name."""

    version: str = "1.0.0"
    """Server version."""

    tools: list[AgentMarkToolDefinition] = field(default_factory=list)
    """Tool definitions."""


def create_agentmark_mcp_server(
    name: str,
    tools: list[AgentMarkToolDefinition],
    version: str | None = None,
) -> McpServerConfig:
    """Create tool wrappers for AgentMark tools that can be used with Claude Agent SDK's MCP support.

    Args:
        name: Server name.
        tools: AgentMark tool definitions.
        version: Optional server version (defaults to package version).

    Returns:
        MCP server configuration.

    Example:
        tools = tool_registry.get_tools()
        mcp_server = create_agentmark_mcp_server('agentmark-tools', tools)

        # Use with Claude Agent SDK
        result = await query(
            prompt="Use the tools to help me",
            options={
                "mcp_servers": {
                    "agentmark-tools": mcp_server
                }
            }
        )
    """
    return McpServerConfig(
        name=name,
        version=version or PACKAGE_VERSION,
        tools=tools,
    )


def to_claude_agent_mcp_server(
    server_config: McpServerConfig,
) -> dict[str, Any]:
    """Convert an AgentMark MCP server config to Claude Agent SDK mcpServers format.

    Uses Claude Agent SDK's native createSdkMcpServer() function.

    Args:
        server_config: The AgentMark MCP server configuration.

    Returns:
        Configuration compatible with Claude Agent SDK mcpServers option.
    """
    # For Python, we create an SDK-compatible structure
    # The actual SDK integration will use this structure
    try:
        from claude_agent_sdk import create_sdk_mcp_server, tool

        # Convert AgentMark tools to SDK tool definitions
        sdk_tools = []
        for agentmark_tool in server_config.tools:
            # Create wrapper function for the tool
            async def tool_handler(
                args: dict[str, Any], _tool: AgentMarkToolDefinition = agentmark_tool
            ) -> dict[str, Any]:
                try:
                    result = await _tool.execute(args)
                    return {
                        "content": [
                            {
                                "type": "text",
                                "text": result
                                if isinstance(result, str)
                                else json.dumps(result, indent=2),
                            }
                        ]
                    }
                except Exception as e:
                    return {
                        "content": [
                            {
                                "type": "text",
                                "text": f"Error executing tool {_tool.name}: {str(e)}",
                            }
                        ],
                        "isError": True,
                    }

            # Use tool as a decorator (it takes 3 args and wraps the handler)
            sdk_tool = tool(
                agentmark_tool.name,
                agentmark_tool.description,
                agentmark_tool.parameters,
            )(tool_handler)
            sdk_tools.append(sdk_tool)

        # Create the SDK MCP server
        return create_sdk_mcp_server(
            name=server_config.name,
            version=server_config.version,
            tools=sdk_tools,
        )
    except ImportError:
        # Fallback for when claude-agent-sdk is not available (e.g., in tests)
        # Return a mock SDK server structure
        return {
            "type": "sdk",
            "instance": {
                "name": server_config.name,
                "version": server_config.version,
                "tools": [
                    {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                        "execute": t.execute,
                    }
                    for t in server_config.tools
                ],
            },
        }


def has_tools(tools: list[AgentMarkToolDefinition]) -> bool:
    """Helper to check if any tools are available.

    Args:
        tools: List of tool definitions.

    Returns:
        True if tools list is non-empty.
    """
    return len(tools) > 0


# Re-export for convenience
__all__ = [
    "AgentMarkToolDefinition",
    "McpServerConfig",
    "create_agentmark_mcp_server",
    "to_claude_agent_mcp_server",
    "has_tools",
]
