"""Decorator-based tracing for automatic IO capture.

Provides the @observe decorator that auto-captures function arguments
as span input and return values as span output.
"""

from __future__ import annotations

import functools
import inspect
from enum import Enum
from typing import Any, Callable, TypeVar, overload

from opentelemetry import trace as otel_trace
from opentelemetry.trace import StatusCode

from .config import AGENTMARK_KEY
from .serialize import serialize_value

F = TypeVar("F", bound=Callable[..., Any])

# Legacy attribute keys.
#
# Deprecated: ``gen_ai.request.input`` / ``gen_ai.response.output`` are NOT
# part of the OTel GenAI semantic conventions — they live inside the reserved
# ``gen_ai.*`` namespace and will collide with the spec once it stabilizes
# (the spec uses ``gen_ai.input.messages`` / ``gen_ai.output.messages`` with a
# structured message schema). ``@observe`` wraps arbitrary functions, not model
# calls, so its IO now also goes to the vendor-namespaced
# ``agentmark.request.input`` / ``agentmark.response.output`` keys. The legacy
# gen_ai-namespaced keys are dual-emitted for one release cycle and will be
# removed in a future release. Mirrors LEGACY_INPUT_KEY in the TS SDK's
# trace/traced.ts.
LEGACY_INPUT_KEY = "gen_ai.request.input"
LEGACY_OUTPUT_KEY = "gen_ai.response.output"
# Vendor-namespaced IO keys for generic (non-model) observed functions.
INPUT_KEY = f"{AGENTMARK_KEY}.request.input"
OUTPUT_KEY = f"{AGENTMARK_KEY}.response.output"
SPAN_KIND_KEY = f"{AGENTMARK_KEY}.span.kind"


class SpanKind(str, Enum):
    """Span kind for categorizing observed operations."""

    FUNCTION = "function"
    LLM = "llm"
    TOOL = "tool"
    AGENT = "agent"
    RETRIEVAL = "retrieval"
    EMBEDDING = "embedding"
    GUARDRAIL = "guardrail"


_OPENINFERENCE_KIND_MAP = {
    "function": "CHAIN",
    "llm": "LLM",
    "tool": "TOOL",
    "agent": "AGENT",
    "retrieval": "RETRIEVER",
    "embedding": "EMBEDDING",
    "guardrail": "GUARDRAIL",
}


def _capture_inputs(
    fn: Callable[..., Any],
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
    process_inputs: Callable[[dict[str, Any]], dict[str, Any]] | None,
) -> str | None:
    """Capture function arguments as a serialized input string."""
    try:
        sig = inspect.signature(fn)
        bound = sig.bind(*args, **kwargs)
        bound.apply_defaults()
        inputs = dict(bound.arguments)
    except (TypeError, ValueError):
        # Fallback if signature binding fails
        inputs = {"args": list(args), "kwargs": kwargs} if kwargs else {"args": list(args)}

    if process_inputs is not None:
        # Pass raw args (including self) to custom processor
        inputs = process_inputs(inputs)
    # Exclude self/cls for methods (after process_inputs so it can access self)
    inputs.pop("self", None)
    inputs.pop("cls", None)

    return serialize_value(inputs)


def _capture_output(
    result: Any,
    process_outputs: Callable[[Any], Any] | None,
) -> str | None:
    """Capture function return value as a serialized output string."""
    output = result
    if process_outputs is not None:
        output = process_outputs(output)
    return serialize_value(output)


def _aggregate_stream_items(items: list[Any]) -> Any:
    """Aggregate yielded items into a single output value.

    All-string streams (the common LLM text-delta shape) concatenate;
    anything else is captured as the list of yielded items.
    """
    if items and all(isinstance(i, str) for i in items):
        return "".join(items)
    return items


@overload
def observe(_fn: F) -> F: ...


@overload
def observe(
    _fn: None = None,
    *,
    name: str | None = None,
    kind: SpanKind = SpanKind.FUNCTION,
    capture_input: bool = True,
    capture_output: bool = True,
    process_inputs: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    process_outputs: Callable[[Any], Any] | None = None,
) -> Callable[[F], F]: ...


