"""MCP (Model Context Protocol) utilities."""

import os
import re
from typing import Any, TypedDict

ENV_PATTERN = re.compile(r'^env\([\'"]([A-Z0-9_]+)[\'"]\)$')


class McpUrlServerConfig(TypedDict, total=False):
    """MCP URL server configuration."""

    url: str
    headers: dict[str, str] | None


class McpStdioServerConfig(TypedDict, total=False):
    """MCP stdio server configuration."""

    command: str
    args: list[str]
    cwd: str
    env: dict[str, str]


McpServerConfig = McpUrlServerConfig | McpStdioServerConfig
McpServers = dict[str, McpServerConfig]


class InlineToolDefinition(TypedDict):
    """Inline tool definition."""

    description: str
    parameters: dict[str, Any]


class NormalizedTool(TypedDict):
    """Normalized tool entry."""

    alias: str
    kind: str  # "mcp" | "inline"
    value: str | InlineToolDefinition


def parse_mcp_uri(uri: str) -> dict[str, str]:
    """Parse an MCP URI into server and tool parts.

    Args:
        uri: MCP URI in format "mcp://{server}/{tool}"

    Returns:
        Dict with 'server' and 'tool' keys

    Raises:
        ValueError: If URI is invalid
    """
    if not isinstance(uri, str) or not uri.startswith("mcp://"):
        raise ValueError("Invalid MCP URI: must start with 'mcp://'")

    without_scheme = uri[len("mcp://") :]
    first_slash = without_scheme.find("/")
    if first_slash == -1:
        raise ValueError("Invalid MCP URI: expected 'mcp://{server}/{tool}'")

    server = without_scheme[:first_slash].strip()
    tool = without_scheme[first_slash + 1 :].strip()

    if not server:
        raise ValueError("Invalid MCP URI: server part is empty")
    if not tool:
        raise ValueError("Invalid MCP URI: tool part is empty")

    return {"server": server, "tool": tool}


def interpolate_env_in_object(input_obj: Any, strict: bool = True) -> Any:
    """Recursively interpolate env('VAR') patterns in objects.

    Args:
        input_obj: Object to process
        strict: If True, raise error for missing env vars

    Returns:
        Object with env vars interpolated

    Raises:
        ValueError: If strict and env var is missing
    """

    def visit(value: Any) -> Any:
        if isinstance(value, str):
            match = ENV_PATTERN.match(value)
            if match:
                var_name = match.group(1)
                env_value = os.environ.get(var_name)
                if env_value is None:
                    if strict:
                        raise ValueError(f"Missing environment variable: {var_name}")
                    return value
                return env_value
            return value

        if isinstance(value, list):
            return [visit(item) for item in value]

        if isinstance(value, dict):
            return {k: visit(v) for k, v in value.items()}

        return value

    return visit(input_obj)


def normalize_tools_map(
    tools: dict[str, str | InlineToolDefinition] | None,
) -> list[NormalizedTool]:
    """Normalize a tools map to a list of NormalizedTool.

    Args:
        tools: Dict mapping alias to MCP URI string or inline tool definition

    Returns:
        List of normalized tool entries

    Raises:
        ValueError: If tool entry is invalid
    """
    result: list[NormalizedTool] = []

    for alias, value in (tools or {}).items():
        if isinstance(value, str):
            result.append({"alias": alias, "kind": "mcp", "value": value})
        elif (
            isinstance(value, dict)
            and isinstance(value.get("description"), str)
            and value.get("parameters") is not None
        ):
            inline_def = InlineToolDefinition(
                description=value["description"],
                parameters=value["parameters"],
            )
            result.append({"alias": alias, "kind": "inline", "value": inline_def})
        else:
            raise ValueError(
                f"Invalid tool entry for alias '{alias}': "
                "expected MCP URI string or inline tool definition"
            )

    return result
