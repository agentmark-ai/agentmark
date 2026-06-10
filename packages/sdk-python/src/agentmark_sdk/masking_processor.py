"""MaskingSpanProcessor — masks sensitive span attributes before export."""

from __future__ import annotations

import warnings
from typing import Callable, Sequence

from opentelemetry.context import Context
from opentelemetry.sdk.trace import ReadableSpan, Span, SpanProcessor


MaskFunction = Callable[[str], str]

# Content-bearing input attributes. Covers the AgentMark executor keys
# (gen_ai.request.*), the Vercel AI SDK experimental_telemetry keys (ai.*),
# the OTel GenAI semantic-convention keys (gen_ai.input.messages et al.,
# plus the legacy gen_ai.prompt), and the claude-agent-sdk adapter's tool
# keys (gen_ai.tool.input). NOTE: this list MUST stay identical to
# INPUT_KEYS in sdk/src/trace/masking-processor.ts.
INPUT_KEYS = frozenset({
    # AgentMark executor / SDK
    "gen_ai.request.input",
    "gen_ai.request.tool_calls",
    # Carries the full JSON-serialized dataset row input (experiment runs).
    "agentmark.dataset_input",
    # Vercel AI SDK (experimental_telemetry) — each is a JSON string except
    # ai.prompt.tools, which is an array of JSON strings (handled below).
    "ai.prompt",
    "ai.prompt.messages",
    "ai.prompt.tools",
    "ai.prompt.toolChoice",
    "ai.toolCall.args",
    # OTel GenAI semantic conventions
    "gen_ai.input.messages",
    "gen_ai.system_instructions",
    "gen_ai.tool.definitions",
    "gen_ai.tool.call.arguments",
    # Legacy OTel GenAI key
    "gen_ai.prompt",
    # claude-agent-sdk adapter tool spans
    "gen_ai.tool.input",
})

# Content-bearing output attributes. Same sources as INPUT_KEYS; the
# ai.result.* keys are the pre-v4 Vercel AI SDK aliases of ai.response.*.
# NOTE: this list MUST stay identical to OUTPUT_KEYS in
# sdk/src/trace/masking-processor.ts.
OUTPUT_KEYS = frozenset({
    # AgentMark executor / SDK
    "gen_ai.response.output",
    "gen_ai.response.output_object",
    # Vercel AI SDK (experimental_telemetry)
    "ai.response.text",
    "ai.response.toolCalls",
    "ai.response.object",
    "ai.result.text",
    "ai.result.toolCalls",
    "ai.result.object",
    "ai.toolCall.result",
    # OTel GenAI semantic conventions
    "gen_ai.output.messages",
    "gen_ai.tool.call.result",
    # Legacy OTel GenAI key
    "gen_ai.completion",
    # claude-agent-sdk adapter tool spans
    "gen_ai.tool.output",
})

# Keys not in SENSITIVE_KEYS are skipped entirely, so INPUT_KEYS/OUTPUT_KEYS
# membership alone would never redact them — derive the union so every
# input/output key is automatically sensitive (and mask-eligible).
SENSITIVE_KEYS = INPUT_KEYS | OUTPUT_KEYS

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
                is_sensitive = key in SENSITIVE_KEYS
                is_metadata = key.startswith(METADATA_PREFIX)

                if not is_sensitive and not is_metadata:
                    continue

                if isinstance(value, str):
                    attrs[key] = self._mask_value(key, value, is_sensitive)
                elif isinstance(value, (list, tuple)) and all(
                    isinstance(item, str) for item in value
                ):
                    # Some content attributes are string arrays (e.g. the
                    # Vercel AI SDK's ai.prompt.tools is an array of
                    # JSON-stringified tools). Mask element-wise to preserve
                    # the OTel array attribute type.
                    masked = [
                        self._mask_value(key, item, is_sensitive)
                        for item in value
                    ]
                    attrs[key] = tuple(masked) if isinstance(value, tuple) else masked

        except Exception as exc:
            warnings.warn(
                f"[agentmark] Masking error — span dropped: {exc}",
                stacklevel=2,
            )
            return

        # Forward to inner processor outside try/except so inner-processor
        # errors propagate normally with their own stack traces.
        self._inner.on_end(span)

    def _mask_value(self, key: str, value: str, is_sensitive: bool) -> str:
        current = value

        if is_sensitive:
            if key in INPUT_KEYS and self._hide_inputs:
                current = "[REDACTED]"
            if key in OUTPUT_KEYS and self._hide_outputs:
                current = "[REDACTED]"

        if self._mask:
            current = self._mask(current)

        return current

    def shutdown(self) -> None:
        self._inner.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._inner.force_flush(timeout_millis)
