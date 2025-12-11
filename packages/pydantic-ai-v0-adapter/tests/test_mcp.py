"""Tests for MCP (Model Context Protocol) integration."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic_ai import Tool

from agentmark_pydantic_ai_v0 import (
    McpServerRegistry,
    PydanticAIAdapter,
    PydanticAIModelRegistry,
    PydanticAIToolRegistry,
)


@pytest.fixture
def mock_model_registry() -> PydanticAIModelRegistry:
    """Create a mock model registry for testing."""
    registry = PydanticAIModelRegistry()
    registry.register_models("test-model", lambda name, _: f"test:{name}")
    return registry


@pytest.fixture
def tool_registry() -> PydanticAIToolRegistry:
    """Create a tool registry with a test tool."""
    registry = PydanticAIToolRegistry()

    def add_tool(args: dict[str, Any], ctx: dict[str, Any] | None) -> int:
        return args["a"] + args["b"]

    registry.register("sum", add_tool)
    return registry


@pytest.fixture
def mcp_text_ast() -> dict[str, Any]:
    """Load the MCP text prompt fixture."""
    fixture_path = Path(__file__).parent / "fixtures" / "mcp-text.prompt.mdx.json"
    with open(fixture_path) as f:
        return json.load(f)


class TestMcpServerRegistry:
    """Tests for the MCP server registry."""

    def test_register_url_server(self) -> None:
        """Test registering a URL-based MCP server."""
        registry = McpServerRegistry()
        registry.register("search", {"url": "http://localhost:8000/mcp"})

        assert registry.has("search")
        config = registry.get_config("search")
        assert config is not None
        assert config["url"] == "http://localhost:8000/mcp"

    def test_register_stdio_server(self) -> None:
        """Test registering a stdio-based MCP server."""
        registry = McpServerRegistry()
        registry.register(
            "python-runner",
            {
                "command": "python",
                "args": ["-m", "mcp_server"],
                "cwd": "/app",
            },
        )

        assert registry.has("python-runner")
        config = registry.get_config("python-runner")
        assert config is not None
        assert config["command"] == "python"
        assert config["args"] == ["-m", "mcp_server"]

    def test_register_servers_batch(self) -> None:
        """Test registering multiple servers at once."""
        registry = McpServerRegistry()
        registry.register_servers(
            {
                "server-1": {"url": "http://localhost:8001/mcp"},
                "server-2": {"url": "http://localhost:8002/mcp"},
            }
        )

        assert registry.has("server-1")
        assert registry.has("server-2")

    def test_has_unregistered_server(self) -> None:
        """Test checking for unregistered server returns False."""
        registry = McpServerRegistry()
        assert not registry.has("nonexistent")

    def test_get_config_unregistered(self) -> None:
        """Test getting config for unregistered server returns None."""
        registry = McpServerRegistry()
        assert registry.get_config("nonexistent") is None

    def test_list_servers(self) -> None:
        """Test listing registered servers."""
        registry = McpServerRegistry()
        registry.register("server-a", {"url": "http://a.com/mcp"})
        registry.register("server-b", {"url": "http://b.com/mcp"})

        servers = registry.list_servers()
        assert "server-a" in servers
        assert "server-b" in servers

    def test_method_chaining(self) -> None:
        """Test that register methods support chaining."""
        registry = (
            McpServerRegistry()
            .register("server-1", {"url": "http://a.com/mcp"})
            .register("server-2", {"url": "http://b.com/mcp"})
        )

        assert registry.has("server-1")
        assert registry.has("server-2")


class TestMcpToolResolution:
    """Tests for MCP tool resolution in the adapter."""

    @pytest.fixture
    def mock_mcp_registry(self) -> McpServerRegistry:
        """Create a mock MCP registry with pre-configured tools."""
        registry = McpServerRegistry()
        registry.register("server-1", {"url": "http://localhost:8000/mcp"})

        # Mock the internal methods for testing
        async def mock_get_tool(server_name: str, tool_name: str) -> Tool[Any]:
            """Mock tool getter."""

            async def execute(**kwargs: Any) -> dict[str, Any]:
                return {"result": f"executed {tool_name}"}

            return Tool(
                function=execute,
                name=tool_name,
                description=f"Mock {tool_name} tool",
            )

        async def mock_get_all_tools(server_name: str) -> dict[str, Tool[Any]]:
            """Mock all tools getter."""

            async def execute_search(**kwargs: Any) -> dict[str, Any]:
                return {"result": "search results"}

            async def execute_fetch(**kwargs: Any) -> dict[str, Any]:
                return {"result": "fetched data"}

            return {
                "web-search": Tool(
                    function=execute_search,
                    name="web-search",
                    description="Search the web",
                ),
                "fetch": Tool(
                    function=execute_fetch,
                    name="fetch",
                    description="Fetch data",
                ),
            }

        registry.get_tool = mock_get_tool  # type: ignore[method-assign]
        registry.get_all_tools = mock_get_all_tools  # type: ignore[method-assign]

        return registry

    async def test_resolve_single_mcp_tool(
        self,
        mock_model_registry: PydanticAIModelRegistry,
        mock_mcp_registry: McpServerRegistry,
        mcp_text_ast: dict[str, Any],
    ) -> None:
        """Test resolving a single MCP tool from URI."""
        from agentmark.prompt_core import AgentMark

        adapter = PydanticAIAdapter(
            model_registry=mock_model_registry,
            mcp_registry=mock_mcp_registry,
        )

        am = AgentMark(adapter=adapter)
        prompt = await am.load_text_prompt(mcp_text_ast)
        result = await prompt.format(props={"userMessage": "Search for AI"})

        # Should have resolved the MCP tool
        tool_names = [t.name for t in result.tools]
        assert "search" in tool_names or "web-search" in tool_names

    async def test_resolve_mcp_wildcard(
        self,
        mock_model_registry: PydanticAIModelRegistry,
        mock_mcp_registry: McpServerRegistry,
    ) -> None:
        """Test resolving all tools from MCP server with wildcard."""
        adapter = PydanticAIAdapter(
            model_registry=mock_model_registry,
            mcp_registry=mock_mcp_registry,
        )

        # Test wildcard resolution directly
        tools = await adapter._resolve_mcp_tools("all", "mcp://server-1/*")

        assert len(tools) == 2
        tool_names = [t.name for t in tools]
        assert "web-search" in tool_names
        assert "fetch" in tool_names

    async def test_mcp_uri_without_registry_raises(
        self,
        mock_model_registry: PydanticAIModelRegistry,
        mcp_text_ast: dict[str, Any],
    ) -> None:
        """Test that MCP URI without registry raises error."""
        from agentmark.prompt_core import AgentMark

        # Adapter without MCP registry
        adapter = PydanticAIAdapter(model_registry=mock_model_registry)

        am = AgentMark(adapter=adapter)
        prompt = await am.load_text_prompt(mcp_text_ast)

        with pytest.raises(ValueError, match="no MCP registry configured"):
            await prompt.format(props={"userMessage": "test"})

    async def test_mcp_unregistered_server_raises(
        self,
        mock_model_registry: PydanticAIModelRegistry,
        mcp_text_ast: dict[str, Any],
    ) -> None:
        """Test that unregistered MCP server raises error."""
        from agentmark.prompt_core import AgentMark

        # Registry without the required server
        mcp_registry = McpServerRegistry()
        mcp_registry.register("other-server", {"url": "http://other.com/mcp"})

        adapter = PydanticAIAdapter(
            model_registry=mock_model_registry,
            mcp_registry=mcp_registry,
        )

        am = AgentMark(adapter=adapter)
        prompt = await am.load_text_prompt(mcp_text_ast)

        with pytest.raises(ValueError, match="server-1.*not registered"):
            await prompt.format(props={"userMessage": "test"})

    async def test_mixed_mcp_and_inline_tools(
        self,
        mock_model_registry: PydanticAIModelRegistry,
        mock_mcp_registry: McpServerRegistry,
        tool_registry: PydanticAIToolRegistry,
        mcp_text_ast: dict[str, Any],
    ) -> None:
        """Test mixing MCP tools with inline tool definitions."""
        from agentmark.prompt_core import AgentMark

        adapter = PydanticAIAdapter(
            model_registry=mock_model_registry,
            tool_registry=tool_registry,
            mcp_registry=mock_mcp_registry,
        )

        am = AgentMark(adapter=adapter)
        prompt = await am.load_text_prompt(mcp_text_ast)
        result = await prompt.format(props={"userMessage": "test"})

        # Should have both MCP and inline tools
        assert len(result.tools) >= 2
        tool_names = [t.name for t in result.tools]
        # MCP tool (either aliased as 'search' or original 'web-search')
        assert "search" in tool_names or "web-search" in tool_names
        # Inline tool
        assert "sum" in tool_names


class TestMcpUriParsing:
    """Tests for MCP URI parsing."""

    def test_parse_valid_uri(self) -> None:
        """Test parsing a valid MCP URI."""
        from agentmark.prompt_core.mcp import parse_mcp_uri

        result = parse_mcp_uri("mcp://server-1/tool-name")
        assert result["server"] == "server-1"
        assert result["tool"] == "tool-name"

    def test_parse_wildcard_uri(self) -> None:
        """Test parsing a wildcard MCP URI."""
        from agentmark.prompt_core.mcp import parse_mcp_uri

        result = parse_mcp_uri("mcp://server-1/*")
        assert result["server"] == "server-1"
        assert result["tool"] == "*"

    def test_parse_nested_tool_name(self) -> None:
        """Test parsing URI with nested tool path."""
        from agentmark.prompt_core.mcp import parse_mcp_uri

        result = parse_mcp_uri("mcp://server-1/tools/search")
        assert result["server"] == "server-1"
        assert result["tool"] == "tools/search"

    def test_invalid_uri_no_scheme(self) -> None:
        """Test that URI without mcp:// scheme raises error."""
        from agentmark.prompt_core.mcp import parse_mcp_uri

        with pytest.raises(ValueError, match="must start with 'mcp://'"):
            parse_mcp_uri("http://server/tool")

    def test_invalid_uri_no_tool(self) -> None:
        """Test that URI without tool part raises error."""
        from agentmark.prompt_core.mcp import parse_mcp_uri

        with pytest.raises(ValueError, match="tool part is empty"):
            parse_mcp_uri("mcp://server/")

    def test_invalid_uri_no_server(self) -> None:
        """Test that URI without server part raises error."""
        from agentmark.prompt_core.mcp import parse_mcp_uri

        with pytest.raises(ValueError, match="server part is empty"):
            parse_mcp_uri("mcp:///tool")
