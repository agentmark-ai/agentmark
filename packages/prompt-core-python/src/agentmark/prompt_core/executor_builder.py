"""Generic Executor builder — Python twin of ``prompt-core/src/executor-builder.ts``.

The low-friction bring-your-own-SDK path. Implementing the :class:`Executor`
protocol by hand is async-generator plumbing that must satisfy several
non-obvious invariants ``executor_conformance`` enforces: emit usage exactly
once (inline on ``finish``), an ``error`` event must be terminal (never raise
mid-iteration), object streams end with a final value. ``create_executor``
collapses that to a pair of one-shot handlers — "call my SDK, return the
text/object + usage" — and guarantees the wire protocol BY CONSTRUCTION.

Parity: mirrors the TypeScript ``createExecutor`` (one-shot ``text``/``object``
handlers + streaming ``stream_text``/``stream_object`` async generators).
"""

from __future__ import annotations

import inspect
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from .executor import (
    ErrorEvent,
    ExecCtx,
    ExecutorCapabilities,
    FinishEvent,
    ObjectDeltaEvent,
    ObjectFinalEvent,
    ObjectStreamEvent,
    TextDeltaEvent,
    TextStreamEvent,
    ToolCallEvent,
    ToolResultEvent,
    UsageData,
)
from .executor_helpers import finalize_usage, normalize_error

__all__ = ["create_executor", "ExecutorTextResult", "ExecutorObjectResult"]


@dataclass
class ExecutorTextResult:
    """What a one-shot text handler returns. Only ``text`` (or ``tool_calls``)
    is required. ``usage`` defaults to zeros if omitted so the wire stays valid."""

    text: str | None = None
    # Each: {"id": str, "name": str, "args": Any}
    tool_calls: list[dict[str, Any]] | None = None
    # Each: {"id": str, "name": str, "result": Any, "is_error": bool}
    tool_results: list[dict[str, Any]] | None = None
    usage: UsageData | None = None
    finish_reason: str = "stop"


@dataclass
class ExecutorObjectResult:
    """What a one-shot object handler returns."""

    object: Any
    usage: UsageData | None = None
    finish_reason: str = "stop"


def _usage_or_zero(usage: UsageData | None) -> UsageData:
    # Usage must be emitted exactly once; default to zeros when the SDK doesn't
    # report it so the stream is still protocol-valid.
    if usage is None:
        return UsageData(input_tokens=0, output_tokens=0, total_tokens=0)
    return finalize_usage(
        usage.input_tokens, usage.output_tokens, usage.total_tokens
    ) or UsageData(input_tokens=0, output_tokens=0, total_tokens=0)


async def _maybe_await(value: Any) -> Any:
    """Normalize a sync-or-async handler return into its value."""
    if inspect.isawaitable(value):
        return await value
    return value


TextHandler = Callable[[Any, ExecCtx], "ExecutorTextResult | Awaitable[ExecutorTextResult]"]
ObjectHandler = Callable[[Any, ExecCtx], "ExecutorObjectResult | Awaitable[ExecutorObjectResult]"]
# Streaming handlers yield kind-correct content events; report usage + the
# provider finish reason on a FinishEvent you yield. The builder folds your
# finish into the single terminal FinishEvent. One event vocabulary, matching
# the TS builder. Split by kind so a text handler can't yield object events.
TextStreamHandler = Callable[[Any, ExecCtx], AsyncIterator["TextStreamEvent"]]
ObjectStreamHandler = Callable[[Any, ExecCtx], AsyncIterator["ObjectStreamEvent"]]
OneShotMedia = Callable[[Any, ExecCtx], Awaitable[dict[str, Any]]]


