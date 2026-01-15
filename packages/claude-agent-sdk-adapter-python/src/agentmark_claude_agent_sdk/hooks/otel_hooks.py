"""OpenTelemetry constants for Claude Agent SDK adapter.

These follow GenAI semantic conventions.

See: https://opentelemetry.io/docs/specs/semconv/gen-ai/

Ported from TypeScript: packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts
"""

from __future__ import annotations

__all__ = [
    # Constants
    "TRACER_SCOPE_NAME",
    # Classes
    "GenAIAttributes",
    "AgentMarkAttributes",
    "SpanNames",
]

# The instrumentation scope name used for all AgentMark spans.
# This scope name is registered in the normalizer for proper span transformation.
TRACER_SCOPE_NAME = "agentmark"


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
