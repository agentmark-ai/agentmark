"""Tests for MCP utilities."""

import os

import pytest

from agentmark.prompt_core.mcp import (
    interpolate_env_in_object,
    normalize_tools_map,
    parse_mcp_uri,
)


class TestParseMcpUri:
    """Tests for parse_mcp_uri."""

    def test_valid_uri(self) -> None:
        """Test parsing a valid MCP URI."""
        result = parse_mcp_uri("mcp://server/tool")
        assert result == {"server": "server", "tool": "tool"}

    def test_valid_uri_with_slashes(self) -> None:
        """Test parsing a URI with slashes in tool name."""
        result = parse_mcp_uri("mcp://myserver/tools/search")
        assert result == {"server": "myserver", "tool": "tools/search"}

    def test_invalid_not_string(self) -> None:
        """Test with non-string input."""
        with pytest.raises(ValueError, match="must start with 'mcp://'"):
            parse_mcp_uri(123)  # type: ignore[arg-type]

    def test_invalid_wrong_scheme(self) -> None:
        """Test with wrong scheme."""
        with pytest.raises(ValueError, match="must start with 'mcp://'"):
            parse_mcp_uri("http://server/tool")

    def test_invalid_no_slash(self) -> None:
        """Test with no slash after server."""
        with pytest.raises(ValueError, match="expected 'mcp://\\{server\\}/\\{tool\\}'"):
            parse_mcp_uri("mcp://server")

    def test_invalid_empty_server(self) -> None:
        """Test with empty server."""
        with pytest.raises(ValueError, match="server part is empty"):
            parse_mcp_uri("mcp:///tool")

    def test_invalid_empty_tool(self) -> None:
        """Test with empty tool."""
        with pytest.raises(ValueError, match="tool part is empty"):
            parse_mcp_uri("mcp://server/")


class TestInterpolateEnvInObject:
    """Tests for interpolate_env_in_object."""

    def test_simple_string(self) -> None:
        """Test with simple string (no env var)."""
        result = interpolate_env_in_object("hello")
        assert result == "hello"

    def test_env_var_present(self) -> None:
        """Test with env var that exists."""
        os.environ["TEST_VAR"] = "test_value"
        try:
            result = interpolate_env_in_object("env('TEST_VAR')")
            assert result == "test_value"
        finally:
            del os.environ["TEST_VAR"]

    def test_env_var_missing_strict(self) -> None:
        """Test with missing env var in strict mode."""
        if "MISSING_VAR" in os.environ:
            del os.environ["MISSING_VAR"]

        with pytest.raises(ValueError, match="Missing environment variable: MISSING_VAR"):
            interpolate_env_in_object("env('MISSING_VAR')", strict=True)

    def test_env_var_missing_non_strict(self) -> None:
        """Test with missing env var in non-strict mode."""
        if "MISSING_VAR" in os.environ:
            del os.environ["MISSING_VAR"]

        result = interpolate_env_in_object("env('MISSING_VAR')", strict=False)
        assert result == "env('MISSING_VAR')"

    def test_nested_dict(self) -> None:
        """Test with nested dict."""
        os.environ["TEST_KEY"] = "secret"
        try:
            input_obj = {
                "outer": {
                    "inner": "env('TEST_KEY')",
                    "normal": "value",
                }
            }
            result = interpolate_env_in_object(input_obj)
            assert result == {"outer": {"inner": "secret", "normal": "value"}}
        finally:
            del os.environ["TEST_KEY"]

    def test_list(self) -> None:
        """Test with list."""
        os.environ["TEST_ITEM"] = "item_value"
        try:
            input_obj = ["env('TEST_ITEM')", "normal"]
            result = interpolate_env_in_object(input_obj)
            assert result == ["item_value", "normal"]
        finally:
            del os.environ["TEST_ITEM"]

    def test_non_string_passthrough(self) -> None:
        """Test that non-strings pass through unchanged."""
        input_obj = {"num": 42, "bool": True, "none": None}
        result = interpolate_env_in_object(input_obj)
        assert result == input_obj


class TestNormalizeToolsMap:
    """Tests for normalize_tools_map."""

    def test_empty_input(self) -> None:
        """Test with empty/None input."""
        assert normalize_tools_map(None) == []
        assert normalize_tools_map({}) == []

    def test_mcp_uri_string(self) -> None:
        """Test with MCP URI string."""
        tools = {"search": "mcp://server/search"}
        result = normalize_tools_map(tools)
        assert result == [{"alias": "search", "kind": "mcp", "value": "mcp://server/search"}]

    def test_inline_tool_definition(self) -> None:
        """Test with inline tool definition."""
        tools = {
            "custom": {
                "description": "A custom tool",
                "parameters": {"type": "object"},
            }
        }
        result = normalize_tools_map(tools)
        assert len(result) == 1
        assert result[0]["alias"] == "custom"
        assert result[0]["kind"] == "inline"
        assert result[0]["value"]["description"] == "A custom tool"

    def test_mixed_tools(self) -> None:
        """Test with mixed tool types."""
        tools = {
            "search": "mcp://server/search",
            "custom": {
                "description": "A custom tool",
                "parameters": {"type": "object"},
            },
        }
        result = normalize_tools_map(tools)
        assert len(result) == 2

        mcp_tool = next(t for t in result if t["alias"] == "search")
        assert mcp_tool["kind"] == "mcp"

        inline_tool = next(t for t in result if t["alias"] == "custom")
        assert inline_tool["kind"] == "inline"

    def test_invalid_tool_entry(self) -> None:
        """Test with invalid tool entry."""
        tools = {"bad": {"invalid": "structure"}}
        with pytest.raises(ValueError, match="Invalid tool entry"):
            normalize_tools_map(tools)  # type: ignore[arg-type]
