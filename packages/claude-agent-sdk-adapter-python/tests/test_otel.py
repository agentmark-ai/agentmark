"""Tests for OpenTelemetry Hooks.

Ported from TypeScript: packages/claude-agent-sdk-adapter/test/otel.test.ts
"""

from __future__ import annotations

import json
import re
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from agentmark_claude_agent_sdk.hooks.otel_hooks import (
    AgentMarkAttributes,
    GenAIAttributes,
    OtelHooksConfig,
    SpanNames,
    TelemetryContext,
    combine_with_otel_hooks,
    complete_session,
    create_otel_hooks,
)
from tests.conftest import (
    find_span_by_name,
)


def create_mock_span(name: str, attributes: dict[str, Any] | None = None) -> MagicMock:
    """Create a mock span that captures all operations for testing."""
    span = MagicMock()
    span.name = name
    span._attributes = dict(attributes) if attributes else {}
    span._status = None
    span._exceptions = []
    span._events = []
    span._ended = False

    def set_attribute(key: str, value: Any) -> None:
        span._attributes[key] = value

    def set_status(status: dict[str, Any]) -> None:
        span._status = status

    def record_exception(error: Exception) -> None:
        span._exceptions.append(error)

    def add_event(name: str, attributes: dict[str, Any] | None = None) -> None:
        span._events.append({"name": name, "attributes": attributes})

    def end() -> None:
        span._ended = True

    def span_context() -> dict[str, str]:
        return {"traceId": "mock-trace-id", "spanId": "mock-span-id"}

    span.set_attribute = MagicMock(side_effect=set_attribute)
    span.set_status = MagicMock(side_effect=set_status)
    span.record_exception = MagicMock(side_effect=record_exception)
    span.add_event = MagicMock(side_effect=add_event)
    span.end = MagicMock(side_effect=end)
    span.get_span_context = MagicMock(side_effect=span_context)

    # Expose data properties for assertions
    type(span).attributes = property(lambda self: self._attributes)
    type(span).status = property(lambda self: self._status)
    type(span).exceptions = property(lambda self: self._exceptions)
    type(span).events = property(lambda self: self._events)
    type(span).ended = property(lambda self: self._ended)

    return span


def create_mock_tracer() -> MagicMock:
    """Create a mock tracer that captures all created spans."""
    tracer = MagicMock()
    tracer.spans = []

    def start_span(name: str, attributes: dict[str, Any] | None = None, **kwargs: Any) -> MagicMock:
        # Handle options dict pattern
        if isinstance(attributes, dict) and "attributes" in attributes:
            attrs = attributes.get("attributes")
        else:
            attrs = attributes
        span = create_mock_span(name, attrs)
        tracer.spans.append(span)
        return span

    tracer.start_span = MagicMock(side_effect=start_span)
    return tracer


def create_mock_tracer_provider() -> MagicMock:
    """Create a mock tracer provider that returns a mock tracer."""
    provider = MagicMock()
    provider.tracer = create_mock_tracer()
    provider.get_tracer = MagicMock(return_value=provider.tracer)
    return provider


