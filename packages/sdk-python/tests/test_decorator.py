"""Tests for @observe decorator."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from agentmark_sdk import SpanKind, observe


def _mock_otel():
    """Create a mock OTel tracer setup that returns a usable mock span."""
    mock_otel = MagicMock()
    mock_tracer = MagicMock()
    mock_span = MagicMock()
    mock_span.__enter__ = lambda self: mock_span
    mock_span.__exit__ = lambda self, *args: None
    mock_tracer.start_as_current_span.return_value = mock_span
    mock_otel.get_tracer.return_value = mock_tracer
    return mock_otel, mock_tracer, mock_span


class TestObserveDecorator:
    """Tests for the @observe decorator."""

    @pytest.mark.asyncio
    async def test_basic_async_function(self) -> None:
        """Auto-captures args and return value for async functions."""
        mock_otel_mod, mock_tracer, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe
            async def my_func(name: str, count: int) -> dict[str, Any]:
                return {"name": name, "count": count}

            result = await my_func("test", 5)

        assert result == {"name": "test", "count": 5}
        mock_tracer.start_as_current_span.assert_called_once_with("my_func")

        # Check IO attributes were set
        calls = {call[0][0]: call[0][1] for call in mock_span.set_attribute.call_args_list}
        assert "gen_ai.request.input" in calls
        assert "gen_ai.response.output" in calls
        assert '"name": "test"' in calls["gen_ai.request.input"]
        assert '"count": 5' in calls["gen_ai.response.output"]

    def test_basic_sync_function(self) -> None:
        """Auto-captures args and return value for sync functions."""
        mock_otel_mod, mock_tracer, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe
            def my_func(x: int, y: int) -> int:
                return x + y

            result = my_func(3, 4)

        assert result == 7
        mock_tracer.start_as_current_span.assert_called_once_with("my_func")

        calls = {call[0][0]: call[0][1] for call in mock_span.set_attribute.call_args_list}
        assert '"x": 3' in calls["gen_ai.request.input"]
        assert calls["gen_ai.response.output"] == "7"

    @pytest.mark.asyncio
    async def test_custom_name(self) -> None:
        """Uses custom span name when provided."""
        mock_otel_mod, mock_tracer, _ = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe(name="custom-span")
            async def my_func() -> str:
                return "ok"

            await my_func()

        mock_tracer.start_as_current_span.assert_called_once_with("custom-span")

    @pytest.mark.asyncio
    async def test_span_kind(self) -> None:
        """Sets agentmark.span.kind attribute."""
        mock_otel_mod, _, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe(kind=SpanKind.TOOL)
            async def my_tool(query: str) -> list[str]:
                return [query]

            await my_tool("test")

        calls = {call[0][0]: call[0][1] for call in mock_span.set_attribute.call_args_list}
        assert calls["agentmark.span.kind"] == "tool"

    @pytest.mark.asyncio
    async def test_default_span_kind_is_function(self) -> None:
        """Default span kind is FUNCTION."""
        mock_otel_mod, _, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe
            async def my_func() -> str:
                return "ok"

            await my_func()

        calls = {call[0][0]: call[0][1] for call in mock_span.set_attribute.call_args_list}
        assert calls["agentmark.span.kind"] == "function"

    @pytest.mark.asyncio
    async def test_capture_input_false(self) -> None:
        """Skips input capture when disabled."""
        mock_otel_mod, _, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe(capture_input=False)
            async def my_func(secret: str) -> str:
                return "ok"

            await my_func("password123")

        attr_keys = [call[0][0] for call in mock_span.set_attribute.call_args_list]
        assert "gen_ai.request.input" not in attr_keys
        assert "gen_ai.response.output" in attr_keys

    @pytest.mark.asyncio
    async def test_capture_output_false(self) -> None:
        """Skips output capture when disabled."""
        mock_otel_mod, _, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe(capture_output=False)
            async def my_func(query: str) -> str:
                return "sensitive-result"

            await my_func("test")

        attr_keys = [call[0][0] for call in mock_span.set_attribute.call_args_list]
        assert "gen_ai.request.input" in attr_keys
        assert "gen_ai.response.output" not in attr_keys

    @pytest.mark.asyncio
    async def test_process_inputs(self) -> None:
        """Applies process_inputs transform before serialization."""
        mock_otel_mod, _, mock_span = _mock_otel()

        def redact(inputs: dict[str, Any]) -> dict[str, Any]:
            return {k: "***" if k == "api_key" else v for k, v in inputs.items()}

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe(process_inputs=redact)
            async def call_api(api_key: str, query: str) -> str:
                return "result"

            await call_api("sk-secret", "hello")

        calls = {call[0][0]: call[0][1] for call in mock_span.set_attribute.call_args_list}
        input_str = calls["gen_ai.request.input"]
        assert "sk-secret" not in input_str
        assert '"***"' in input_str
        assert '"hello"' in input_str

    @pytest.mark.asyncio
    async def test_process_outputs(self) -> None:
        """Applies process_outputs transform before serialization."""
        mock_otel_mod, _, mock_span = _mock_otel()

        def summarize(output: Any) -> Any:
            return {"type": type(output).__name__, "length": len(output)}

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe(process_outputs=summarize)
            async def get_data() -> list[int]:
                return [1, 2, 3, 4, 5]

            await get_data()

        calls = {call[0][0]: call[0][1] for call in mock_span.set_attribute.call_args_list}
        output_str = calls["gen_ai.response.output"]
        assert '"type": "list"' in output_str
        assert '"length": 5' in output_str

    @pytest.mark.asyncio
    async def test_error_sets_error_status(self) -> None:
        """Sets ERROR status on span when function raises."""
        mock_otel_mod, _, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe
            async def failing() -> None:
                raise ValueError("boom")

            with pytest.raises(ValueError, match="boom"):
                await failing()

        from opentelemetry.trace import StatusCode

        mock_span.set_status.assert_called_once()
        assert mock_span.set_status.call_args[0][0] == StatusCode.ERROR

    @pytest.mark.asyncio
    async def test_error_does_not_capture_output(self) -> None:
        """Does not set output attribute when function raises."""
        mock_otel_mod, _, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe
            async def failing() -> None:
                raise ValueError("boom")

            with pytest.raises(ValueError):
                await failing()

        attr_keys = [call[0][0] for call in mock_span.set_attribute.call_args_list]
        assert "gen_ai.response.output" not in attr_keys

    @pytest.mark.asyncio
    async def test_excludes_self_from_inputs(self) -> None:
        """Excludes self parameter from method input capture."""
        mock_otel_mod, _, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            class MyClass:
                @observe
                async def my_method(self, query: str) -> str:
                    return query

            obj = MyClass()
            await obj.my_method("test")

        calls = {call[0][0]: call[0][1] for call in mock_span.set_attribute.call_args_list}
        input_str = calls["gen_ai.request.input"]
        assert "self" not in input_str
        assert '"query": "test"' in input_str

    @pytest.mark.asyncio
    async def test_pydantic_model_in_args(self) -> None:
        """Serializes Pydantic model arguments correctly."""
        pytest.importorskip("pydantic")
        from pydantic import BaseModel

        class Config(BaseModel):
            model_name: str
            temperature: float

        mock_otel_mod, _, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe
            async def run_model(config: Config) -> str:
                return "done"

            await run_model(Config(model_name="gpt-4", temperature=0.7))

        calls = {call[0][0]: call[0][1] for call in mock_span.set_attribute.call_args_list}
        input_str = calls["gen_ai.request.input"]
        assert "gpt-4" in input_str
        assert "0.7" in input_str

    @pytest.mark.asyncio
    async def test_pydantic_model_as_return(self) -> None:
        """Serializes Pydantic model return values correctly."""
        pytest.importorskip("pydantic")
        from pydantic import BaseModel

        class Result(BaseModel):
            status: str
            count: int

        mock_otel_mod, _, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe
            async def get_result() -> Result:
                return Result(status="ok", count=42)

            await get_result()

        calls = {call[0][0]: call[0][1] for call in mock_span.set_attribute.call_args_list}
        output_str = calls["gen_ai.response.output"]
        assert '"status": "ok"' in output_str
        assert '"count": 42' in output_str

    @pytest.mark.asyncio
    async def test_preserves_function_name(self) -> None:
        """Wrapper preserves original function name via functools.wraps."""
        mock_otel_mod, _, _ = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe
            async def important_function() -> str:
                return "ok"

            assert important_function.__name__ == "important_function"

    @pytest.mark.asyncio
    async def test_parentheses_optional(self) -> None:
        """@observe and @observe() both work."""
        mock_otel_mod, _, _ = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe()
            async def func_with_parens() -> str:
                return "ok"

            @observe
            async def func_without_parens() -> str:
                return "ok"

            assert await func_with_parens() == "ok"
            assert await func_without_parens() == "ok"

    @pytest.mark.parametrize(
        "kind,expected",
        [
            (SpanKind.AGENT, "agent"),
            (SpanKind.RETRIEVAL, "retrieval"),
            (SpanKind.EMBEDDING, "embedding"),
            (SpanKind.GUARDRAIL, "guardrail"),
        ],
    )
    @pytest.mark.asyncio
    async def test_new_span_kinds(self, kind: SpanKind, expected: str) -> None:
        """Sets agentmark.span.kind for new span kind values."""
        mock_otel_mod, _, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe(kind=kind)
            async def my_func() -> str:
                return "ok"

            await my_func()

        calls = {call[0][0]: call[0][1] for call in mock_span.set_attribute.call_args_list}
        assert calls["agentmark.span.kind"] == expected

    @pytest.mark.asyncio
    async def test_openinference_attribute_async(self) -> None:
        """Async function sets both agentmark and openinference span kind attributes."""
        mock_otel_mod, _, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe(kind=SpanKind.TOOL)
            async def my_tool() -> str:
                return "ok"

            await my_tool()

        calls = {call[0][0]: call[0][1] for call in mock_span.set_attribute.call_args_list}
        assert calls["agentmark.span.kind"] == "tool"
        assert calls["openinference.span.kind"] == "TOOL"

    def test_openinference_attribute_sync(self) -> None:
        """Sync function sets both agentmark and openinference span kind attributes."""
        mock_otel_mod, _, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe(kind=SpanKind.TOOL)
            def my_tool() -> str:
                return "ok"

            my_tool()

        calls = {call[0][0]: call[0][1] for call in mock_span.set_attribute.call_args_list}
        assert calls["agentmark.span.kind"] == "tool"
        assert calls["openinference.span.kind"] == "TOOL"

    @pytest.mark.parametrize(
        "kind,expected_oi",
        [
            (SpanKind.FUNCTION, "CHAIN"),
            (SpanKind.LLM, "LLM"),
            (SpanKind.TOOL, "TOOL"),
            (SpanKind.AGENT, "AGENT"),
            (SpanKind.RETRIEVAL, "RETRIEVER"),
            (SpanKind.EMBEDDING, "EMBEDDING"),
            (SpanKind.GUARDRAIL, "GUARDRAIL"),
        ],
    )
    @pytest.mark.asyncio
    async def test_openinference_mapping_values(self, kind: SpanKind, expected_oi: str) -> None:
        """Maps each SpanKind to the correct openinference.span.kind value."""
        mock_otel_mod, _, mock_span = _mock_otel()

        with patch("agentmark_sdk.decorator.otel_trace", mock_otel_mod):

            @observe(kind=kind)
            async def my_func() -> str:
                return "ok"

            await my_func()

        calls = {call[0][0]: call[0][1] for call in mock_span.set_attribute.call_args_list}
        assert calls["openinference.span.kind"] == expected_oi
