"""AgentMark Claude Agent SDK Adapter.

This package provides integration between AgentMark prompts and Claude Agent SDK
for agentic AI interactions in Python.

Example:
    from agentmark_claude_agent_sdk import (
        create_claude_agent_client,
        ClaudeAgentModelRegistry,
        ClaudeAgentAdapterOptions,
    )

    client = create_claude_agent_client(
        model_registry=ClaudeAgentModelRegistry.create_default(),
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

from typing import Any

__version__ = "0.0.0"

# Import core classes
from .adapter import ClaudeAgentAdapter

# Import telemetry hooks
from .hooks import (
    TRACER_SCOPE_NAME,
    AgentMarkAttributes,
    GenAIAttributes,
    HookEventName,
    HooksConfig,
    # OTEL hooks
    OtelHooksResult,
    SpanNames,
    SpanStatusCode,
    # Telemetry hooks
    TelemetryEvent,
    TelemetryEventHandler,
    combine_with_otel_hooks,
    complete_session,
    create_otel_hooks,
    create_telemetry_hooks,
    merge_hooks,
)

# Import MCP bridge utilities
from .mcp import (
    create_agentmark_mcp_server,
    has_tools,
    to_claude_agent_mcp_server,
)
from .model_registry import (
    ClaudeAgentModelRegistry,
    create_default_model_registry,
)
from .tool_registry import (
    ClaudeAgentToolRegistry,
    RegisteredToolExecutor,
)

# Import types
from .types import (
    AgentMarkToolDefinition,
    ClaudeAgentAdapterOptions,
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
    # Model/tool types
    ModelConfig,
    OtelHooksConfig,
    OutputFormat,
    # Permission and output types
    PermissionMode,
    SystemPromptPreset,
    # Telemetry types
    TelemetryConfig,
    TelemetryContext,
    TracedTelemetryContext,
)

# Import webhook handler
from .webhook import (
    ClaudeAgentWebhookHandler,
    ExperimentResult,
    StreamingResult,
    WebhookResult,
    generate_fallback_trace_id,
)


def create_claude_agent_client(
    model_registry: ClaudeAgentModelRegistry | None = None,
    tool_registry: ClaudeAgentToolRegistry | None = None,
    adapter_options: ClaudeAgentAdapterOptions | None = None,
    eval_registry: Any | None = None,
    loader: Any | None = None,
) -> Any:
    """Create an AgentMark client configured for Claude Agent SDK.

    This is the main entry point for using AgentMark with Claude Agent SDK.

    Args:
        model_registry: Model registry for model configuration.
            Defaults to create_default_model_registry().
        tool_registry: Optional tool registry for custom tools.
        adapter_options: Optional adapter-level options.
        eval_registry: Optional evaluation registry.
        loader: Optional prompt loader.

    Returns:
        Configured AgentMark client.

    Example:
        client = create_claude_agent_client(
            model_registry=ClaudeAgentModelRegistry.create_default(),
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
        )

    if model_registry is None:
        model_registry = create_default_model_registry()

    adapter = ClaudeAgentAdapter(
        model_registry=model_registry,
        tool_registry=tool_registry,
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
    "create_default_model_registry",
    "ClaudeAgentToolRegistry",
    "RegisteredToolExecutor",
    # Core types
    "ClaudeAgentTextParams",
    "ClaudeAgentObjectParams",
    "ClaudeAgentQueryParams",
    "ClaudeAgentQueryOptions",
    "ClaudeAgentAdapterOptions",
    "ClaudeAgentResult",
    "TracedTelemetryContext",
    # Model/tool types
    "ModelConfig",
    "AgentMarkToolDefinition",
    # Permission and output types
    "PermissionMode",
    "SystemPromptPreset",
    "OutputFormat",
    # Hook types
    "HookInput",
    "HookOutput",
    "HookCallback",
    # Telemetry config types
    "TelemetryConfig",
    "OtelHooksConfig",
    "TelemetryContext",
    # MCP types
    "McpServerConfig",
    # MCP bridge utilities
    "create_agentmark_mcp_server",
    "to_claude_agent_mcp_server",
    "has_tools",
    # Telemetry hooks
    "TelemetryEvent",
    "TelemetryEventHandler",
    "HooksConfig",
    "HookEventName",
    "create_telemetry_hooks",
    "merge_hooks",
    # OTEL hooks
    "OtelHooksResult",
    "GenAIAttributes",
    "AgentMarkAttributes",
    "SpanNames",
    "SpanStatusCode",
    "create_otel_hooks",
    "complete_session",
    "combine_with_otel_hooks",
    "TRACER_SCOPE_NAME",
    # Webhook handler
    "ClaudeAgentWebhookHandler",
    "WebhookResult",
    "StreamingResult",
    "ExperimentResult",
    "generate_fallback_trace_id",
]
