"""Custom sampler for AgentMark traces."""

from __future__ import annotations

from typing import TYPE_CHECKING, Sequence

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

        return SamplingResult(Decision.RECORD_AND_SAMPLE)

    def get_description(self) -> str:
        """Return a description of this sampler."""
        return "AgentmarkSampler"
