"""Type definitions for Claude Agent SDK adapter.

Ported from TypeScript: packages/claude-agent-sdk-adapter/src/types.ts
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Generic, Literal, TypeVar

T = TypeVar("T")

# Permission modes for Claude Agent SDK
PermissionMode = Literal["default", "acceptEdits", "bypassPermissions", "plan"]


@dataclass
class TracedTelemetryContext:
    """Telemetry context passed from adapter to withTracing() wrapper.

    Only populated when telemetry is enabled in adapter options.
    """

    is_enabled: bool
    """Whether telemetry is enabled."""

    prompt_name: str
    """Prompt name for span naming and attributes."""

    system_prompt: str | None = None
    """System prompt (for gen_ai.system_prompt attribute)."""

    model: str | None = None
    """Model name."""

    props: dict[str, Any] | None = None
    """Props passed to the prompt template."""

    meta: dict[str, Any] | None = None
    """Additional metadata from the prompt frontmatter."""

    metadata: dict[str, Any] | None = None
    """Custom metadata passed via telemetry options (appears as agentmark.metadata.* attributes)."""

    dataset_run_id: str | None = None
    """Dataset run ID for experiment tracking."""

    dataset_run_name: str | None = None
    """Dataset run name for experiment tracking."""

    dataset_item_name: str | None = None
    """Dataset item name/index for experiment tracking."""

    dataset_expected_output: str | None = None
    """Expected output for dataset item."""

    dataset_path: str | None = None
    """Path to the dataset file."""


@dataclass
class SystemPromptPreset:
    """System prompt preset configuration."""

    type: Literal["preset"] = "preset"
    preset: Literal["claude_code"] = "claude_code"
    append: str | None = None


@dataclass
class OutputFormat:
    """Structured output format configuration."""

    type: Literal["json_schema"] = "json_schema"
    schema: dict[str, Any] = field(default_factory=dict)


@dataclass
class ClaudeAgentQueryOptions:
    """Query options for Claude Agent SDK."""

    model: str | None = None
    """Model to use (e.g., 'claude-sonnet-4-20250514')."""

    max_thinking_tokens: int | None = None
    """Maximum thinking tokens for extended thinking."""

    max_turns: int | None = None
    """Maximum conversation turns."""

    max_budget_usd: float | None = None
    """Maximum budget in USD."""

    permission_mode: PermissionMode | None = None
    """Permission mode for tool access."""

    cwd: str | None = None
    """Working directory."""

    system_prompt: str | SystemPromptPreset | None = None
    """System prompt configuration."""

    allowed_tools: list[str] | None = None
    """Allowed tools."""

    disallowed_tools: list[str] | None = None
    """Disallowed tools."""

    mcp_servers: dict[str, Any] | None = None
    """MCP servers configuration."""

    hooks: dict[str, list[dict[str, Any]]] | None = None
    """Hook callbacks for telemetry - array of matchers per event."""

    output_format: OutputFormat | None = None
    """Structured output format."""


@dataclass
class ClaudeAgentQueryParams:
    """Query parameters for Claude Agent SDK."""

    prompt: str
    """The prompt string to send to the agent."""

    options: ClaudeAgentQueryOptions
    """Claude Agent SDK query options."""


@dataclass
class ClaudeAgentTextParams:
    """Configuration returned by adaptText for Claude Agent SDK."""

    query: ClaudeAgentQueryParams
    """Query parameters for Claude Agent SDK."""

    messages: list[Any]
    """Original messages for reference."""

    telemetry: TracedTelemetryContext | None = None
    """Telemetry context for withTracing() wrapper (only present if telemetry enabled)."""

    prompt_name: str | None = None
    """Prompt name from metadata."""

    agentmark_meta: dict[str, Any] | None = None
    """AgentMark metadata from frontmatter."""

    _raw_messages: list[Any] = field(default_factory=list, repr=False)
    """Raw messages before processing."""


@dataclass
class ClaudeAgentObjectParams(Generic[T]):
    """Configuration returned by adaptObject for structured output."""

    query: ClaudeAgentQueryParams
    """Query parameters for Claude Agent SDK."""

    messages: list[Any]
    """Original messages for reference."""

    output_schema: dict[str, Any] = field(default_factory=dict)
    """JSON schema for structured output."""

    telemetry: TracedTelemetryContext | None = None
    """Telemetry context for withTracing() wrapper (only present if telemetry enabled)."""

    prompt_name: str | None = None
    """Prompt name from metadata."""

    agentmark_meta: dict[str, Any] | None = None
    """AgentMark metadata from frontmatter."""

    _raw_messages: list[Any] = field(default_factory=list, repr=False)
    """Raw messages before processing."""

    _output_type: T | None = None
    """Schema type marker."""


@dataclass
class HookInput:
    """Hook input data."""

    hook_event_name: str
    session_id: str
    transcript_path: str | None = None
    cwd: str | None = None
    tool_name: str | None = None
    tool_input: Any | None = None
    tool_response: Any | None = None
    error: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class HookSpecificOutput:
    """Hook-specific output for controlling SDK behavior."""

    hook_event_name: str
    permission_decision: Literal["allow", "deny", "ask"] | None = None
    permission_decision_reason: str | None = None
    updated_input: dict[str, Any] | None = None
    additional_context: str | None = None


@dataclass
class HookOutput:
    """Hook output for controlling SDK behavior."""

    continue_: bool = True  # 'continue' is a Python keyword
    suppress_output: bool = False
    system_message: str | None = None
    hook_specific_output: HookSpecificOutput | None = None


# Hook callback function type
HookCallback = Callable[
    [dict[str, Any], str | None, dict[str, Any]],
    Awaitable[dict[str, Any]],
]


@dataclass
class HookCallbackMatcher:
    """Hook callback matcher - matches SDK's HookCallbackMatcher type."""

    hooks: list[HookCallback]
    """Array of hook callbacks."""

    matcher: str | None = None
    """Optional matcher pattern."""

    timeout: int | None = None
    """Timeout in seconds for all hooks in this matcher."""


