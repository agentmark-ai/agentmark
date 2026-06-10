"""Tests for MaskingSpanProcessor."""

from __future__ import annotations

import warnings
from unittest.mock import MagicMock

import pytest

from agentmark_sdk.masking_processor import (
    INPUT_KEYS,
    OUTPUT_KEYS,
    MaskingSpanProcessor,
)


def _make_span(attrs: dict[str, object]) -> MagicMock:
    span = MagicMock()
    span.attributes = dict(attrs)
    return span


# The canonical key sets. Pinned as literal sorted lists so that removing
# (or typo-ing) a single key from the production sets fails this suite
# loudly — these keys are a privacy contract, not an implementation detail.
# They MUST stay identical to the TS SDK's masking-processor.ts sets.
EXPECTED_INPUT_KEYS = [
    "agentmark.dataset_input",
    "agentmark.request.input",
    "ai.prompt",
    "ai.prompt.messages",
    "ai.prompt.toolChoice",
    "ai.prompt.tools",
    "ai.toolCall.args",
    "gen_ai.input.messages",
    "gen_ai.prompt",
    "gen_ai.request.input",
    "gen_ai.request.tool_calls",
    "gen_ai.system_instructions",
    "gen_ai.tool.call.arguments",
    "gen_ai.tool.definitions",
    "gen_ai.tool.input",
]

EXPECTED_OUTPUT_KEYS = [
    "agentmark.response.output",
    "ai.response.object",
    "ai.response.text",
    "ai.response.toolCalls",
    "ai.result.object",
    "ai.result.text",
    "ai.result.toolCalls",
    "ai.toolCall.result",
    "gen_ai.completion",
    "gen_ai.output.messages",
    "gen_ai.response.output",
    "gen_ai.response.output_object",
    "gen_ai.tool.call.result",
    "gen_ai.tool.output",
]


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


class TestSensitiveKeyCoverage:
    """Pins the sensitive-key privacy contract and exercises every key."""

    def test_input_keys_exactly_equal_the_documented_privacy_contract(self) -> None:
        assert sorted(INPUT_KEYS) == EXPECTED_INPUT_KEYS

    def test_output_keys_exactly_equal_the_documented_privacy_contract(self) -> None:
        assert sorted(OUTPUT_KEYS) == EXPECTED_OUTPUT_KEYS

    @pytest.mark.parametrize("key", EXPECTED_INPUT_KEYS)
    def test_input_key_redacted_when_hide_inputs(self, key: str) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(inner=inner, hide_inputs=True)
        span = _make_span({key: "sensitive content"})

        processor.on_end(span)

        assert span.attributes[key] == "[REDACTED]"
        inner.on_end.assert_called_once_with(span)

    @pytest.mark.parametrize("key", EXPECTED_OUTPUT_KEYS)
    def test_output_key_redacted_when_hide_outputs(self, key: str) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(inner=inner, hide_outputs=True)
        span = _make_span({key: "sensitive content"})

        processor.on_end(span)

        assert span.attributes[key] == "[REDACTED]"
        inner.on_end.assert_called_once_with(span)

    @pytest.mark.parametrize("key", EXPECTED_OUTPUT_KEYS)
    def test_output_key_not_redacted_when_only_hide_inputs(self, key: str) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(inner=inner, hide_inputs=True)
        span = _make_span({key: "visible output"})

        processor.on_end(span)

        assert span.attributes[key] == "visible output"

    @pytest.mark.parametrize("key", EXPECTED_INPUT_KEYS)
    def test_input_key_not_redacted_when_only_hide_outputs(self, key: str) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(inner=inner, hide_outputs=True)
        span = _make_span({key: "visible input"})

        processor.on_end(span)

        assert span.attributes[key] == "visible input"

    def test_string_array_redacted_element_wise(self) -> None:
        # The Vercel AI SDK emits ai.prompt.tools as an array of JSON strings;
        # OTel Python stores array attributes as tuples.
        inner = MagicMock()
        processor = MaskingSpanProcessor(inner=inner, hide_inputs=True)
        span = _make_span({
            "ai.prompt.tools": ('{"name": "search"}', '{"name": "calculator"}'),
        })

        processor.on_end(span)

        assert span.attributes["ai.prompt.tools"] == ("[REDACTED]", "[REDACTED]")

    def test_mask_function_applied_element_wise_to_string_array(self) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(
            inner=inner,
            mask=lambda d: d.replace("secret", "[MASKED]"),
        )
        span = _make_span({
            "ai.prompt.tools": ['{"name": "secret-tool"}', '{"name": "public-tool"}'],
        })

        processor.on_end(span)

        assert span.attributes["ai.prompt.tools"] == [
            '{"name": "[MASKED]-tool"}',
            '{"name": "public-tool"}',
        ]

    def test_mask_function_applied_to_new_keys(self) -> None:
        inner = MagicMock()
        processor = MaskingSpanProcessor(
            inner=inner,
            mask=lambda d: d.replace("secret", "[MASKED]"),
        )
        span = _make_span({
            "ai.prompt.messages": '[{"role": "user", "content": "secret question"}]',
            "ai.response.text": "secret answer",
            "gen_ai.input.messages": '[{"role": "user", "parts": ["secret"]}]',
            "gen_ai.completion": "the secret completion",
            "gen_ai.tool.input": '{"query": "secret"}',
            "gen_ai.tool.output": "secret tool result",
        })

        processor.on_end(span)

        assert span.attributes["ai.prompt.messages"] == (
            '[{"role": "user", "content": "[MASKED] question"}]'
        )
        assert span.attributes["ai.response.text"] == "[MASKED] answer"
        assert span.attributes["gen_ai.input.messages"] == (
            '[{"role": "user", "parts": ["[MASKED]"]}]'
        )
        assert span.attributes["gen_ai.completion"] == "the [MASKED] completion"
        assert span.attributes["gen_ai.tool.input"] == '{"query": "[MASKED]"}'
        assert span.attributes["gen_ai.tool.output"] == "[MASKED] tool result"

    def test_operational_keys_untouched_under_full_suppression(self) -> None:
        inner = MagicMock()
        mask = MagicMock(return_value="[MASKED]")
        processor = MaskingSpanProcessor(
            inner=inner,
            mask=mask,
            hide_inputs=True,
            hide_outputs=True,
        )
        span = _make_span({
            "ai.model.id": "gpt-4o",
            "ai.operationId": "ai.generateText",
            "ai.response.finishReason": "stop",
            "ai.toolCall.name": "search",
            "ai.toolCall.id": "call_123",
            "gen_ai.request.model": "claude-sonnet-4",
            "gen_ai.tool.name": "search",
            "gen_ai.usage.input_tokens": 12,
        })

        processor.on_end(span)

        assert span.attributes["ai.model.id"] == "gpt-4o"
        assert span.attributes["ai.operationId"] == "ai.generateText"
        assert span.attributes["ai.response.finishReason"] == "stop"
        assert span.attributes["ai.toolCall.name"] == "search"
        assert span.attributes["ai.toolCall.id"] == "call_123"
        assert span.attributes["gen_ai.request.model"] == "claude-sonnet-4"
        assert span.attributes["gen_ai.tool.name"] == "search"
        assert span.attributes["gen_ai.usage.input_tokens"] == 12
        mask.assert_not_called()