def create_executor(
    *,
    name: str,
    text: TextHandler | None = None,
    object: ObjectHandler | None = None,
    stream_text: TextStreamHandler | None = None,
    stream_object: ObjectStreamHandler | None = None,
    image: OneShotMedia | None = None,
    speech: OneShotMedia | None = None,
    capabilities: ExecutorCapabilities | None = None,
) -> Any:
    """Build a protocol-correct :class:`Executor` from one-shot or streaming
    handlers. Satisfies ``executor_conformance`` by construction. Drop the
    result into ``WebhookRunner``.

    Streaming handlers (``stream_text``/``stream_object``) yield the content
    :class:`AgentEvent` dataclasses (``TextDeltaEvent``, ``ObjectDeltaEvent``,
    ``ToolCallEvent`` …) and report usage + the provider finish reason on a
    ``FinishEvent`` they yield; the builder intercepts that finish and emits the
    single terminal ``FinishEvent`` (carrying the usage) plus error wrapping.
    """
    caps = capabilities or ExecutorCapabilities(
        text=bool(text or stream_text),
        object=bool(object or stream_object),
        image=bool(image),
        speech=bool(speech),
    )

    class _BuiltExecutor:
        @property
        def name(self) -> str:
            return name

        def capabilities(self) -> ExecutorCapabilities:
            return caps

        async def execute_text(
            self, formatted: Any, ctx: ExecCtx
        ) -> AsyncIterator[TextStreamEvent]:
            if text is None and stream_text is None:
                yield ErrorEvent(
                    error=f"Executor '{name}' does not support text prompts."
                )
                return
            try:
                # Prefer streaming when the runner wants deltas (or only a
                # streaming handler exists). Checking the handler directly here
                # narrows it to non-None for the body.
                if stream_text is not None and (
                    ctx.should_stream is not False or text is None
                ):
                    usage: UsageData | None = None
                    finish_reason = "stop"
                    async for ev in stream_text(formatted, ctx):
                        if isinstance(ev, ErrorEvent):
                            # A yielded error is terminal — stop here, no finish.
                            yield ev
                            return
                        if isinstance(ev, FinishEvent):
                            # The builder owns the single terminal finish, but a
                            # streamed FinishEvent may carry usage + the real
                            # provider reason ("length"/"tool_use"/…) — capture
                            # both and suppress the event.
                            if ev.usage is not None:
                                usage = ev.usage
                            if ev.reason:
                                finish_reason = ev.reason
                        else:
                            yield ev
                    yield FinishEvent(
                        reason=finish_reason, usage=_usage_or_zero(usage)
                    )
                    return
                if text is not None:
                    result = await _maybe_await(text(formatted, ctx))
                    for tc in result.tool_calls or []:
                        yield ToolCallEvent(
                            id=tc["id"], name=tc["name"], args=tc.get("args")
                        )
                    for tr in result.tool_results or []:
                        yield ToolResultEvent(
                            id=tr["id"],
                            name=tr["name"],
                            result=tr["result"],
                            is_error=bool(tr.get("is_error")),
                        )
                    if result.text:
                        yield TextDeltaEvent(text=result.text)
                    yield FinishEvent(
                        reason=result.finish_reason,
                        usage=_usage_or_zero(result.usage),
                    )
            except Exception as exc:
                # Any handler failure becomes a single terminal error event —
                # the conformance contract forbids raising mid-iteration.
                yield ErrorEvent(error=normalize_error(exc))

        async def execute_object(
            self, formatted: Any, ctx: ExecCtx
        ) -> AsyncIterator[ObjectStreamEvent]:
            if object is None and stream_object is None:
                yield ErrorEvent(
                    error=f"Executor '{name}' does not support object prompts."
                )
                return
            try:
                if stream_object is not None and (
                    ctx.should_stream is not False or object is None
                ):
                    usage: UsageData | None = None
                    finish_reason = "stop"
                    saw_final = False
                    saw_delta = False
                    last_delta: Any = None
                    async for ev in stream_object(formatted, ctx):
                        if isinstance(ev, ErrorEvent):
                            # A yielded error is terminal — stop here, no finish.
                            yield ev
                            return
                        if isinstance(ev, FinishEvent):
                            if ev.usage is not None:
                                usage = ev.usage
                            if ev.reason:
                                finish_reason = ev.reason
                        else:
                            if isinstance(ev, ObjectFinalEvent):
                                saw_final = True
                            elif isinstance(ev, ObjectDeltaEvent):
                                saw_delta = True
                                last_delta = ev.partial
                            yield ev
                    # The Executor contract requires every object stream to end
                    # with an object-final. If the SDK only streamed deltas, the
                    # last cumulative delta IS the resolved value; fall back to
                    # None only when nothing was streamed at all.
                    if not saw_final:
                        yield ObjectFinalEvent(
                            value=last_delta if saw_delta else None
                        )
                    yield FinishEvent(
                        reason=finish_reason, usage=_usage_or_zero(usage)
                    )
                    return
                if object is not None:
                    result = await _maybe_await(object(formatted, ctx))
                    yield ObjectFinalEvent(value=result.object)
                    yield FinishEvent(
                        reason=result.finish_reason,
                        usage=_usage_or_zero(result.usage),
                    )
            except Exception as exc:
                yield ErrorEvent(error=normalize_error(exc))

        async def execute_image(
            self, formatted: Any, ctx: ExecCtx
        ) -> dict[str, Any]:
            if image is None:
                raise RuntimeError(
                    f"Executor '{name}' does not support image prompts."
                )
            result = await image(formatted, ctx)
            # `traceId` is optional for BYO authors — the runner overwrites it
            # with the real span id, so default it rather than KeyError.
            result.setdefault("traceId", "")
            return result

        async def execute_speech(
            self, formatted: Any, ctx: ExecCtx
        ) -> dict[str, Any]:
            if speech is None:
                raise RuntimeError(
                    f"Executor '{name}' does not support speech prompts."
                )
            result = await speech(formatted, ctx)
            result.setdefault("traceId", "")
            return result

    return _BuiltExecutor()
