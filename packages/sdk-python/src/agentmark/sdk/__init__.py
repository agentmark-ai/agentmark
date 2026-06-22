"""``agentmark.sdk`` — namespace alias for :mod:`agentmark_sdk`.

The AgentMark Python packages are converging on the ``agentmark.*`` namespace
(``agentmark.prompt_core`` already lives there). Explicit re-exports (kept in
sync with ``agentmark_sdk.__all__``) so both import paths work; new code
should prefer ``from agentmark.sdk import ...``. The flat name remains
supported.
"""

from agentmark_sdk import (
    AGENTMARK_KEY,
    AGENTMARK_SCORE_ENDPOINT,
    AGENTMARK_TRACE_ENDPOINT,
    DEFAULT_BASE_URL,
    METADATA_KEY,
    AgentMarkGroupingProcessor,
    AgentMarkSDK,
    AgentmarkSampler,
    CustomPattern,
    JsonOtlpSpanExporter,
    MaskFunction,
    MaskingSpanProcessor,
    PiiMaskerConfig,
    SpanContext,
    SpanKind,
    SpanOptions,
    SpanResult,
    create_agentmark_span_hooks,
    create_pii_masker,
    observe,
    serialize_value,
    span,
    span_context,
    span_context_sync,
    to_agentmark_attributes,
    with_agentmark,
)

__all__ = [
    "AGENTMARK_KEY",
    "AGENTMARK_SCORE_ENDPOINT",
    "AGENTMARK_TRACE_ENDPOINT",
    "DEFAULT_BASE_URL",
    "METADATA_KEY",
    "AgentMarkGroupingProcessor",
    "AgentMarkSDK",
    "AgentmarkSampler",
    "CustomPattern",
    "JsonOtlpSpanExporter",
    "MaskFunction",
    "MaskingSpanProcessor",
    "PiiMaskerConfig",
    "SpanContext",
    "SpanKind",
    "SpanOptions",
    "SpanResult",
    "create_agentmark_span_hooks",
    "create_pii_masker",
    "observe",
    "serialize_value",
    "span",
    "span_context",
    "span_context_sync",
    "to_agentmark_attributes",
    "with_agentmark",
]
