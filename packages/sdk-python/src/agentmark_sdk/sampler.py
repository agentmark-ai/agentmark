"""Custom sampler for AgentMark traces."""

from __future__ import annotations

from typing import TYPE_CHECKING, Sequence

from opentelemetry import trace as otel_trace
from opentelemetry.context import Context
from opentelemetry.sdk.trace.sampling import (
    Decision,
    Sampler,
    SamplingResult,
)
from opentelemetry.trace import Link, SpanKind
from opentelemetry.util.types import Attributes

# Span attributes that indicate internal framework spans to filter out
FILTERED_ATTRIBUTE_KEYS = ["next.span_name", "next.clientComponentLoadCount"]


class AgentmarkSampler(Sampler):
    """Custom sampler that filters out internal framework spans.

    This sampler drops spans that have attributes indicating they are
    internal framework spans (e.g., Next.js internals) that would add
    noise to traces without providing useful debugging information.
    """

    def should_sample(
        self,
        parent_context: Context | None,
        trace_id: int,
        name: str,
        kind: SpanKind | None = None,
        attributes: Attributes | None = None,
        links: Sequence[Link] | None = None,
    ) -> SamplingResult:
        """Determine whether to sample this span.

        Args:
            parent_context: The parent context (if any).
            trace_id: The trace ID.
            name: The span name.
            kind: The span kind.
            attributes: Span attributes.
            links: Span links.

        Returns:
            SamplingResult indicating whether to record/sample.
        """
        # Check if any filtered attribute keys are present
        if attributes:
            for key in FILTERED_ATTRIBUTE_KEYS:
                if key in attributes:
                    return SamplingResult(Decision.DROP)

        # Forward the caller's attributes: per the OTel spec the sampler
        # result REPLACES the span's create-time attributes, so returning a
        # bare decision silently strips every attribute passed to
        # start_span(..., attributes=...) — including gen_ai.* attributes
        # from instrumentation libraries (e.g. botocore's Bedrock extension,
        # whose model/operation attributes vanished under this sampler).
        # Post-creation set_attribute calls were unaffected, which is why
        # this stayed hidden. trace_state is forwarded from the parent span
        # context, matching the SDK's built-in StaticSampler behavior.
        parent_span_context = otel_trace.get_current_span(parent_context).get_span_context()
        return SamplingResult(
            Decision.RECORD_AND_SAMPLE,
            attributes,
            parent_span_context.trace_state,
        )

    def get_description(self) -> str:
        """Return a description of this sampler."""
        return "AgentmarkSampler"
