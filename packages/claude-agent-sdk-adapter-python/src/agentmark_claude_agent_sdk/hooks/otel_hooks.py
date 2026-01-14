"""OpenTelemetry hooks for Claude Agent SDK adapter.

Emits spans following GenAI semantic conventions.

Architecture inspired by claude_telemetry:
- UserPromptSubmit: Creates parent session span with user input
- PreToolUse/PostToolUse: Creates child tool spans
- Stop: Completes session span (since SessionEnd doesn't fire)

See: https://opentelemetry.io/docs/specs/semconv/gen-ai/
See: https://github.com/TechNickAI/claude_telemetry

Ported from TypeScript: packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from ..types import OtelHooksConfig, TelemetryContext
from .telemetry_hooks import HooksConfig

# Re-export types for convenience
__all__ = [
    # Re-exported from types
    "OtelHooksConfig",
    "TelemetryContext",
    # Constants
    "TRACER_SCOPE_NAME",
    # Classes
    "SpanStatusCode",
    "GenAIAttributes",
    "AgentMarkAttributes",
    "SpanNames",
    "OtelHooksResult",
    # Functions
    "create_otel_hooks",
    "complete_session",
    "combine_with_otel_hooks",
]

# The instrumentation scope name used for all AgentMark spans.
# This scope name is registered in the normalizer for proper span transformation.
TRACER_SCOPE_NAME = "agentmark"


# SpanStatusCode values from @opentelemetry/api
class SpanStatusCode:
    """OpenTelemetry span status codes."""

    UNSET = 0
    OK = 1
    ERROR = 2


class GenAIAttributes:
    """OpenTelemetry GenAI Semantic Convention attribute names.

    See: https://opentelemetry.io/docs/specs/semconv/gen-ai/
    """

    SYSTEM = "gen_ai.system"
    """AI system identifier (e.g., 'anthropic')."""

    REQUEST_MODEL = "gen_ai.request.model"
    """Requested model name."""

    REQUEST_MAX_TOKENS = "gen_ai.request.max_tokens"
    """Maximum tokens requested."""

    REQUEST_TEMPERATURE = "gen_ai.request.temperature"
    """Temperature setting."""

    RESPONSE_ID = "gen_ai.response.id"
    """Response identifier."""

    RESPONSE_MODEL = "gen_ai.response.model"
    """Model that actually responded."""

    RESPONSE_FINISH_REASONS = "gen_ai.response.finish_reasons"
    """Completion finish reasons (JSON array)."""

    USAGE_INPUT_TOKENS = "gen_ai.usage.input_tokens"
    """Input token count."""

    USAGE_OUTPUT_TOKENS = "gen_ai.usage.output_tokens"
    """Output token count."""

    TOOL_NAME = "gen_ai.tool.name"
    """Tool name."""

    TOOL_CALL_ID = "gen_ai.tool.call.id"
    """Tool call identifier."""

    REQUEST_INPUT = "gen_ai.request.input"
    """User input prompt."""

    RESPONSE_OUTPUT = "gen_ai.response.output"
    """Agent response output."""

    TOOL_INPUT = "gen_ai.tool.input"
    """Tool input."""

    TOOL_OUTPUT = "gen_ai.tool.output"
    """Tool output."""


class AgentMarkAttributes:
    """AgentMark-specific span attribute names for correlation."""

    PROMPT_NAME = "agentmark.prompt_name"
    """AgentMark prompt identifier."""

    SESSION_ID = "agentmark.session_id"
    """Session correlation ID."""

    USER_ID = "agentmark.user_id"
    """User correlation ID."""

    FUNCTION_ID = "agentmark.function_id"
    """Function identifier."""

    SUBAGENT_TYPE = "agentmark.subagent_type"
    """Subagent type."""

    AGENT_ID = "agentmark.agent_id"
    """Agent ID."""

    PROPS = "agentmark.props"
    """Props passed to the prompt template (JSON stringified)."""

    META = "agentmark.meta"
    """Additional metadata from the prompt frontmatter (JSON stringified)."""


class SpanNames:
    """Standard span names following OTEL GenAI conventions."""

    SESSION = "gen_ai.session"
    """Root session span."""

    TOOL_CALL = "gen_ai.tool.call"
    """Tool invocation span."""

    SUBAGENT = "gen_ai.subagent"
    """Subagent execution span."""


@dataclass
class OtelHooksResult:
    """Result from create_otel_hooks."""

    hooks: HooksConfig
    """Hook callbacks organized by event type."""

    context: TelemetryContext | None
    """Telemetry context for span management."""


def _get_otel_api() -> Any | None:
    """Get the OpenTelemetry API.

    Returns None if opentelemetry-api is not available.
    """
    try:
        from opentelemetry import context, trace

        return {"trace": trace, "context": context}
    except ImportError:
        return None


def _get_global_tracer() -> Any | None:
    """Get the OpenTelemetry tracer from the global provider.

    Returns None if opentelemetry-api is not available or not initialized.
    """
    api = _get_otel_api()
    if not api:
        return None
    return api["trace"].get_tracer(TRACER_SCOPE_NAME)


def _get_common_attributes(
    config: OtelHooksConfig, session_id: str | None = None
) -> dict[str, str | int | bool]:
    """Get common attributes for all spans."""
    attrs: dict[str, str | int | bool] = {
        GenAIAttributes.SYSTEM: "anthropic",
        AgentMarkAttributes.PROMPT_NAME: config.prompt_name,
    }

    if config.model:
        attrs[GenAIAttributes.REQUEST_MODEL] = config.model

    if session_id:
        attrs[AgentMarkAttributes.SESSION_ID] = session_id

    if config.user_id:
        attrs[AgentMarkAttributes.USER_ID] = config.user_id

    if config.additional_attributes:
        attrs.update(config.additional_attributes)

    return attrs


def create_otel_hooks(config: OtelHooksConfig) -> OtelHooksResult:
    """Create OpenTelemetry hooks for Claude Agent SDK that emit spans
    following GenAI semantic conventions.

    Architecture:
    - UserPromptSubmit: Creates parent session span with user input
    - PreToolUse/PostToolUse: Creates child tool spans under session
    - SubagentStart/SubagentStop: Creates subagent spans
    - Stop: Completes session span with final metrics

    Args:
        config: OTEL hooks configuration.

    Returns:
        Hook configuration and telemetry context, or empty hooks if OTEL not available.

    Example:
        result = create_otel_hooks(OtelHooksConfig(
            prompt_name="my-agent-task",
            model="claude-sonnet-4-20250514",
            user_id="user-123",
            user_prompt="Help me with this task",
        ))
        hooks = result.hooks
        context = result.context

        # Execute query with hooks
        result = await query(prompt, options={"hooks": hooks})

        # After query completes, finalize with result
        if context:
            complete_session(context, result)
    """
    api = _get_otel_api()
    if not api:
        return OtelHooksResult(hooks={}, context=None)

    tracer = None

    if config.tracer_provider is not None:
        # Use provided TracerProvider
        tracer = config.tracer_provider.get_tracer(TRACER_SCOPE_NAME)
    else:
        # Use global tracer
        tracer = _get_global_tracer()

    if tracer is None:
        return OtelHooksResult(hooks={}, context=None)

    ctx = TelemetryContext(
        root_span=None,
        active_tool_spans={},
        active_subagent_spans={},
        tracer=tracer,
        config=config,
    )
    parent_context: Any = None

    async def user_prompt_submit_hook(
        input_data: dict[str, Any],
        _tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        nonlocal parent_context

        attributes = _get_common_attributes(config, input_data.get("session_id"))

        # Add user prompt if available
        user_prompt = input_data.get("prompt") or config.user_prompt
        if user_prompt:
            attributes[GenAIAttributes.REQUEST_INPUT] = str(user_prompt)

        # Create session span with prompt preview in name
        prompt_preview = str(user_prompt)[:60] if user_prompt else config.prompt_name
        suffix = "..." if user_prompt and len(str(user_prompt)) > 60 else ""
        span_name = f"{SpanNames.SESSION} {prompt_preview}{suffix}"

        span = tracer.start_span(span_name, attributes=attributes)
        ctx.root_span = span

        # Store parent context for child spans
        parent_context = api["trace"].set_span_in_context(span, api["context"].get_current())

        # Add event for prompt submission
        prompt_len = len(str(user_prompt)) if user_prompt else 0
        span.add_event("user_prompt_submitted", {"prompt_length": prompt_len})

        return {"continue": True}

    async def pre_tool_use_hook(
        input_data: dict[str, Any],
        tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        attributes = _get_common_attributes(config, input_data.get("session_id"))

        tool_name = input_data.get("tool_name")
        if tool_name:
            attributes[GenAIAttributes.TOOL_NAME] = str(tool_name)

        if tool_use_id:
            attributes[GenAIAttributes.TOOL_CALL_ID] = tool_use_id

        # Add tool input
        tool_input = input_data.get("tool_input")
        if tool_input is not None:
            try:
                attributes[GenAIAttributes.TOOL_INPUT] = json.dumps(tool_input)
            except (TypeError, ValueError):
                attributes[GenAIAttributes.TOOL_INPUT] = str(tool_input)

        span_name = f"{SpanNames.TOOL_CALL} {tool_name}" if tool_name else SpanNames.TOOL_CALL

        # Create tool span as child of session span if available
        current_context = parent_context or api["context"].get_current()
        tool_span = tracer.start_span(span_name, attributes=attributes, context=current_context)

        if tool_use_id:
            ctx.active_tool_spans[tool_use_id] = tool_span

        return {"continue": True}

    async def post_tool_use_hook(
        input_data: dict[str, Any],
        tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        if tool_use_id and tool_use_id in ctx.active_tool_spans:
            tool_span = ctx.active_tool_spans[tool_use_id]

            # Add tool output/response
            tool_response = input_data.get("tool_response")
            if tool_response is not None:
                try:
                    tool_span.set_attribute(GenAIAttributes.TOOL_OUTPUT, json.dumps(tool_response))
                except (TypeError, ValueError):
                    tool_span.set_attribute(GenAIAttributes.TOOL_OUTPUT, str(tool_response))

            tool_span.set_status({"code": SpanStatusCode.OK})
            tool_span.end()
            del ctx.active_tool_spans[tool_use_id]

        return {"continue": True}

    async def post_tool_use_failure_hook(
        input_data: dict[str, Any],
        tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        if tool_use_id and tool_use_id in ctx.active_tool_spans:
            tool_span = ctx.active_tool_spans[tool_use_id]
            error_message = input_data.get("error") or "Tool execution failed"

            tool_span.set_status({"code": SpanStatusCode.ERROR, "message": error_message})
            tool_span.record_exception(Exception(error_message))
            tool_span.end()
            del ctx.active_tool_spans[tool_use_id]

        return {"continue": True}

    async def stop_hook(
        input_data: dict[str, Any],
        _tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        session_span = ctx.root_span

        # If no session span exists, create one now
        if session_span is None:
            attributes = _get_common_attributes(config, input_data.get("session_id"))
            if config.user_prompt:
                attributes[GenAIAttributes.REQUEST_INPUT] = str(config.user_prompt)
            fallback_span = tracer.start_span(SpanNames.SESSION, attributes=attributes)
            ctx.root_span = fallback_span
            session_span = fallback_span

        span = session_span

        # Add finish reason if available
        reason = input_data.get("reason")
        if reason:
            span.set_attribute(GenAIAttributes.RESPONSE_FINISH_REASONS, json.dumps([reason]))

        # Add usage if available from Stop hook
        input_tokens = input_data.get("input_tokens")
        output_tokens = input_data.get("output_tokens")
        if isinstance(input_tokens, int):
            span.set_attribute(GenAIAttributes.USAGE_INPUT_TOKENS, input_tokens)
        if isinstance(output_tokens, int):
            span.set_attribute(GenAIAttributes.USAGE_OUTPUT_TOKENS, output_tokens)

        span.add_event("session_stopped")

        # DON'T end the span here - let complete_session() do it so it can add the output

        return {"continue": True}

    async def subagent_start_hook(
        input_data: dict[str, Any],
        _tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        attributes = _get_common_attributes(config, input_data.get("session_id"))

        agent_type = input_data.get("agent_type")
        agent_id = input_data.get("agent_id")

        if agent_type:
            attributes[AgentMarkAttributes.SUBAGENT_TYPE] = str(agent_type)
        if agent_id:
            attributes[AgentMarkAttributes.AGENT_ID] = str(agent_id)

        # Create subagent span as child of session span
        current_context = parent_context or api["context"].get_current()
        subagent_span = tracer.start_span(
            SpanNames.SUBAGENT, attributes=attributes, context=current_context
        )

        # Use agent_id or session_id as key for tracking
        agent_key = agent_id or input_data.get("session_id")
        if agent_key:
            ctx.active_subagent_spans[agent_key] = subagent_span

        return {"continue": True}

    async def subagent_stop_hook(
        input_data: dict[str, Any],
        _tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        agent_id = input_data.get("agent_id")
        agent_key = agent_id or input_data.get("session_id")

        if agent_key and agent_key in ctx.active_subagent_spans:
            subagent_span = ctx.active_subagent_spans[agent_key]
            subagent_span.set_status({"code": SpanStatusCode.OK})
            subagent_span.end()
            del ctx.active_subagent_spans[agent_key]

        return {"continue": True}

    hooks: HooksConfig = {
        "UserPromptSubmit": [{"hooks": [user_prompt_submit_hook]}],
        "PreToolUse": [{"hooks": [pre_tool_use_hook]}],
        "PostToolUse": [{"hooks": [post_tool_use_hook]}],
        "PostToolUseFailure": [{"hooks": [post_tool_use_failure_hook]}],
        "Stop": [{"hooks": [stop_hook]}],
        "SubagentStart": [{"hooks": [subagent_start_hook]}],
        "SubagentStop": [{"hooks": [subagent_stop_hook]}],
    }

    return OtelHooksResult(hooks=hooks, context=ctx)


def complete_session(
    context: TelemetryContext,
    result: str | dict[str, Any],
    input_tokens: int | None = None,
    output_tokens: int | None = None,
) -> None:
    """Complete the session with the final agent result.

    Call this after query() completes to add the agent's response to telemetry.

    Note: This is optional if you don't need to capture the final result.
    The session span will be completed by the Stop hook automatically.

    Args:
        context: Telemetry context from create_otel_hooks().
        result: The agent's final result/response.
        input_tokens: Optional input token count.
        output_tokens: Optional output token count.

    Example:
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        final_result = ""
        async for message in query(prompt, options={"hooks": hooks}):
            if message.type == "result" and message.subtype == "success":
                final_result = message.result

        # Add the result to telemetry
        if context:
            complete_session(context, final_result)
    """
    span = context.root_span
    if span is None:
        # Session already completed by Stop hook, or no session was created
        return

    # Add result
    try:
        result_str = result if isinstance(result, str) else json.dumps(result)
        span.set_attribute(GenAIAttributes.RESPONSE_OUTPUT, result_str)
    except (TypeError, ValueError):
        span.set_attribute(GenAIAttributes.RESPONSE_OUTPUT, str(result))

    # Add usage if provided
    if input_tokens is not None:
        span.set_attribute(GenAIAttributes.USAGE_INPUT_TOKENS, input_tokens)
    if output_tokens is not None:
        span.set_attribute(GenAIAttributes.USAGE_OUTPUT_TOKENS, output_tokens)

    span.add_event("session_completed")
    span.set_status({"code": SpanStatusCode.OK})
    span.end()
    context.root_span = None


def combine_with_otel_hooks(otel_hooks: HooksConfig, *other_hooks: HooksConfig) -> HooksConfig:
    """Combine OTEL hooks with other hook configurations.

    OTEL hooks execute first to ensure spans are created before other hooks run.

    Args:
        otel_hooks: OTEL hooks configuration from create_otel_hooks().
        *other_hooks: Other hook configurations to merge.

    Returns:
        Combined hooks configuration.
    """
    combined: HooksConfig = {}

    # Get all event names from all hook configs
    all_event_names: set[str] = set()
    for event_name in otel_hooks:
        all_event_names.add(event_name)
    for hooks in other_hooks:
        if hooks:
            for event_name in hooks:
                all_event_names.add(event_name)

    # Start with OTEL hooks (they run first)
    for event_name in all_event_names:
        if event_name in otel_hooks:
            combined[event_name] = list(otel_hooks[event_name])

    # Merge other hooks (they run after OTEL hooks)
    for hooks in other_hooks:
        if hooks:
            for event_name in all_event_names:
                if event_name in hooks:
                    if event_name in combined:
                        combined[event_name] = [*combined[event_name], *hooks[event_name]]
                    else:
                        combined[event_name] = list(hooks[event_name])

    return combined
