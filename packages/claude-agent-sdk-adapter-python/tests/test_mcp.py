"""Tests for MCP Bridge.

Ported from TypeScript: packages/claude-agent-sdk-adapter/test/mcp.test.ts
"""

from __future__ import annotations

from unittest.mock import AsyncMock

from agentmark_claude_agent_sdk.mcp.agentmark_mcp_bridge import (
    AgentMarkToolDefinition,
    create_agentmark_mcp_server,
    to_claude_agent_mcp_server,
)


class TestCreateAgentMarkMcpServer:
    """Test suite for createAgentMarkMcpServer."""

    def test_creates_mcp_server_config_from_tools(self) -> None:
        """Should create an MCP server configuration from tools."""
        tools: list[AgentMarkToolDefinition] = [
            AgentMarkToolDefinition(
                name="search",
                description="Search for information",
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                    },
                    "required": ["query"],
                },
                execute=AsyncMock(return_value={"results": []}),
            ),
        ]

        server_config = create_agentmark_mcp_server("test-server", tools)

        assert server_config.name == "test-server"
        assert server_config.version == "1.0.0"  # Default version
        assert len(server_config.tools) == 1
        assert server_config.tools[0].name == "search"
        assert server_config.tools[0].description == "Search for information"

    def test_accepts_custom_version_option(self) -> None:
        """Should accept custom version option."""
        tools: list[AgentMarkToolDefinition] = [
            AgentMarkToolDefinition(
                name="test",
                description="Test tool",
                parameters={"type": "object", "properties": {}},
                execute=AsyncMock(return_value={}),
            ),
        ]

        server_config = create_agentmark_mcp_server("test-server", tools, version="2.5.0")

        assert server_config.version == "2.5.0"

    def test_stores_tool_parameters_from_definition(self) -> None:
        """Should store tool parameters from definition."""
        input_schema = {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "limit": {"type": "number", "description": "Max results"},
            },
            "required": ["query"],
        }

        tools: list[AgentMarkToolDefinition] = [
            AgentMarkToolDefinition(
                name="search",
                description="Search",
                parameters=input_schema,
                execute=AsyncMock(return_value={}),
            ),
        ]

        server_config = create_agentmark_mcp_server("test-server", tools)

        assert server_config.tools[0].parameters == input_schema


class TestToClaudeAgentMcpServer:
    """Test suite for toClaudeAgentMcpServer."""

    def test_converts_mcp_server_config_to_claude_agent_sdk_format(self) -> None:
        """Should convert MCP server config to Claude Agent SDK format."""
        tools: list[AgentMarkToolDefinition] = [
            AgentMarkToolDefinition(
                name="tool1",
                description="First tool",
                parameters={"type": "object", "properties": {}},
                execute=AsyncMock(return_value={}),
            ),
            AgentMarkToolDefinition(
                name="tool2",
                description="Second tool",
                parameters={"type": "object", "properties": {}},
                execute=AsyncMock(return_value={}),
            ),
        ]

        server_config = create_agentmark_mcp_server("test-server", tools)
        claude_config = to_claude_agent_mcp_server(server_config)

        # SDK MCP servers have type 'sdk' and an 'instance' property
        assert claude_config["type"] == "sdk"
        assert "instance" in claude_config


