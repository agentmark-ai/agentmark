"""Tests for MaskingSpanProcessor."""

from __future__ import annotations

import warnings
from unittest.mock import MagicMock

from agentmark_sdk.masking_processor import MaskingSpanProcessor


def _make_span(attrs: dict[str, object]) -> MagicMock:
    span = MagicMock()
    span.attributes = dict(attrs)
    return span


class TestMaskingProcessor:
    """Tests for MaskingSpanProcessor masking logic."""

    def test_mask_function_applied_to_sensitive_keys(self) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(
            inner=inner,
            mask=lambda d: d.replace("secret", "[MASKED]"),
        )
        span = _make_span({
            "gen_ai.request.input": "my secret prompt",
            "gen_ai.response.output": "secret output",
            "gen_ai.response.output_object": "secret obj",
            "gen_ai.request.tool_calls": "secret tools",
        })

        processor.on_end(span)

        assert span.attributes["gen_ai.request.input"] == "my [MASKED] prompt"
        assert span.attributes["gen_ai.response.output"] == "[MASKED] output"
        assert span.attributes["gen_ai.response.output_object"] == "[MASKED] obj"
        assert span.attributes["gen_ai.request.tool_calls"] == "[MASKED] tools"
        inner.on_end.assert_called_once_with(span)

    def test_mask_function_applied_to_metadata(self) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(
            inner=inner,
            mask=lambda d: d.replace("pii", "[MASKED]"),
        )
        span = _make_span({
            "agentmark.metadata.user_email": "pii@example.com",
            "agentmark.metadata.notes": "contains pii",
        })

        processor.on_end(span)

        assert span.attributes["agentmark.metadata.user_email"] == "[MASKED]@example.com"
        assert span.attributes["agentmark.metadata.notes"] == "contains [MASKED]"

    def test_non_sensitive_keys_not_masked(self) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(
            inner=inner,
            mask=lambda d: "[MASKED]",
        )
        span = _make_span({
            "service.name": "my-service",
            "gen_ai.request.model": "gpt-4",
            "gen_ai.usage.tokens": 100,
            "gen_ai.request.input": "sensitive",
        })

        processor.on_end(span)

        assert span.attributes["service.name"] == "my-service"
        assert span.attributes["gen_ai.request.model"] == "gpt-4"
        assert span.attributes["gen_ai.usage.tokens"] == 100
        assert span.attributes["gen_ai.request.input"] == "[MASKED]"

    def test_non_string_values_skipped(self) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(
            inner=inner,
            mask=lambda d: "[MASKED]",
        )
        span = _make_span({
            "gen_ai.request.input": 42,
            "gen_ai.response.output": True,
        })

        processor.on_end(span)

        assert span.attributes["gen_ai.request.input"] == 42
        assert span.attributes["gen_ai.response.output"] is True

    def test_hide_inputs(self) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(inner=inner, hide_inputs=True)
        span = _make_span({
            "gen_ai.request.input": "my prompt",
            "gen_ai.request.tool_calls": "tool args",
            "gen_ai.response.output": "model response",
        })

        processor.on_end(span)

        assert span.attributes["gen_ai.request.input"] == "[REDACTED]"
        assert span.attributes["gen_ai.request.tool_calls"] == "[REDACTED]"
        assert span.attributes["gen_ai.response.output"] == "model response"

    def test_hide_outputs(self) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(inner=inner, hide_outputs=True)
        span = _make_span({
            "gen_ai.request.input": "my prompt",
            "gen_ai.response.output": "model response",
            "gen_ai.response.output_object": '{"key": "value"}',
        })

        processor.on_end(span)

        assert span.attributes["gen_ai.request.input"] == "my prompt"
        assert span.attributes["gen_ai.response.output"] == "[REDACTED]"
        assert span.attributes["gen_ai.response.output_object"] == "[REDACTED]"

    def test_env_vars_override_mask_function(self) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(
            inner=inner,
            mask=lambda d: d.upper(),
            hide_inputs=True,
        )
        span = _make_span({"gen_ai.request.input": "prompt"})

        processor.on_end(span)

        # hide_inputs replaces with [REDACTED], then mask uppercases it
        assert span.attributes["gen_ai.request.input"] == "[REDACTED]"

    def test_mask_error_drops_span(self) -> None:
        inner = MagicMock()

        def bad_mask(data: str) -> str:
            raise ValueError("boom")

        processor = MaskingSpanProcessor(inner=inner, mask=bad_mask)
        span = _make_span({"gen_ai.request.input": "prompt"})

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            processor.on_end(span)

        inner.on_end.assert_not_called()
        assert len(w) == 1
        assert "Masking error" in str(w[0].message)
        assert "boom" in str(w[0].message)

    def test_no_mask_no_hide_passes_through(self) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(inner=inner)
        span = _make_span({"gen_ai.request.input": "unchanged"})

        processor.on_end(span)

        assert span.attributes["gen_ai.request.input"] == "unchanged"
        inner.on_end.assert_called_once_with(span)

    def test_on_start_delegates(self) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(inner=inner)
        span = MagicMock()

        processor.on_start(span, None)

        inner.on_start.assert_called_once_with(span, None)

    def test_shutdown_delegates(self) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(inner=inner)

        processor.shutdown()

        inner.shutdown.assert_called_once()

    def test_force_flush_delegates(self) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(inner=inner)

        processor.force_flush()

        inner.force_flush.assert_called_once_with(30000)
