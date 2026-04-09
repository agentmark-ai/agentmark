"""MaskingSpanProcessor — masks sensitive span attributes before export."""

from __future__ import annotations

import warnings
from typing import Callable, Sequence

from opentelemetry.context import Context
from opentelemetry.sdk.trace import ReadableSpan, Span, SpanProcessor


MaskFunction = Callable[[str], str]

SENSITIVE_KEYS = frozenset({
    "gen_ai.request.input",
    "gen_ai.response.output",
    "gen_ai.response.output_object",
    "gen_ai.request.tool_calls",
})

INPUT_KEYS = frozenset({
    "gen_ai.request.input",
    "gen_ai.request.tool_calls",
})

OUTPUT_KEYS = frozenset({
    "gen_ai.response.output",
    "gen_ai.response.output_object",
})

METADATA_PREFIX = "agentmark.metadata."


class MaskingSpanProcessor(SpanProcessor):
    """Wraps an inner SpanProcessor and masks sensitive attributes before export.

    Fail-closed: if the mask function throws, the span is dropped entirely.
    """

    def __init__(
        self,
        inner: SpanProcessor,
        mask: MaskFunction | None = None,
        hide_inputs: bool = False,
        hide_outputs: bool = False,
    ) -> None:
        self._inner = inner
        self._mask = mask
        self._hide_inputs = hide_inputs
        self._hide_outputs = hide_outputs

    def on_start(self, span: Span, parent_context: Context | None = None) -> None:
        self._inner.on_start(span, parent_context)

    def on_end(self, span: ReadableSpan) -> None:
        try:
            # ReadableSpan.attributes is a read-only Mapping, but the underlying
            # object is a mutable dict we can write to.
            attrs: dict[str, object] = span.attributes  # type: ignore[assignment]

            for key in list(attrs.keys()):
                value = attrs[key]
                if not isinstance(value, str):
                    continue

                is_sensitive = key in SENSITIVE_KEYS
                is_metadata = key.startswith(METADATA_PREFIX)

                if not is_sensitive and not is_metadata:
                    continue

                current = value

                if is_sensitive:
                    if key in INPUT_KEYS and self._hide_inputs:
                        current = "[REDACTED]"
                    if key in OUTPUT_KEYS and self._hide_outputs:
                        current = "[REDACTED]"

                if self._mask:
                    current = self._mask(current)

                attrs[key] = current

        except Exception as exc:
            warnings.warn(
                f"[agentmark] Masking error — span dropped: {exc}",
                stacklevel=2,
            )
            return

        # Forward to inner processor outside try/except so inner-processor
        # errors propagate normally with their own stack traces.
        self._inner.on_end(span)

    def shutdown(self) -> None:
        self._inner.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._inner.force_flush(timeout_millis)
