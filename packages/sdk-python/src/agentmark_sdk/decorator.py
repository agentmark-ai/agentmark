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

# Attribute keys matching the gen_ai semantic conventions used by the adapter
INPUT_KEY = "gen_ai.request.input"
OUTPUT_KEY = "gen_ai.response.output"
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

    Supports both @observe and @observe() syntax, sync and async functions.

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

                try:
                    result = await fn(*args, **kwargs)
                    if capture_output:
                        output_str = _capture_output(result, process_outputs)
                        if output_str is not None:
                            span.set_attribute(OUTPUT_KEY, output_str)
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

                try:
                    result = fn(*args, **kwargs)
                    if capture_output:
                        output_str = _capture_output(result, process_outputs)
                        if output_str is not None:
                            span.set_attribute(OUTPUT_KEY, output_str)
                    span.set_status(StatusCode.OK)
                    return result
                except Exception as e:
                    span.set_status(StatusCode.ERROR, str(e))
                    raise

        if inspect.iscoroutinefunction(fn):
            return async_wrapper  # type: ignore[return-value]
        return sync_wrapper  # type: ignore[return-value]

    # Support both @observe and @observe() syntax
    if _fn is not None:
        return decorator(_fn)
    return decorator  # type: ignore[return-value]
