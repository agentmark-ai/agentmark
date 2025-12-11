"""Tracing utilities for AgentMark SDK.

Provides the trace() function for wrapping operations with OpenTelemetry spans.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Callable, Generic, TypeVar

from opentelemetry import trace as otel_trace
from opentelemetry.trace import Span, SpanKind, StatusCode, Tracer
from opentelemetry.util.types import Attributes

from .config import AGENTMARK_KEY, METADATA_KEY

T = TypeVar("T")


@dataclass
class TraceOptions:
    """Options for creating a trace.

    Attributes:
        name: Name of the trace/span.
        metadata: Additional metadata key-value pairs.
        session_id: Session identifier for grouping traces.
        session_name: Human-readable session name.
        user_id: User identifier.
        dataset_run_id: Dataset run identifier (for experiments).
        dataset_run_name: Dataset run name (for experiments).
        dataset_item_name: Dataset item name (for experiments).
        dataset_expected_output: Expected output for dataset item.
    """

    name: str
    metadata: dict[str, str] | None = None
    session_id: str | None = None
    session_name: str | None = None
    user_id: str | None = None
    dataset_run_id: str | None = None
    dataset_run_name: str | None = None
    dataset_item_name: str | None = None
    dataset_expected_output: str | None = None


@dataclass
class TraceContext:
    """Context passed to traced functions.

    Provides access to trace information and methods for adding
    attributes, events, and child spans.

    Attributes:
        trace_id: The trace ID in hex format.
        span_id: The span ID in hex format.
    """

    trace_id: str
    span_id: str
    _span: Span = field(repr=False)
    _tracer: Tracer = field(repr=False)

    def set_attribute(self, key: str, value: str | int | float | bool) -> None:
        """Set an attribute on this span.

        Args:
            key: Attribute key.
            value: Attribute value.
        """
        self._span.set_attribute(key, value)

    def add_event(
        self, name: str, attributes: dict[str, Any] | None = None
    ) -> None:
        """Add an event to this span.

        Args:
            name: Event name.
            attributes: Optional event attributes.
        """
        self._span.add_event(name, attributes or {})

    @asynccontextmanager
    async def span(
        self, name: str, metadata: dict[str, str] | None = None
    ) -> AsyncIterator[TraceContext]:
        """Create a child span within this trace.

        Args:
            name: Child span name.
            metadata: Optional metadata for the child span.

        Yields:
            TraceContext for the child span.
        """
        with self._tracer.start_as_current_span(name) as child_span:
            if metadata:
                for key, value in metadata.items():
                    child_span.set_attribute(f"{METADATA_KEY}.{key}", value)

            span_ctx = child_span.get_span_context()
            child_ctx = TraceContext(
                trace_id=self.trace_id,  # Same trace ID
                span_id=format(span_ctx.span_id, "016x"),
                _span=child_span,
                _tracer=self._tracer,
            )
            try:
                yield child_ctx
                child_span.set_status(StatusCode.OK)
            except Exception as e:
                child_span.set_status(StatusCode.ERROR, str(e))
                raise


@dataclass
class TraceResult(Generic[T]):
    """Result from trace execution.

    Attributes:
        result: The result of the traced function.
        trace_id: The trace ID for correlation.
    """

    result: T
    trace_id: str


def _set_agentmark_attributes(span: Span, options: TraceOptions) -> None:
    """Set AgentMark-specific attributes on a span.

    Args:
        span: The span to set attributes on.
        options: Trace options containing attribute values.
    """
    span.set_attribute(f"{AGENTMARK_KEY}.trace_name", options.name)

    if options.session_id:
        span.set_attribute(f"{AGENTMARK_KEY}.session_id", options.session_id)
    if options.session_name:
        span.set_attribute(f"{AGENTMARK_KEY}.session_name", options.session_name)
    if options.user_id:
        span.set_attribute(f"{AGENTMARK_KEY}.user_id", options.user_id)
    if options.dataset_run_id:
        span.set_attribute(f"{AGENTMARK_KEY}.dataset_run_id", options.dataset_run_id)
    if options.dataset_run_name:
        span.set_attribute(f"{AGENTMARK_KEY}.dataset_run_name", options.dataset_run_name)
    if options.dataset_item_name:
        span.set_attribute(f"{AGENTMARK_KEY}.dataset_item_name", options.dataset_item_name)
    if options.dataset_expected_output:
        span.set_attribute(
            f"{AGENTMARK_KEY}.dataset_expected_output", options.dataset_expected_output
        )

    if options.metadata:
        for key, value in options.metadata.items():
            span.set_attribute(f"{METADATA_KEY}.{key}", value)


async def trace(
    options: TraceOptions | str,
    fn: Callable[..., Any],
    *args: Any,
    **kwargs: Any,
) -> TraceResult[Any]:
    """Start a new trace and execute a function within it.

    Creates a root span, executes the provided function, and returns
    both the result and the trace ID.

    Args:
        options: Trace options or just a name string.
        fn: The async function to execute within the trace.
        *args: Positional arguments to pass to the function.
        **kwargs: Keyword arguments to pass to the function.

    Returns:
        TraceResult containing the function result and trace ID.

    Example:
        result = await trace(
            TraceOptions(name="my-operation", user_id="123"),
            my_async_function,
            arg1, arg2,
        )
        print(f"Result: {result.result}, Trace ID: {result.trace_id}")
    """
    if isinstance(options, str):
        options = TraceOptions(name=options)

    tracer = otel_trace.get_tracer("agentmark")

    with tracer.start_as_current_span(options.name) as span:
        _set_agentmark_attributes(span, options)

        span_ctx = span.get_span_context()
        ctx = TraceContext(
            trace_id=format(span_ctx.trace_id, "032x"),
            span_id=format(span_ctx.span_id, "016x"),
            _span=span,
            _tracer=tracer,
        )

        try:
            result = await fn(*args, **kwargs)
            span.set_status(StatusCode.OK)
            return TraceResult(result=result, trace_id=ctx.trace_id)
        except Exception as e:
            span.set_status(StatusCode.ERROR, str(e))
            raise


@asynccontextmanager
async def trace_context(
    options: TraceOptions | str,
) -> AsyncIterator[TraceContext]:
    """Create a trace as an async context manager.

    Alternative API for when you want to use a context manager instead
    of passing a function.

    Args:
        options: Trace options or just a name string.

    Yields:
        TraceContext with trace_id, span_id, and utility methods.

    Example:
        async with trace_context(TraceOptions(name="my-operation")) as ctx:
            print(f"Trace ID: {ctx.trace_id}")
            ctx.set_attribute("custom_key", "value")
            result = await my_async_function()
    """
    if isinstance(options, str):
        options = TraceOptions(name=options)

    tracer = otel_trace.get_tracer("agentmark")

    with tracer.start_as_current_span(options.name) as span:
        _set_agentmark_attributes(span, options)

        span_ctx = span.get_span_context()
        ctx = TraceContext(
            trace_id=format(span_ctx.trace_id, "032x"),
            span_id=format(span_ctx.span_id, "016x"),
            _span=span,
            _tracer=tracer,
        )

        try:
            yield ctx
            span.set_status(StatusCode.OK)
        except Exception as e:
            span.set_status(StatusCode.ERROR, str(e))
            raise