class TestMcpEdgeCases:
    """Test suite for MCP edge cases."""

    def test_handles_empty_tools_array(self) -> None:
        """Should handle empty tools array."""
        server_config = create_agentmark_mcp_server("empty-server", [])

        assert len(server_config.tools) == 0

    def test_handles_tools_with_complex_nested_schemas(self) -> None:
        """Should handle tools with complex nested schemas."""
        complex_schema = {
            "type": "object",
            "properties": {
                "nested": {
                    "type": "object",
                    "properties": {
                        "deep": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                },
            },
        }

        tools: list[AgentMarkToolDefinition] = [
            AgentMarkToolDefinition(
                name="complex",
                description="Complex tool",
                parameters=complex_schema,
                execute=AsyncMock(return_value={}),
            ),
        ]

        server_config = create_agentmark_mcp_server("test-server", tools)
        assert server_config.tools[0].parameters == complex_schema

    def test_stores_execute_function_from_tool_definition(self) -> None:
        """Should store execute function from tool definition."""
        mock_execute = AsyncMock(return_value={"result": "success"})

        tools: list[AgentMarkToolDefinition] = [
            AgentMarkToolDefinition(
                name="test-tool",
                description="Test",
                parameters={"type": "object", "properties": {}},
                execute=mock_execute,
            ),
        ]

        server_config = create_agentmark_mcp_server("test-server", tools)
        assert server_config.tools[0].execute is mock_execute

    def test_handles_multiple_tools_with_different_parameter_types(self) -> None:
        """Should handle multiple tools with different parameter types."""
        tools: list[AgentMarkToolDefinition] = [
            AgentMarkToolDefinition(
                name="string-tool",
                description="Takes string",
                parameters={
                    "type": "object",
                    "properties": {"input": {"type": "string"}},
                },
                execute=AsyncMock(return_value={}),
            ),
            AgentMarkToolDefinition(
                name="number-tool",
                description="Takes number",
                parameters={
                    "type": "object",
                    "properties": {"count": {"type": "number"}},
                },
                execute=AsyncMock(return_value={}),
            ),
            AgentMarkToolDefinition(
                name="boolean-tool",
                description="Takes boolean",
                parameters={
                    "type": "object",
                    "properties": {"flag": {"type": "boolean"}},
                },
                execute=AsyncMock(return_value={}),
            ),
        ]

        server_config = create_agentmark_mcp_server("test-server", tools)
        assert len(server_config.tools) == 3
        assert server_config.tools[0].name == "string-tool"
        assert server_config.tools[1].name == "number-tool"
        assert server_config.tools[2].name == "boolean-tool"

    def test_handles_tool_with_all_optional_parameters(self) -> None:
        """Should handle tool with all optional parameters."""
        tools: list[AgentMarkToolDefinition] = [
            AgentMarkToolDefinition(
                name="optional-params",
                description="All params optional",
                parameters={
                    "type": "object",
                    "properties": {
                        "a": {"type": "string"},
                        "b": {"type": "number"},
                    },
                    # No required array means all optional
                },
                execute=AsyncMock(return_value={}),
            ),
        ]

        server_config = create_agentmark_mcp_server("test-server", tools)
        assert "required" not in server_config.tools[0].parameters

    def test_handles_tool_with_array_parameters(self) -> None:
        """Should handle tool with array parameters."""
        tools: list[AgentMarkToolDefinition] = [
            AgentMarkToolDefinition(
                name="array-tool",
                description="Takes arrays",
                parameters={
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of items",
                        },
                    },
                    "required": ["items"],
                },
                execute=AsyncMock(return_value={}),
            ),
        ]

        server_config = create_agentmark_mcp_server("test-server", tools)
        params = server_config.tools[0].parameters
        assert params["properties"]["items"]["type"] == "array"
        assert params["properties"]["items"]["items"]["type"] == "string"

    def test_preserves_server_name_exactly_as_provided(self) -> None:
        """Should preserve server name exactly as provided."""
        server_name = "my-special-server-v2"
        tools: list[AgentMarkToolDefinition] = [
            AgentMarkToolDefinition(
                name="tool",
                description="A tool",
                parameters={"type": "object", "properties": {}},
                execute=AsyncMock(return_value={}),
            ),
        ]

        server_config = create_agentmark_mcp_server(server_name, tools)
        assert server_config.name == server_name

    def test_handles_tools_with_different_json_schema_property_types(self) -> None:
        """Should handle tools with different JSON schema property types."""
        tools: list[AgentMarkToolDefinition] = [
            AgentMarkToolDefinition(
                name="multi-type-tool",
                description="Tool with various types",
                parameters={
                    "type": "object",
                    "properties": {
                        "str_prop": {"type": "string"},
                        "num_prop": {"type": "number"},
                        "int_prop": {"type": "integer"},
                        "bool_prop": {"type": "boolean"},
                        "null_prop": {"type": "null"},
                        "arr_prop": {"type": "array", "items": {"type": "string"}},
                        "obj_prop": {"type": "object", "properties": {}},
                    },
                },
                execute=AsyncMock(return_value={}),
            ),
        ]

        server_config = create_agentmark_mcp_server("test-server", tools)
        params = server_config.tools[0].parameters
        assert params["properties"]["str_prop"]["type"] == "string"
        assert params["properties"]["num_prop"]["type"] == "number"
        assert params["properties"]["int_prop"]["type"] == "integer"
        assert params["properties"]["bool_prop"]["type"] == "boolean"
        assert params["properties"]["null_prop"]["type"] == "null"
        assert params["properties"]["arr_prop"]["type"] == "array"
        assert params["properties"]["obj_prop"]["type"] == "object"