@dataclass
class ClaudeAgentAdapterOptions:
    """Adapter-level options for ClaudeAgentAdapter."""

    permission_mode: PermissionMode | None = None
    """Permission mode for tool access (default: 'default')."""

    cwd: str | None = None
    """Working directory for the agent."""

    max_turns: int | None = None
    """Maximum conversation turns."""

    max_budget_usd: float | None = None
    """Maximum budget in USD."""

    system_prompt_preset: bool = False
    """Use Claude Code's built-in system prompt preset."""

    allowed_tools: list[str] | None = None
    """Allowed tools (whitelist)."""

    disallowed_tools: list[str] | None = None
    """Disallowed tools (blacklist)."""


# Tool function types
ToolFunction = Callable[[dict[str, Any], dict[str, Any] | None], Any]
AsyncToolFunction = Callable[[dict[str, Any], dict[str, Any] | None], Awaitable[Any]]


@dataclass
class AgentMarkToolDefinition:
    """Tool definition for AgentMark tools to be bridged to MCP."""

    name: str
    """Tool name."""

    description: str
    """Tool description."""

    parameters: dict[str, Any]
    """JSON Schema for parameters."""

    execute: ToolFunction | AsyncToolFunction
    """Tool execution function."""


@dataclass
class ClaudeAgentResult:
    """Result from Claude Agent SDK execution."""

    type: Literal["success", "error"]
    session_id: str
    usage: dict[str, int]
    total_cost_usd: float
    duration_ms: int
    result: str | None = None
    structured_output: Any | None = None
    errors: list[str] | None = None


@dataclass
class ModelConfig:
    """Model configuration returned by registry."""

    model: str
    """Model name to use."""

    max_thinking_tokens: int | None = None
    """Maximum thinking tokens for extended thinking models."""


# Model configuration creator function type
ModelConfigCreator = Callable[[str, dict[str, Any] | None], ModelConfig]


@dataclass
class TelemetryConfig:
    """Telemetry configuration for hooks."""

    is_enabled: bool
    prompt_name: str
    props: dict[str, Any]
    function_id: str | None = None
    metadata: dict[str, Any] | None = None


@dataclass
class OtelHooksConfig:
    """Configuration for OpenTelemetry hooks.

    By default, uses the global tracer from AgentMarkSDK.initialize().
    Optionally accepts a custom TracerProvider.
    """

    prompt_name: str
    """Prompt name for correlation (appears in agentmark.prompt_name attribute)."""

    tracer_provider: Any | None = None
    """Optional TracerProvider instance.
    If not provided, uses the global tracer from AgentMarkSDK.initialize()."""

    model: str | None = None
    """Model name being used (appears in gen_ai.request.model attribute)."""

    user_id: str | None = None
    """User ID for correlation (appears in agentmark.user_id attribute)."""

    user_prompt: str | None = None
    """User's input prompt (appears in gen_ai.request.input attribute)."""

    props: dict[str, Any] | None = None
    """Props passed to the prompt template (appears in agentmark.props attribute)."""

    agentmark_meta: dict[str, Any] | None = None
    """Additional metadata from the prompt frontmatter (appears in agentmark.meta attribute)."""

    additional_attributes: dict[str, str | int | bool] | None = None
    """Additional attributes to include on all spans."""


@dataclass
class TelemetryContext:
    """Context for maintaining span hierarchy across hook callbacks.

    This allows tool spans to be created as children of the session span.
    """

    root_span: Any | None = None
    """Root session span."""

    active_tool_spans: dict[str, Any] = field(default_factory=dict)
    """Active tool spans keyed by tool_use_id."""

    active_subagent_spans: dict[str, Any] = field(default_factory=dict)
    """Active subagent spans keyed by session_id."""

    tracer: Any | None = None
    """OpenTelemetry Tracer instance."""

    config: OtelHooksConfig | None = None
    """Configuration reference."""


@dataclass
class OtelHooksResult:
    """Result from create_otel_hooks."""

    hooks: dict[str, list[dict[str, Any]]]
    """Hook callbacks organized by event type."""

    context: TelemetryContext | None
    """Telemetry context for span management."""


@dataclass
class TelemetryEvent:
    """Telemetry event emitted by hooks."""

    event_name: str = field(metadata={"alias": "eventName"})
    """Event name."""

    session_id: str = field(metadata={"alias": "sessionId"})
    """Session ID."""

    prompt_name: str = field(metadata={"alias": "promptName"})
    """Prompt name."""

    timestamp: int
    """Event timestamp in milliseconds."""

    data: dict[str, Any] = field(default_factory=dict)
    """Event-specific data."""


# MCP Server configuration types
@dataclass
class McpServerConfig:
    """MCP server configuration."""

    name: str
    """Server name."""

    version: str = "1.0.0"
    """Server version."""

    tools: list[AgentMarkToolDefinition] = field(default_factory=list)
    """Tools provided by the server."""