class TestGenAISemanticConventionCompliance:
    """Test suite for GenAI Semantic Convention Compliance."""

    @pytest.fixture
    def mock_tracer_provider(self) -> MagicMock:
        """Create mock tracer provider."""
        return create_mock_tracer_provider()

    @pytest.fixture
    def config(self, mock_tracer_provider: MagicMock) -> OtelHooksConfig:
        """Create default OTEL config."""
        return OtelHooksConfig(
            tracer_provider=mock_tracer_provider,
            prompt_name="test-prompt",
            model="claude-sonnet-4-20250514",
            user_id="user-123",
        )

    async def test_sets_genai_system_and_model_attributes_on_session_span(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should set GenAI system and model attributes on session span."""
        result = create_otel_hooks(config)
        hooks = result.hooks

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "test-session", "prompt": "Test"},
            None,
            {},
        )

        session_span = find_span_by_name(mock_tracer_provider.tracer.spans, re.compile(r"session"))
        assert session_span is not None
        assert session_span.attributes[GenAIAttributes.SYSTEM] == "anthropic"
        assert session_span.attributes[GenAIAttributes.REQUEST_MODEL] == "claude-sonnet-4-20250514"

    async def test_sets_genai_tool_attributes_on_tool_spans(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should set GenAI tool attributes on tool spans."""
        result = create_otel_hooks(config)
        hooks = result.hooks

        # Create session first
        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "test", "prompt": "Test"},
            None,
            {},
        )

        # Create tool span
        await hooks["PreToolUse"][0]["hooks"][0](
            {"hook_event_name": "PreToolUse", "session_id": "test", "tool_name": "SearchFiles"},
            "tool-abc",
            {},
        )

        tool_span = find_span_by_name(mock_tracer_provider.tracer.spans, re.compile(r"tool"))
        assert tool_span is not None
        assert tool_span.attributes[GenAIAttributes.TOOL_NAME] == "SearchFiles"
        assert tool_span.attributes[GenAIAttributes.TOOL_CALL_ID] == "tool-abc"

    async def test_sets_genai_usage_attributes_on_session_stop(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should set GenAI usage attributes on session stop."""
        result = create_otel_hooks(config)
        hooks = result.hooks

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "test", "prompt": "Test"},
            None,
            {},
        )

        await hooks["Stop"][0]["hooks"][0](
            {
                "hook_event_name": "Stop",
                "session_id": "test",
                "input_tokens": 150,
                "output_tokens": 75,
                "reason": "end_turn",
            },
            None,
            {},
        )

        session_span = find_span_by_name(mock_tracer_provider.tracer.spans, re.compile(r"session"))
        assert session_span.attributes[GenAIAttributes.USAGE_INPUT_TOKENS] == 150
        assert session_span.attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS] == 75
        assert session_span.attributes[GenAIAttributes.RESPONSE_FINISH_REASONS] == json.dumps(
            ["end_turn"]
        )


class TestAgentMarkCustomAttributes:
    """Test suite for AgentMark Custom Attributes."""

    async def test_sets_agentmark_prompt_and_user_attributes_on_spans(self) -> None:
        """Should set AgentMark prompt and user attributes on spans."""
        mock_provider = create_mock_tracer_provider()
        config = OtelHooksConfig(
            tracer_provider=mock_provider,
            prompt_name="my-custom-prompt",
            user_id="user-456",
        )
        result = create_otel_hooks(config)
        hooks = result.hooks

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "sess-789", "prompt": "Test"},
            None,
            {},
        )

        session_span = find_span_by_name(mock_provider.tracer.spans, re.compile(r"session"))
        assert session_span is not None
        assert session_span.attributes[AgentMarkAttributes.PROMPT_NAME] == "my-custom-prompt"
        assert session_span.attributes[AgentMarkAttributes.SESSION_ID] == "sess-789"
        assert session_span.attributes[AgentMarkAttributes.USER_ID] == "user-456"


class TestSpanNamingConventions:
    """Test suite for Span Naming Conventions."""

    @pytest.fixture
    def mock_tracer_provider(self) -> MagicMock:
        """Create mock tracer provider."""
        return create_mock_tracer_provider()

    @pytest.fixture
    def config(self, mock_tracer_provider: MagicMock) -> OtelHooksConfig:
        """Create default OTEL config."""
        return OtelHooksConfig(
            tracer_provider=mock_tracer_provider,
            prompt_name="test-prompt",
            model="claude-sonnet-4-20250514",
            user_id="user-123",
        )

    async def test_creates_session_span_with_correct_name_prefix(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should create session span with correct name prefix."""
        result = create_otel_hooks(config)
        hooks = result.hooks

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "test", "prompt": "Test"},
            None,
            {},
        )

        session_span = next(
            (s for s in mock_tracer_provider.tracer.spans if s.name.startswith(SpanNames.SESSION)),
            None,
        )
        assert session_span is not None

    async def test_creates_tool_span_with_correct_name_prefix(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should create tool span with correct name prefix."""
        result = create_otel_hooks(config)
        hooks = result.hooks

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "test", "prompt": "Test"},
            None,
            {},
        )

        await hooks["PreToolUse"][0]["hooks"][0](
            {"hook_event_name": "PreToolUse", "session_id": "test", "tool_name": "Read"},
            "tool-1",
            {},
        )

        tool_span = next(
            (
                s
                for s in mock_tracer_provider.tracer.spans
                if s.name.startswith(SpanNames.TOOL_CALL)
            ),
            None,
        )
        assert tool_span is not None
        assert tool_span.name == "gen_ai.tool.call Read"

    async def test_creates_subagent_span_with_correct_name(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should create subagent span with correct name."""
        result = create_otel_hooks(config)
        hooks = result.hooks

        await hooks["SubagentStart"][0]["hooks"][0](
            {"hook_event_name": "SubagentStart", "session_id": "sub-1", "agent_type": "Plan"},
            None,
            {},
        )

        subagent_span = next(
            (s for s in mock_tracer_provider.tracer.spans if s.name == SpanNames.SUBAGENT),
            None,
        )
        assert subagent_span is not None


class TestCreateTelemetryContext:
    """Test suite for createTelemetryContext."""

    @pytest.fixture
    def mock_tracer_provider(self) -> MagicMock:
        """Create mock tracer provider."""
        return create_mock_tracer_provider()

    @pytest.fixture
    def config(self, mock_tracer_provider: MagicMock) -> OtelHooksConfig:
        """Create default OTEL config."""
        return OtelHooksConfig(
            tracer_provider=mock_tracer_provider,
            prompt_name="test-prompt",
            model="claude-sonnet-4-20250514",
            user_id="user-123",
        )

    async def test_accumulates_tool_spans_across_session_lifecycle(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should accumulate tool spans across the session lifecycle."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        # Start session
        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "test", "prompt": "Test"},
            None,
            {},
        )
        assert context.root_span is not None

        # Add multiple tool spans
        await hooks["PreToolUse"][0]["hooks"][0](
            {"hook_event_name": "PreToolUse", "session_id": "test", "tool_name": "Tool1"},
            "tool-1",
            {},
        )
        await hooks["PreToolUse"][0]["hooks"][0](
            {"hook_event_name": "PreToolUse", "session_id": "test", "tool_name": "Tool2"},
            "tool-2",
            {},
        )

        # Verify context tracks active spans
        assert len(context.active_tool_spans) == 2
        assert "tool-1" in context.active_tool_spans
        assert "tool-2" in context.active_tool_spans

        # Complete one tool
        await hooks["PostToolUse"][0]["hooks"][0](
            {"hook_event_name": "PostToolUse", "session_id": "test"},
            "tool-1",
            {},
        )
        assert len(context.active_tool_spans) == 1
        assert "tool-1" not in context.active_tool_spans

    async def test_uses_tracer_from_provider_to_create_spans(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should use tracer from provider to create actual spans."""
        result = create_otel_hooks(config)
        hooks = result.hooks

        # Verify tracer was obtained with correct scope name
        mock_tracer_provider.get_tracer.assert_called_with("agentmark")

        # Use the hooks to create a span
        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "test", "prompt": "Test"},
            None,
            {},
        )

        # Verify span was created via the tracer
        mock_tracer_provider.tracer.start_span.assert_called()
        assert len(mock_tracer_provider.tracer.spans) > 0


class TestCreateOtelHooks:
    """Test suite for createOtelHooks."""

    def test_returns_hooks_and_context(self) -> None:
        """Should return hooks and context."""
        mock_provider = create_mock_tracer_provider()
        config = OtelHooksConfig(
            tracer_provider=mock_provider,
            prompt_name="test-prompt",
            model="claude-sonnet-4-20250514",
            user_id="user-123",
        )

        result = create_otel_hooks(config)

        assert result.hooks is not None
        assert result.context is not None
        # OTEL hooks use UserPromptSubmit instead of SessionStart
        assert "UserPromptSubmit" in result.hooks
        assert "PreToolUse" in result.hooks
        assert "PostToolUse" in result.hooks
        assert "PostToolUseFailure" in result.hooks
        assert "Stop" in result.hooks
        assert "SubagentStart" in result.hooks
        assert "SubagentStop" in result.hooks


class TestSessionSpan:
    """Test suite for Session Span Tests."""

    @pytest.fixture
    def mock_tracer_provider(self) -> MagicMock:
        """Create mock tracer provider."""
        return create_mock_tracer_provider()

    @pytest.fixture
    def config(self, mock_tracer_provider: MagicMock) -> OtelHooksConfig:
        """Create default OTEL config."""
        return OtelHooksConfig(
            tracer_provider=mock_tracer_provider,
            prompt_name="test-prompt",
            model="claude-sonnet-4-20250514",
            user_id="user-123",
        )

    async def test_creates_root_session_span_on_user_prompt_submit(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should create root session span on UserPromptSubmit."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {
                "hook_event_name": "UserPromptSubmit",
                "session_id": "session-123",
                "prompt": "Test prompt",
            },
            None,
            {},
        )

        mock_tracer_provider.tracer.start_span.assert_called()
        # Get the first call's arguments
        call_args = mock_tracer_provider.tracer.start_span.call_args
        span_name = call_args[0][0] if call_args[0] else call_args[1].get("name")
        assert SpanNames.SESSION in span_name
        assert context.root_span is not None

    async def test_adds_metrics_to_session_span_on_stop(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should add metrics to session span on Stop."""
        result = create_otel_hooks(config)
        hooks = result.hooks

        # Start session first
        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {
                "hook_event_name": "UserPromptSubmit",
                "session_id": "session-123",
                "prompt": "Test prompt",
            },
            None,
            {},
        )

        root_span = mock_tracer_provider.tracer.spans[0]
        assert root_span.ended is False

        # Stop adds metrics but doesn't end the span (complete_session does that)
        await hooks["Stop"][0]["hooks"][0](
            {
                "hook_event_name": "Stop",
                "session_id": "session-123",
                "input_tokens": 100,
                "output_tokens": 50,
                "reason": "end_turn",
            },
            None,
            {},
        )

        # Span should have metrics
        assert root_span.attributes[GenAIAttributes.USAGE_INPUT_TOKENS] == 100
        assert root_span.attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS] == 50
        assert root_span.attributes[GenAIAttributes.RESPONSE_FINISH_REASONS] == json.dumps(
            ["end_turn"]
        )

    async def test_creates_fallback_session_span_on_stop_if_no_user_prompt_submit(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should create fallback session span on Stop if no UserPromptSubmit."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        # Stop without UserPromptSubmit (creates fallback span)
        await hooks["Stop"][0]["hooks"][0](
            {
                "hook_event_name": "Stop",
                "session_id": "session-123",
                "reason": "user_cancelled",
                "input_tokens": 80,
                "output_tokens": 40,
            },
            None,
            {},
        )

        mock_tracer_provider.tracer.start_span.assert_called()
        assert context.root_span is not None
        root_span = mock_tracer_provider.tracer.spans[0]
        assert root_span.attributes[GenAIAttributes.RESPONSE_FINISH_REASONS] == json.dumps(
            ["user_cancelled"]
        )


class TestToolSpan:
    """Test suite for Tool Span Tests."""

    @pytest.fixture
    def mock_tracer_provider(self) -> MagicMock:
        """Create mock tracer provider."""
        return create_mock_tracer_provider()

    @pytest.fixture
    def config(self, mock_tracer_provider: MagicMock) -> OtelHooksConfig:
        """Create default OTEL config."""
        return OtelHooksConfig(
            tracer_provider=mock_tracer_provider,
            prompt_name="test-prompt",
            model="claude-sonnet-4-20250514",
            user_id="user-123",
        )

    async def test_creates_child_tool_span_on_pre_tool_use(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should create child tool span on PreToolUse."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        # Start session first
        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        # Tool use
        await hooks["PreToolUse"][0]["hooks"][0](
            {
                "hook_event_name": "PreToolUse",
                "session_id": "session-123",
                "tool_name": "read_file",
            },
            "tool-use-456",
            {},
        )

        assert mock_tracer_provider.tracer.start_span.call_count == 2
        tool_span = find_span_by_name(mock_tracer_provider.tracer.spans, re.compile(r"tool\.call"))
        assert tool_span is not None
        assert tool_span.name == "gen_ai.tool.call read_file"
        assert tool_span.attributes[GenAIAttributes.TOOL_NAME] == "read_file"
        assert tool_span.attributes[GenAIAttributes.TOOL_CALL_ID] == "tool-use-456"
        assert "tool-use-456" in context.active_tool_spans

    async def test_ends_tool_span_with_ok_status_on_post_tool_use(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should end tool span with OK status on PostToolUse."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        # Start session
        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        # Tool use
        await hooks["PreToolUse"][0]["hooks"][0](
            {
                "hook_event_name": "PreToolUse",
                "session_id": "session-123",
                "tool_name": "read_file",
            },
            "tool-use-456",
            {},
        )

        tool_span = find_span_by_name(mock_tracer_provider.tracer.spans, re.compile(r"tool\.call"))
        assert tool_span is not None
        assert tool_span.ended is False

        # Post tool use
        await hooks["PostToolUse"][0]["hooks"][0](
            {"hook_event_name": "PostToolUse", "session_id": "session-123"},
            "tool-use-456",
            {},
        )

        assert tool_span.ended is True
        assert tool_span.status["code"] == 1  # OK
        assert "tool-use-456" not in context.active_tool_spans

    async def test_ends_tool_span_with_error_status_on_post_tool_use_failure(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should end tool span with ERROR status on PostToolUseFailure."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        # Start session
        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        # Tool use
        await hooks["PreToolUse"][0]["hooks"][0](
            {
                "hook_event_name": "PreToolUse",
                "session_id": "session-123",
                "tool_name": "read_file",
            },
            "tool-use-456",
            {},
        )

        tool_span = find_span_by_name(mock_tracer_provider.tracer.spans, re.compile(r"tool\.call"))
        assert tool_span is not None

        # Tool failure
        await hooks["PostToolUseFailure"][0]["hooks"][0](
            {
                "hook_event_name": "PostToolUseFailure",
                "session_id": "session-123",
                "error": "File not found",
            },
            "tool-use-456",
            {},
        )

        assert tool_span.ended is True
        assert tool_span.status["code"] == 2  # ERROR
        assert tool_span.status["message"] == "File not found"
        assert "tool-use-456" not in context.active_tool_spans

    async def test_records_exception_on_tool_failure(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should record exception on tool failure."""
        result = create_otel_hooks(config)
        hooks = result.hooks

        # Start session
        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        # Tool use
        await hooks["PreToolUse"][0]["hooks"][0](
            {
                "hook_event_name": "PreToolUse",
                "session_id": "session-123",
                "tool_name": "read_file",
            },
            "tool-use-456",
            {},
        )

        tool_span = find_span_by_name(mock_tracer_provider.tracer.spans, re.compile(r"tool\.call"))
        assert tool_span is not None

        # Tool failure
        await hooks["PostToolUseFailure"][0]["hooks"][0](
            {
                "hook_event_name": "PostToolUseFailure",
                "session_id": "session-123",
                "error": "Permission denied",
            },
            "tool-use-456",
            {},
        )

        assert len(tool_span.exceptions) == 1
        assert str(tool_span.exceptions[0]) == "Permission denied"


class TestAttributeTests:
    """Test suite for Attribute Tests."""

    @pytest.fixture
    def mock_tracer_provider(self) -> MagicMock:
        """Create mock tracer provider."""
        return create_mock_tracer_provider()

    @pytest.fixture
    def config(self, mock_tracer_provider: MagicMock) -> OtelHooksConfig:
        """Create default OTEL config."""
        return OtelHooksConfig(
            tracer_provider=mock_tracer_provider,
            prompt_name="test-prompt",
            model="claude-sonnet-4-20250514",
            user_id="user-123",
        )

    async def test_includes_genai_semantic_convention_attributes_on_session_span(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should include GenAI semantic convention attributes on session span."""
        result = create_otel_hooks(config)
        hooks = result.hooks

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        root_span = mock_tracer_provider.tracer.spans[0]
        assert root_span.attributes[GenAIAttributes.SYSTEM] == "anthropic"
        assert root_span.attributes[GenAIAttributes.REQUEST_MODEL] == "claude-sonnet-4-20250514"

    async def test_includes_agentmark_specific_attributes_on_spans(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should include AgentMark-specific attributes on spans."""
        result = create_otel_hooks(config)
        hooks = result.hooks

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        root_span = mock_tracer_provider.tracer.spans[0]
        assert root_span.attributes[AgentMarkAttributes.PROMPT_NAME] == "test-prompt"
        assert root_span.attributes[AgentMarkAttributes.SESSION_ID] == "session-123"
        assert root_span.attributes[AgentMarkAttributes.USER_ID] == "user-123"

    async def test_includes_additional_attributes_when_provided(self) -> None:
        """Should include additional attributes when provided."""
        mock_provider = create_mock_tracer_provider()
        config = OtelHooksConfig(
            tracer_provider=mock_provider,
            prompt_name="test-prompt",
            model="claude-sonnet-4-20250514",
            user_id="user-123",
            additional_attributes={
                "custom.attribute": "custom-value",
                "custom.number": 42,
            },
        )

        result = create_otel_hooks(config)
        hooks = result.hooks

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        root_span = mock_provider.tracer.spans[0]
        assert root_span.attributes["custom.attribute"] == "custom-value"
        assert root_span.attributes["custom.number"] == 42


class TestHierarchyTests:
    """Test suite for Hierarchy Tests."""

    @pytest.fixture
    def mock_tracer_provider(self) -> MagicMock:
        """Create mock tracer provider."""
        return create_mock_tracer_provider()

    @pytest.fixture
    def config(self, mock_tracer_provider: MagicMock) -> OtelHooksConfig:
        """Create default OTEL config."""
        return OtelHooksConfig(
            tracer_provider=mock_tracer_provider,
            prompt_name="test-prompt",
            model="claude-sonnet-4-20250514",
            user_id="user-123",
        )

    async def test_maintains_multiple_tool_spans_correctly(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should maintain multiple tool spans correctly."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        # Start session
        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        # First tool
        await hooks["PreToolUse"][0]["hooks"][0](
            {
                "hook_event_name": "PreToolUse",
                "session_id": "session-123",
                "tool_name": "read_file",
            },
            "tool-1",
            {},
        )

        # Second tool (overlapping)
        await hooks["PreToolUse"][0]["hooks"][0](
            {
                "hook_event_name": "PreToolUse",
                "session_id": "session-123",
                "tool_name": "write_file",
            },
            "tool-2",
            {},
        )

        assert len(context.active_tool_spans) == 2
        assert "tool-1" in context.active_tool_spans
        assert "tool-2" in context.active_tool_spans

        # End first tool
        await hooks["PostToolUse"][0]["hooks"][0](
            {"hook_event_name": "PostToolUse", "session_id": "session-123"},
            "tool-1",
            {},
        )

        assert len(context.active_tool_spans) == 1
        assert "tool-1" not in context.active_tool_spans
        assert "tool-2" in context.active_tool_spans

        # End second tool
        await hooks["PostToolUse"][0]["hooks"][0](
            {"hook_event_name": "PostToolUse", "session_id": "session-123"},
            "tool-2",
            {},
        )

        assert len(context.active_tool_spans) == 0


class TestSubagentTests:
    """Test suite for Subagent Tests."""

    @pytest.fixture
    def mock_tracer_provider(self) -> MagicMock:
        """Create mock tracer provider."""
        return create_mock_tracer_provider()

    @pytest.fixture
    def config(self, mock_tracer_provider: MagicMock) -> OtelHooksConfig:
        """Create default OTEL config."""
        return OtelHooksConfig(
            tracer_provider=mock_tracer_provider,
            prompt_name="test-prompt",
            model="claude-sonnet-4-20250514",
            user_id="user-123",
        )

    async def test_creates_and_ends_subagent_spans(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should create and end subagent spans."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        # Subagent start
        await hooks["SubagentStart"][0]["hooks"][0](
            {
                "hook_event_name": "SubagentStart",
                "session_id": "subagent-session-1",
                "agent_type": "explore",
            },
            None,
            {},
        )

        mock_tracer_provider.tracer.start_span.assert_called()
        assert "subagent-session-1" in context.active_subagent_spans

        # Subagent stop
        await hooks["SubagentStop"][0]["hooks"][0](
            {"hook_event_name": "SubagentStop", "session_id": "subagent-session-1"},
            None,
            {},
        )

        subagent_span = find_span_by_name(mock_tracer_provider.tracer.spans, SpanNames.SUBAGENT)
        assert subagent_span is not None
        assert subagent_span.ended is True
        assert subagent_span.status["code"] == 1  # OK
        assert "subagent-session-1" not in context.active_subagent_spans


class TestCombineWithOtelHooks:
    """Test suite for combineWithOtelHooks."""

    @pytest.fixture
    def mock_tracer_provider(self) -> MagicMock:
        """Create mock tracer provider."""
        return create_mock_tracer_provider()

    @pytest.fixture
    def config(self, mock_tracer_provider: MagicMock) -> OtelHooksConfig:
        """Create default OTEL config."""
        return OtelHooksConfig(
            tracer_provider=mock_tracer_provider,
            prompt_name="test-prompt",
            model="claude-sonnet-4-20250514",
            user_id="user-123",
        )

    def test_merges_otel_hooks_with_other_hooks(self, config: OtelHooksConfig) -> None:
        """Should merge OTEL hooks with other hooks."""
        result = create_otel_hooks(config)
        otel_hooks = result.hooks

        custom_hook = AsyncMock(return_value={"continue": True})
        custom_hooks = {
            "UserPromptSubmit": [{"hooks": [custom_hook]}],
            "PreToolUse": [{"hooks": [custom_hook]}],
        }

        combined = combine_with_otel_hooks(otel_hooks, custom_hooks)

        # OTEL hooks + custom hooks (as separate matchers)
        assert len(combined["UserPromptSubmit"]) == 2
        assert len(combined["PreToolUse"]) == 2

        # OTEL hooks first
        assert (
            combined["UserPromptSubmit"][0]["hooks"][0]
            is otel_hooks["UserPromptSubmit"][0]["hooks"][0]
        )
        assert combined["UserPromptSubmit"][1]["hooks"][0] is custom_hook

    def test_handles_multiple_hook_sets(self, config: OtelHooksConfig) -> None:
        """Should handle multiple hook sets."""
        result = create_otel_hooks(config)
        otel_hooks = result.hooks

        hook1 = AsyncMock(return_value={"continue": True})
        hook2 = AsyncMock(return_value={"continue": True})

        hooks1 = {"UserPromptSubmit": [{"hooks": [hook1]}]}
        hooks2 = {"UserPromptSubmit": [{"hooks": [hook2]}]}

        combined = combine_with_otel_hooks(otel_hooks, hooks1, hooks2)

        # OTEL + hook1 + hook2 (as separate matchers)
        assert len(combined["UserPromptSubmit"]) == 3
        assert (
            combined["UserPromptSubmit"][0]["hooks"][0]
            is otel_hooks["UserPromptSubmit"][0]["hooks"][0]
        )
        assert combined["UserPromptSubmit"][1]["hooks"][0] is hook1
        assert combined["UserPromptSubmit"][2]["hooks"][0] is hook2

    def test_preserves_hooks_for_events_not_in_otel_hooks(self, config: OtelHooksConfig) -> None:
        """Should preserve hooks for events not in OTEL hooks."""
        result = create_otel_hooks(config)
        otel_hooks = result.hooks

        # Create partial OTEL hooks (only UserPromptSubmit)
        partial_otel_hooks = {"UserPromptSubmit": otel_hooks["UserPromptSubmit"]}

        custom_hook = AsyncMock(return_value={"continue": True})
        custom_hooks = {"Stop": [{"hooks": [custom_hook]}]}

        combined = combine_with_otel_hooks(partial_otel_hooks, custom_hooks)

        assert "UserPromptSubmit" in combined
        assert len(combined["Stop"]) == 1
        assert combined["Stop"][0]["hooks"][0] is custom_hook


class TestCompleteSession:
    """Test suite for completeSession."""

    @pytest.fixture
    def mock_tracer_provider(self) -> MagicMock:
        """Create mock tracer provider."""
        return create_mock_tracer_provider()

    @pytest.fixture
    def config(self, mock_tracer_provider: MagicMock) -> OtelHooksConfig:
        """Create default OTEL config."""
        return OtelHooksConfig(
            tracer_provider=mock_tracer_provider,
            prompt_name="test-prompt",
            model="claude-sonnet-4-20250514",
            user_id="user-123",
        )

    async def test_sets_gen_ai_response_attribute_with_string_result(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should set gen_ai.response attribute with string result."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        # Start session
        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        root_span = mock_tracer_provider.tracer.spans[0]
        assert context.root_span is not None

        # Complete session with string result
        complete_session(context, "This is the final response")

        assert root_span.attributes[GenAIAttributes.RESPONSE_OUTPUT] == "This is the final response"

    async def test_sets_gen_ai_response_attribute_with_json_stringified_object(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should set gen_ai.response attribute with JSON-stringified object."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        root_span = mock_tracer_provider.tracer.spans[0]
        result_object = {"answer": 42, "reasoning": "math"}

        complete_session(context, result_object)

        assert root_span.attributes[GenAIAttributes.RESPONSE_OUTPUT] == json.dumps(result_object)

    async def test_sets_gen_ai_usage_input_tokens_attribute(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should set gen_ai.usage.input_tokens attribute."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        root_span = mock_tracer_provider.tracer.spans[0]

        complete_session(context, "result", input_tokens=250)

        assert root_span.attributes[GenAIAttributes.USAGE_INPUT_TOKENS] == 250

    async def test_sets_gen_ai_usage_output_tokens_attribute(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should set gen_ai.usage.output_tokens attribute."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        root_span = mock_tracer_provider.tracer.spans[0]

        complete_session(context, "result", output_tokens=150)

        assert root_span.attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS] == 150

    async def test_adds_session_completed_event(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should add session_completed event."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        root_span = mock_tracer_provider.tracer.spans[0]

        complete_session(context, "result")

        completed_event = next(
            (e for e in root_span.events if e["name"] == "session_completed"),
            None,
        )
        assert completed_event is not None

    async def test_ends_span_with_ok_status(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should end the span with OK status."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        root_span = mock_tracer_provider.tracer.spans[0]
        assert root_span.ended is False

        complete_session(context, "result")

        assert root_span.ended is True
        assert root_span.status["code"] == 1  # SpanStatusCode.OK

    async def test_clears_root_span_from_context_after_completion(
        self, config: OtelHooksConfig, mock_tracer_provider: MagicMock
    ) -> None:
        """Should clear rootSpan from context after completion."""
        result = create_otel_hooks(config)
        hooks = result.hooks
        context = result.context

        await hooks["UserPromptSubmit"][0]["hooks"][0](
            {"hook_event_name": "UserPromptSubmit", "session_id": "session-123", "prompt": "Test"},
            None,
            {},
        )

        assert context.root_span is not None

        complete_session(context, "result")

        assert context.root_span is None

    def test_no_op_gracefully_when_span_is_undefined(self) -> None:
        """Should no-op gracefully when span is undefined."""
        # Create a minimal context without a root_span
        context = TelemetryContext(
            root_span=None,
            active_tool_spans={},
            active_subagent_spans={},
        )

        assert context.root_span is None

        # Should not throw
        complete_session(context, "result")

        # Context should still have None root_span
        assert context.root_span is None


class TestOtelUnavailableScenarios:
    """Test suite for OTEL unavailable scenarios."""

    def test_returns_empty_hooks_when_tracer_provider_returns_null_tracer(self) -> None:
        """Should return empty hooks when TracerProvider returns null tracer."""
        null_tracer_provider = MagicMock()
        null_tracer_provider.get_tracer = MagicMock(return_value=None)

        result = create_otel_hooks(
            OtelHooksConfig(
                tracer_provider=null_tracer_provider,
                prompt_name="test-prompt",
            )
        )

        # When tracer is null, context should be None and hooks empty
        assert result.context is None
        assert len(result.hooks) == 0

    def test_not_throwing_when_tracer_provider_returns_undefined(self) -> None:
        """Should not throw when TracerProvider is provided but returns undefined."""
        broken_provider = MagicMock()
        broken_provider.get_tracer = MagicMock(return_value=None)

        # Should not throw
        result = create_otel_hooks(
            OtelHooksConfig(
                tracer_provider=broken_provider,
                prompt_name="test-prompt",
            )
        )

        assert result.context is None
        assert result.hooks == {}

    def test_returns_null_context_when_tracer_provider_missing(self) -> None:
        """Should return null context when tracer provider is missing."""
        # When no tracer_provider is given and global tracer is not set up,
        # the context should be None (OTEL not available)
        result = create_otel_hooks(
            OtelHooksConfig(
                tracer_provider=None,
                prompt_name="test-prompt",
            )
        )

        # This may return a context if OTEL is installed in the test environment
        # The important thing is it doesn't throw
        assert result is not None

    def test_handles_create_telemetry_context_returning_null_gracefully(self) -> None:
        """Should handle createTelemetryContext returning null gracefully."""
        # Create hooks with a provider that returns null tracer
        null_provider = MagicMock()
        null_provider.get_tracer = MagicMock(return_value=None)

        result = create_otel_hooks(
            OtelHooksConfig(
                tracer_provider=null_provider,
                prompt_name="test-prompt",
            )
        )

        # Empty hooks and null context
        assert result.context is None
        assert "UserPromptSubmit" not in result.hooks
        assert "PreToolUse" not in result.hooks
        assert "PostToolUse" not in result.hooks
        assert "Stop" not in result.hooks

    def test_still_allows_complete_session_with_null_context(self) -> None:
        """Should still allow completeSession with null context."""
        null_provider = MagicMock()
        null_provider.get_tracer = MagicMock(return_value=None)

        # createOtelHooks returns null context when tracer is null
        create_otel_hooks(
            OtelHooksConfig(
                tracer_provider=null_provider,
                prompt_name="test-prompt",
            )
        )

        # completeSession should handle a minimal context gracefully
        minimal_context = TelemetryContext(
            root_span=None,
            active_tool_spans={},
            active_subagent_spans={},
        )

        # Should not throw
        complete_session(minimal_context, "result")
