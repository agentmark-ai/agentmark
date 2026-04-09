"""AgentMark Claude Agent SDK Adapter.

This package provides integration between AgentMark prompts and Claude Agent SDK
for agentic AI interactions in Python.

Example:
    from agentmark_claude_agent_sdk_v0 import (
        create_claude_agent_client,
        ClaudeAgentModelRegistry,
        ClaudeAgentAdapterOptions,
    )

    model_registry = ClaudeAgentModelRegistry()
    model_registry.register_providers({"anthropic": "anthropic"})

    client = create_claude_agent_client(
        model_registry=model_registry,
        adapter_options=ClaudeAgentAdapterOptions(
            permission_mode="bypassPermissions",
            max_turns=10,
        ),
    )

    # Load and format a prompt
    prompt = await client.load_text_prompt(ast)
    adapted = await prompt.format(props={"task": "Help me write code"})

    # Execute with Claude Agent SDK
    from claude_agent_sdk import query

    async for message in query(prompt=adapted.query.prompt, options=...):
        print(message)
"""

from __future__ import annotations

from importlib.metadata import version as _pkg_version
from typing import Any

# Import core classes
from .adapter import ClaudeAgentAdapter

# Import telemetry hooks
from .hooks import (
    TRACER_SCOPE_NAME,
    AgentMarkAttributes,
    GenAIAttributes,
    HookEventName,
    HooksConfig,
    SpanNames,
    # Telemetry hooks
    TelemetryEvent,
    TelemetryEventHandler,
    create_telemetry_hooks,
    merge_hooks,
)
from .model_registry import (
    ClaudeAgentModelRegistry,
)

# Import webhook server
from .server import create_webhook_server

# Import tracing wrapper
from .traced import generate_fallback_trace_id, traced_query

# Import types
from .types import (
    ClaudeAgentAdapterOptions,
    ClaudeAgentErrorResult,
    ClaudeAgentObjectParams,
    ClaudeAgentQueryOptions,
    ClaudeAgentQueryParams,
    ClaudeAgentResult,
    # Core types
    ClaudeAgentTextParams,
    HookCallback,
    # Hook types
    HookInput,
    HookOutput,
    # MCP types
    McpServerConfig,
    # Model types
    ModelConfig,
    OutputFormat,
    # Permission and output types
    PermissionMode,
    SystemPromptPreset,
    # Telemetry types
    TelemetryConfig,
    TracedTelemetryContext,
    # Type guards for hook input
    is_post_tool_use_failure_input,
    is_post_tool_use_input,
    is_pre_tool_use_input,
    is_stop_input,
    is_subagent_start_input,
    is_subagent_stop_input,
    is_user_prompt_submit_input,
)

# Import webhook handler
from .webhook import (
    ClaudeAgentWebhookHandler,
    ExperimentResult,
    StreamingResult,
    WebhookResult,
)


def create_claude_agent_client(
    model_registry: ClaudeAgentModelRegistry,
    mcp_servers: dict[str, Any] | None = None,
    adapter_options: ClaudeAgentAdapterOptions | None = None,
    eval_registry: Any | None = None,
    loader: Any | None = None,
) -> Any:
    """Create an AgentMark client configured for Claude Agent SDK.

    This is the main entry point for using AgentMark with Claude Agent SDK.

    A model_registry must be provided — there are no defaults. Register
    providers explicitly to control how model names in prompt files resolve.

    Args:
        model_registry: Model registry for model configuration.
            Register providers before passing in.
        mcp_servers: Optional MCP servers configuration (native SDK format).
        adapter_options: Optional adapter-level options.
        eval_registry: Optional evaluation registry.
        loader: Optional prompt loader.

    Returns:
        Configured AgentMark client.

    Example:
        model_registry = ClaudeAgentModelRegistry()
        model_registry.register_providers({"anthropic": "anthropic"})

        client = create_claude_agent_client(
            model_registry=model_registry,
            adapter_options=ClaudeAgentAdapterOptions(
                permission_mode="bypassPermissions",
                max_turns=10,
            ),
        )

        # Load and format a prompt
        prompt = await client.load_text_prompt(ast)
        adapted = await prompt.format(props={"task": "Help me write code"})

        # Execute with Claude Agent SDK
        from claude_agent_sdk import query

        async for message in query(prompt=adapted.query.prompt, options=...):
            print(message)
    """
    # Import AgentMark from prompt-core
    try:
        from agentmark_prompt_core import AgentMark
    except ImportError:
        raise ImportError(
            "agentmark-prompt-core is required. Install with: pip install agentmark-prompt-core"
        ) from None

    adapter = ClaudeAgentAdapter(
        model_registry=model_registry,
        mcp_servers=mcp_servers,
        adapter_options=adapter_options,
    )

    return AgentMark(
        adapter=adapter,
        loader=loader,
        eval_registry=eval_registry,
    )


__all__ = [
    # Version
    "__version__",
    # Factory function
    "create_claude_agent_client",
    # Core classes
    "ClaudeAgentAdapter",
    "ClaudeAgentModelRegistry",
    # Core types
    "ClaudeAgentTextParams",
    "ClaudeAgentObjectParams",
    "ClaudeAgentQueryParams",
    "ClaudeAgentQueryOptions",
    "ClaudeAgentAdapterOptions",
    "ClaudeAgentResult",
    "ClaudeAgentErrorResult",
    "TracedTelemetryContext",
    # Model types
    "ModelConfig",
    # Permission and output types
    "PermissionMode",
    "SystemPromptPreset",
    "OutputFormat",
    # Hook types
    "HookInput",
    "HookOutput",
    "HookCallback",
    # Type guards for hook input
    "is_user_prompt_submit_input",
    "is_pre_tool_use_input",
    "is_post_tool_use_input",
    "is_post_tool_use_failure_input",
    "is_stop_input",
    "is_subagent_start_input",
    "is_subagent_stop_input",
    # Telemetry config types
    "TelemetryConfig",
    # MCP types
    "McpServerConfig",
    # Telemetry hooks
    "TelemetryEvent",
    "TelemetryEventHandler",
    "HooksConfig",
    "HookEventName",
    "create_telemetry_hooks",
    "merge_hooks",
    # OTEL constants
    "GenAIAttributes",
    "AgentMarkAttributes",
    "SpanNames",
    "TRACER_SCOPE_NAME",
    # Webhook server
    "create_webhook_server",
    # Tracing wrapper
    "traced_query",
    # Webhook handler
    "ClaudeAgentWebhookHandler",
    "WebhookResult",
    "StreamingResult",
    "ExperimentResult",
    "generate_fallback_trace_id",
]

# Read runtime __version__ from installed dist metadata to prevent drift
# against pyproject.toml across releases. See pydantic-ai-v0-adapter for
# the same pattern and rationale.
__version__ = _pkg_version("agentmark-claude-agent-sdk-v0")
