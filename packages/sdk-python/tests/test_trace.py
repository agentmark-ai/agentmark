"""Tests for trace utilities."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from agentmark_sdk import TraceContext, TraceOptions, TraceResult, trace, trace_context


class TestTraceOptions:
    """Tests for TraceOptions dataclass."""

    def test_create_with_name_only(self) -> None:
        """Test creating TraceOptions with only name."""
        opts = TraceOptions(name="my-trace")

        assert opts.name == "my-trace"
        assert opts.metadata is None
        assert opts.session_id is None
        assert opts.user_id is None

    def test_create_with_all_fields(self) -> None:
        """Test creating TraceOptions with all fields."""
        opts = TraceOptions(
            name="my-trace",
            metadata={"key": "value"},
            session_id="session-123",
            session_name="Test Session",
            user_id="user-456",
            dataset_run_id="run-789",
            dataset_run_name="Test Run",
            dataset_item_name="Item 1",
            dataset_expected_output="expected",
        )

        assert opts.name == "my-trace"
        assert opts.metadata == {"key": "value"}
        assert opts.session_id == "session-123"
        assert opts.session_name == "Test Session"
        assert opts.user_id == "user-456"
        assert opts.dataset_run_id == "run-789"


class TestTraceResult:
    """Tests for TraceResult dataclass."""

    def test_create_result(self) -> None:
        """Test creating TraceResult."""
        result = TraceResult(result="output", trace_id="abc123")

        assert result.result == "output"
        assert result.trace_id == "abc123"

    def test_generic_type(self) -> None:
        """Test TraceResult with complex types."""
        data = {"key": "value", "items": [1, 2, 3]}
        result = TraceResult(result=data, trace_id="def456")

        assert result.result == data
        assert result.result["items"] == [1, 2, 3]


class TestTraceFunction:
    """Tests for trace() function."""

    @pytest.mark.asyncio
    async def test_trace_with_string_name(self) -> None:
        """Test trace() with string name converts to TraceOptions."""
        async def my_func() -> str:
            return "result"

        with patch("agentmark_sdk.trace.otel_trace") as mock_otel:
            mock_tracer = MagicMock()
            mock_span = MagicMock()
            mock_span_ctx = MagicMock()
            mock_span_ctx.trace_id = 0x12345678901234567890123456789012
            mock_span_ctx.span_id = 0x1234567890123456
            mock_span.get_span_context.return_value = mock_span_ctx
            mock_span.__enter__ = lambda self: mock_span
            mock_span.__exit__ = lambda self, *args: None
            mock_tracer.start_as_current_span.return_value = mock_span
            mock_otel.get_tracer.return_value = mock_tracer

            result = await trace("my-trace", my_func)

            assert result.result == "result"
            mock_tracer.start_as_current_span.assert_called_once_with("my-trace")

    @pytest.mark.asyncio
    async def test_trace_with_options(self) -> None:
        """Test trace() with TraceOptions."""
        async def my_func(x: int) -> int:
            return x * 2

        with patch("agentmark_sdk.trace.otel_trace") as mock_otel:
            mock_tracer = MagicMock()
            mock_span = MagicMock()
            mock_span_ctx = MagicMock()
            mock_span_ctx.trace_id = 0x12345678901234567890123456789012
            mock_span_ctx.span_id = 0x1234567890123456
            mock_span.get_span_context.return_value = mock_span_ctx
            mock_span.__enter__ = lambda self: mock_span
            mock_span.__exit__ = lambda self, *args: None
            mock_tracer.start_as_current_span.return_value = mock_span
            mock_otel.get_tracer.return_value = mock_tracer

            opts = TraceOptions(name="multiply", user_id="user-1")
            result = await trace(opts, my_func, 5)

            assert result.result == 10

    @pytest.mark.asyncio
    async def test_trace_returns_trace_id(self) -> None:
        """Test that trace() returns correct trace ID format."""
        async def my_func() -> str:
            return "done"

        with patch("agentmark_sdk.trace.otel_trace") as mock_otel:
            mock_tracer = MagicMock()
            mock_span = MagicMock()
            mock_span_ctx = MagicMock()
            # Specific trace ID to verify formatting
            mock_span_ctx.trace_id = 0xABCDEF0123456789ABCDEF0123456789
            mock_span_ctx.span_id = 0x1234567890123456
            mock_span.get_span_context.return_value = mock_span_ctx
            mock_span.__enter__ = lambda self: mock_span
            mock_span.__exit__ = lambda self, *args: None
            mock_tracer.start_as_current_span.return_value = mock_span
            mock_otel.get_tracer.return_value = mock_tracer

            result = await trace("test", my_func)

            # Verify trace_id is a 32-character hex string
            assert len(result.trace_id) == 32
            assert result.trace_id == "abcdef0123456789abcdef0123456789"

    @pytest.mark.asyncio
    async def test_trace_sets_agentmark_attributes(self) -> None:
        """Test that trace() sets AgentMark-specific attributes."""
        async def my_func() -> str:
            return "done"

        with patch("agentmark_sdk.trace.otel_trace") as mock_otel:
            mock_tracer = MagicMock()
            mock_span = MagicMock()
            mock_span_ctx = MagicMock()
            mock_span_ctx.trace_id = 0x12345678901234567890123456789012
            mock_span_ctx.span_id = 0x1234567890123456
            mock_span.get_span_context.return_value = mock_span_ctx
            mock_span.__enter__ = lambda self: mock_span
            mock_span.__exit__ = lambda self, *args: None
            mock_tracer.start_as_current_span.return_value = mock_span
            mock_otel.get_tracer.return_value = mock_tracer

            opts = TraceOptions(
                name="my-trace",
                user_id="user-123",
                session_id="session-456",
                metadata={"env": "test"},
            )
            await trace(opts, my_func)

            # Verify attributes were set
            calls = mock_span.set_attribute.call_args_list
            attr_names = [call[0][0] for call in calls]

            assert "agentmark.trace_name" in attr_names
            assert "agentmark.user_id" in attr_names
            assert "agentmark.session_id" in attr_names
            assert "agentmark.metadata.env" in attr_names

    @pytest.mark.asyncio
    async def test_trace_handles_exception(self) -> None:
        """Test that trace() properly handles exceptions."""
        async def failing_func() -> None:
            raise ValueError("Something went wrong")

        with patch("agentmark_sdk.trace.otel_trace") as mock_otel:
            mock_tracer = MagicMock()
            mock_span = MagicMock()
            mock_span_ctx = MagicMock()
            mock_span_ctx.trace_id = 0x12345678901234567890123456789012
            mock_span_ctx.span_id = 0x1234567890123456
            mock_span.get_span_context.return_value = mock_span_ctx
            mock_span.__enter__ = lambda self: mock_span
            mock_span.__exit__ = lambda self, *args: None
            mock_tracer.start_as_current_span.return_value = mock_span
            mock_otel.get_tracer.return_value = mock_tracer

            with pytest.raises(ValueError, match="Something went wrong"):
                await trace("failing", failing_func)

            # Verify error status was set
            from opentelemetry.trace import StatusCode

            mock_span.set_status.assert_called()
            status_call = mock_span.set_status.call_args[0]
            assert status_call[0] == StatusCode.ERROR


class TestTraceContext:
    """Tests for TraceContext."""

    def test_set_attribute(self) -> None:
        """Test setting attributes on TraceContext."""
        mock_span = MagicMock()
        mock_tracer = MagicMock()

        ctx = TraceContext(
            trace_id="abc123",
            span_id="def456",
            _span=mock_span,
            _tracer=mock_tracer,
        )

        ctx.set_attribute("key", "value")

        mock_span.set_attribute.assert_called_once_with("key", "value")

    def test_add_event(self) -> None:
        """Test adding events to TraceContext."""
        mock_span = MagicMock()
        mock_tracer = MagicMock()

        ctx = TraceContext(
            trace_id="abc123",
            span_id="def456",
            _span=mock_span,
            _tracer=mock_tracer,
        )

        ctx.add_event("my-event", {"detail": "info"})

        mock_span.add_event.assert_called_once_with("my-event", {"detail": "info"})


class TestTraceContextManager:
    """Tests for trace_context() context manager."""

    @pytest.mark.asyncio
    async def test_trace_context_yields_context(self) -> None:
        """Test that trace_context() yields a TraceContext."""
        with patch("agentmark_sdk.trace.otel_trace") as mock_otel:
            mock_tracer = MagicMock()
            mock_span = MagicMock()
            mock_span_ctx = MagicMock()
            mock_span_ctx.trace_id = 0x12345678901234567890123456789012
            mock_span_ctx.span_id = 0x1234567890123456
            mock_span.get_span_context.return_value = mock_span_ctx
            mock_span.__enter__ = lambda self: mock_span
            mock_span.__exit__ = lambda self, *args: None
            mock_tracer.start_as_current_span.return_value = mock_span
            mock_otel.get_tracer.return_value = mock_tracer

            async with trace_context("my-trace") as ctx:
                assert isinstance(ctx, TraceContext)
                assert len(ctx.trace_id) == 32
                assert len(ctx.span_id) == 16

    @pytest.mark.asyncio
    async def test_trace_context_with_options(self) -> None:
        """Test trace_context() with TraceOptions."""
        with patch("agentmark_sdk.trace.otel_trace") as mock_otel:
            mock_tracer = MagicMock()
            mock_span = MagicMock()
            mock_span_ctx = MagicMock()
            mock_span_ctx.trace_id = 0x12345678901234567890123456789012
            mock_span_ctx.span_id = 0x1234567890123456
            mock_span.get_span_context.return_value = mock_span_ctx
            mock_span.__enter__ = lambda self: mock_span
            mock_span.__exit__ = lambda self, *args: None
            mock_tracer.start_as_current_span.return_value = mock_span
            mock_otel.get_tracer.return_value = mock_tracer

            opts = TraceOptions(name="my-trace", user_id="user-1")
            async with trace_context(opts) as ctx:
                ctx.set_attribute("custom", "value")

            mock_span.set_attribute.assert_called()