def observe(
    _fn: F | None = None,
    *,
    name: str | None = None,
    kind: SpanKind = SpanKind.FUNCTION,
    capture_input: bool = True,
    capture_output: bool = True,
    process_inputs: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    process_outputs: Callable[[Any], Any] | None = None,
) -> F | Callable[[F], F]:
    """Decorator that auto-captures function IO as span attributes.

    Supports both @observe and @observe() syntax; sync and async functions;
    and sync/async GENERATOR functions — for generators the span stays open
    until the stream is exhausted (not just until the generator object is
    created) and the output is the aggregated yields (concatenated when all
    items are strings, the item list otherwise).

    Args:
        name: Custom span name. Defaults to the function name.
        kind: Span kind for categorization. Defaults to SpanKind.FUNCTION.
        capture_input: Whether to capture function args as input. Default True.
        capture_output: Whether to capture return value as output. Default True.
        process_inputs: Optional transform applied to inputs before serialization.
        process_outputs: Optional transform applied to output before serialization.

    Example:
        @observe
        async def my_function(item_type: str) -> dict:
            return {"result": "data"}

        @observe(name="custom-name", kind=SpanKind.TOOL)
        async def call_api(query: str) -> dict:
            ...

        @observe(process_inputs=lambda inputs: {k: v for k, v in inputs.items() if k != "api_key"})
        async def call_api(api_key: str, query: str) -> dict:
            ...
    """

    def decorator(fn: F) -> F:
        span_name = name or fn.__name__

        @functools.wraps(fn)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            tracer = otel_trace.get_tracer("agentmark")
            with tracer.start_as_current_span(span_name) as span:
                span.set_attribute(SPAN_KIND_KEY, kind.value)
                span.set_attribute("openinference.span.kind", _OPENINFERENCE_KIND_MAP.get(kind.value, "CHAIN"))

                if capture_input:
                    input_str = _capture_inputs(fn, args, kwargs, process_inputs)
                    if input_str is not None:
                        span.set_attribute(INPUT_KEY, input_str)
                        # Deprecated dual-emit -- see LEGACY_INPUT_KEY above.
                        span.set_attribute(LEGACY_INPUT_KEY, input_str)

                try:
                    result = await fn(*args, **kwargs)
                    if capture_output:
                        output_str = _capture_output(result, process_outputs)
                        if output_str is not None:
                            span.set_attribute(OUTPUT_KEY, output_str)
                            # Deprecated dual-emit -- see LEGACY_OUTPUT_KEY above.
                            span.set_attribute(LEGACY_OUTPUT_KEY, output_str)
                    span.set_status(StatusCode.OK)
                    return result
                except Exception as e:
                    span.set_status(StatusCode.ERROR, str(e))
                    raise

        @functools.wraps(fn)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            tracer = otel_trace.get_tracer("agentmark")
            with tracer.start_as_current_span(span_name) as span:
                span.set_attribute(SPAN_KIND_KEY, kind.value)
                span.set_attribute("openinference.span.kind", _OPENINFERENCE_KIND_MAP.get(kind.value, "CHAIN"))

                if capture_input:
                    input_str = _capture_inputs(fn, args, kwargs, process_inputs)
                    if input_str is not None:
                        span.set_attribute(INPUT_KEY, input_str)
                        # Deprecated dual-emit -- see LEGACY_INPUT_KEY above.
                        span.set_attribute(LEGACY_INPUT_KEY, input_str)

                try:
                    result = fn(*args, **kwargs)
                    if capture_output:
                        output_str = _capture_output(result, process_outputs)
                        if output_str is not None:
                            span.set_attribute(OUTPUT_KEY, output_str)
                            # Deprecated dual-emit -- see LEGACY_OUTPUT_KEY above.
                            span.set_attribute(LEGACY_OUTPUT_KEY, output_str)
                    span.set_status(StatusCode.OK)
                    return result
                except Exception as e:
                    span.set_status(StatusCode.ERROR, str(e))
                    raise

        @functools.wraps(fn)
        async def async_gen_wrapper(*args: Any, **kwargs: Any) -> Any:
            # Generator functions need their own lifecycle: the plain
            # wrappers would end the span at generator CREATION (before any
            # item is produced) and capture the generator's repr as output.
            # Instead the span stays open until the stream is exhausted, the
            # producer steps run under the span's context (so model spans
            # parent correctly), and the consumer's code between yields does
            # NOT run under it (no context leak across yields).
            tracer = otel_trace.get_tracer("agentmark")
            span = tracer.start_span(span_name)
            span.set_attribute(SPAN_KIND_KEY, kind.value)
            span.set_attribute(
                "openinference.span.kind", _OPENINFERENCE_KIND_MAP.get(kind.value, "CHAIN")
            )
            if capture_input:
                input_str = _capture_inputs(fn, args, kwargs, process_inputs)
                if input_str is not None:
                    span.set_attribute(INPUT_KEY, input_str)
                    # Deprecated dual-emit -- see LEGACY_INPUT_KEY above.
                    span.set_attribute(LEGACY_INPUT_KEY, input_str)

            items: list[Any] = []
            try:
                agen = fn(*args, **kwargs)
                while True:
                    with otel_trace.use_span(span, end_on_exit=False):
                        try:
                            item = await agen.__anext__()
                        except StopAsyncIteration:
                            break
                    items.append(item)
                    yield item
                if capture_output:
                    output_str = _capture_output(
                        _aggregate_stream_items(items), process_outputs
                    )
                    if output_str is not None:
                        span.set_attribute(OUTPUT_KEY, output_str)
                        # Deprecated dual-emit -- see LEGACY_OUTPUT_KEY above.
                        span.set_attribute(LEGACY_OUTPUT_KEY, output_str)
                span.set_status(StatusCode.OK)
            except Exception as e:
                span.set_status(StatusCode.ERROR, str(e))
                raise
            finally:
                # Also covers an abandoned stream (GeneratorExit): the span
                # ends with whatever was produced so far.
                span.end()

        @functools.wraps(fn)
        def sync_gen_wrapper(*args: Any, **kwargs: Any) -> Any:
            # Sync mirror of async_gen_wrapper.
            tracer = otel_trace.get_tracer("agentmark")
            span = tracer.start_span(span_name)
            span.set_attribute(SPAN_KIND_KEY, kind.value)
            span.set_attribute(
                "openinference.span.kind", _OPENINFERENCE_KIND_MAP.get(kind.value, "CHAIN")
            )
            if capture_input:
                input_str = _capture_inputs(fn, args, kwargs, process_inputs)
                if input_str is not None:
                    span.set_attribute(INPUT_KEY, input_str)
                    # Deprecated dual-emit -- see LEGACY_INPUT_KEY above.
                    span.set_attribute(LEGACY_INPUT_KEY, input_str)

            items: list[Any] = []
            try:
                gen = fn(*args, **kwargs)
                while True:
                    with otel_trace.use_span(span, end_on_exit=False):
                        try:
                            item = next(gen)
                        except StopIteration:
                            break
                    items.append(item)
                    yield item
                if capture_output:
                    output_str = _capture_output(
                        _aggregate_stream_items(items), process_outputs
                    )
                    if output_str is not None:
                        span.set_attribute(OUTPUT_KEY, output_str)
                        # Deprecated dual-emit -- see LEGACY_OUTPUT_KEY above.
                        span.set_attribute(LEGACY_OUTPUT_KEY, output_str)
                span.set_status(StatusCode.OK)
            except Exception as e:
                span.set_status(StatusCode.ERROR, str(e))
                raise
            finally:
                span.end()

        if inspect.isasyncgenfunction(fn):
            return async_gen_wrapper  # type: ignore[return-value]
        if inspect.isgeneratorfunction(fn):
            return sync_gen_wrapper  # type: ignore[return-value]
        if inspect.iscoroutinefunction(fn):
            return async_wrapper  # type: ignore[return-value]
        return sync_wrapper  # type: ignore[return-value]

    # Support both @observe and @observe() syntax
    if _fn is not None:
        return decorator(_fn)
    return decorator  # type: ignore[return-value]
