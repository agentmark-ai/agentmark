"""Public conformance suite for Executor implementations.

SDK-agnostic assertions on `AsyncIterator[AgentEvent]` streams. Ship this
so BYO-SDK users can plug their executor output into these assertions
inside whichever test runner (pytest/unittest/trio-test) they use.

Mirrors `@agentmark-ai/prompt-core/executor-conformance` in TypeScript.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from .executor import (
    AgentEvent,
    ErrorEvent,
    ExecCtx,
    Executor,
    FinishEvent,
    ObjectDeltaEvent,
    ObjectFinalEvent,
    ReasoningDeltaEvent,
    TextDeltaEvent,
    ToolCallEvent,
    ToolResultEvent,
    UsageData,
)


@dataclass
class ConformanceViolation:
    scenario: str
    reason: str
    observed: list[AgentEvent]


class ConformanceError(AssertionError):
    def __init__(self, violation: ConformanceViolation) -> None:
        self.violation = violation
        super().__init__(
            f"Executor conformance violation [{violation.scenario}]: "
            f"{violation.reason}\nObserved: {violation.observed!r}"
        )


async def _collect(events: AsyncIterator[AgentEvent]) -> list[AgentEvent]:
    out: list[AgentEvent] = []
    async for ev in events:
        out.append(ev)
    return out


async def assert_text_stream(
    events: AsyncIterator[AgentEvent], allow_empty: bool = False
) -> list[AgentEvent]:
    """Verify a text-kind event stream. Contract:
      - Emits at least one text-delta OR tool-call (non-empty).
      - Emits usage exactly once (standalone OR inline on finish).
      - tool-result events must be preceded by tool-call with same id.
      - No object-delta / object-final events.
      - If an error event appears, it is terminal.
    """
    observed = await _collect(events)
    usage_count = 0
    non_empty = False
    tool_call_ids: set[str] = set()
    error_idx = -1

    for i, ev in enumerate(observed):
        if isinstance(ev, (TextDeltaEvent, ToolCallEvent)):
            non_empty = True
        if isinstance(ev, ToolCallEvent):
            tool_call_ids.add(ev.id)
        if isinstance(ev, ToolResultEvent) and ev.id not in tool_call_ids:
            raise ConformanceError(
                ConformanceViolation(
                    "text-stream",
                    f"tool-result id={ev.id} has no preceding tool-call",
                    observed,
                )
            )
        if isinstance(ev, (ObjectDeltaEvent, ObjectFinalEvent)):
            raise ConformanceError(
                ConformanceViolation(
                    "text-stream",
                    f"{ev.type} is not allowed in a text stream",
                    observed,
                )
            )
        if isinstance(ev, FinishEvent) and ev.usage is not None:
            usage_count += 1
        if isinstance(ev, ErrorEvent):
            error_idx = i

    if error_idx >= 0:
        if error_idx != len(observed) - 1:
            raise ConformanceError(
                ConformanceViolation(
                    "text-stream",
                    "error event must be the terminal event",
                    observed,
                )
            )
        return observed

    if not non_empty and not allow_empty:
        raise ConformanceError(
            ConformanceViolation(
                "text-stream", "no text-delta or tool-call produced", observed
            )
        )
    if usage_count != 1:
        raise ConformanceError(
            ConformanceViolation(
                "text-stream",
                f"expected exactly one finish carrying usage, got {usage_count}",
                observed,
            )
        )
    return observed


async def assert_object_stream(
    events: AsyncIterator[AgentEvent],
) -> list[AgentEvent]:
    """Verify an object-kind event stream. Contract:
      - Emits at least one object-delta OR object-final.
      - Emits usage exactly once (standalone OR inline on finish).
      - No text-delta / reasoning-delta / tool-* events.
      - If an error event appears, it is terminal.
    """
    observed = await _collect(events)
    usage_count = 0
    non_empty = False
    error_idx = -1

    for i, ev in enumerate(observed):
        if isinstance(ev, (ObjectDeltaEvent, ObjectFinalEvent)):
            non_empty = True
        if isinstance(ev, FinishEvent) and ev.usage is not None:
            usage_count += 1
        if isinstance(ev, ErrorEvent):
            error_idx = i
        if isinstance(
            ev,
            (TextDeltaEvent, ReasoningDeltaEvent, ToolCallEvent, ToolResultEvent),
        ):
            raise ConformanceError(
                ConformanceViolation(
                    "object-stream",
                    f"{ev.type} is not allowed in an object stream",
                    observed,
                )
            )

    if error_idx >= 0:
        if error_idx != len(observed) - 1:
            raise ConformanceError(
                ConformanceViolation(
                    "object-stream",
                    "error event must be the terminal event",
                    observed,
                )
            )
        return observed
    if not non_empty:
        raise ConformanceError(
            ConformanceViolation(
                "object-stream",
                "no object-delta or object-final produced",
                observed,
            )
        )
    if usage_count != 1:
        raise ConformanceError(
            ConformanceViolation(
                "object-stream",
                f"expected exactly one finish carrying usage, got {usage_count}",
                observed,
            )
        )
    return observed


async def assert_error_stream(
    events: AsyncIterator[AgentEvent],
) -> list[AgentEvent]:
    """Verify the executor emits a terminal error event (rather than throwing)."""
    try:
        observed = await _collect(events)
    except Exception as err:
        raise ConformanceError(
            ConformanceViolation(
                "error-path",
                f"executor raised during iteration instead of emitting an "
                f"error event: {err}",
                [],
            )
        ) from err
    if not observed or not isinstance(observed[-1], ErrorEvent):
        raise ConformanceError(
            ConformanceViolation(
                "error-path", "expected terminal error event", observed
            )
        )
    return observed


def assert_usage_shape(usage: UsageData) -> None:
    """Verify a UsageData payload has sensible non-negative values."""
    if not isinstance(usage.input_tokens, int) or usage.input_tokens < 0:
        raise ConformanceError(
            ConformanceViolation(
                "usage-shape",
                f"input_tokens must be a non-negative int, got {usage.input_tokens!r}",
                [],
            )
        )
    if not isinstance(usage.output_tokens, int) or usage.output_tokens < 0:
        raise ConformanceError(
            ConformanceViolation(
                "usage-shape",
                f"output_tokens must be a non-negative int, got {usage.output_tokens!r}",
                [],
            )
        )
    if usage.total_tokens is not None and (
        not isinstance(usage.total_tokens, int) or usage.total_tokens < 0
    ):
        raise ConformanceError(
            ConformanceViolation(
                "usage-shape",
                f"total_tokens must be a non-negative int or None, got "
                f"{usage.total_tokens!r}",
                [],
            )
        )


async def run_executor_conformance(
    executor: Executor,
    *,
    text: Any,
    object: Any,
    error_input: Any,
    text_with_tools: Any = None,
    object_with_tools: Any = None,
    ctx: ExecCtx | None = None,
) -> None:
    """One-call conformance for an :class:`Executor`: runs the full suite from
    ``formatted`` fixtures (SDK-specific, so caller-supplied). ``error_input``
    should be a payload the executor's handler rejects, so the error path is
    exercised. Python twin of TS ``runExecutorConformance``.

    Unless the caller pins ``ctx``, the suite runs TWICE — once with
    ``should_stream=True`` and once with ``should_stream=False`` — so an executor
    that implements both a streaming and a one-shot handler exercises BOTH
    branches. This closes the footgun where a broken one-shot path passes
    because the default context silently selected the streaming branch.
    """

    async def _run(run_ctx: ExecCtx) -> None:
        await assert_text_stream(executor.execute_text(text, run_ctx))
        if text_with_tools is not None:
            await assert_text_stream(executor.execute_text(text_with_tools, run_ctx))
        await assert_object_stream(executor.execute_object(object, run_ctx))
        if object_with_tools is not None:
            await assert_object_stream(
                executor.execute_object(object_with_tools, run_ctx)
            )
        await assert_error_stream(executor.execute_text(error_input, run_ctx))

    if ctx is not None:
        await _run(ctx)
        return
    await _run(ExecCtx(telemetry={"isEnabled": False}, should_stream=True))
    await _run(ExecCtx(telemetry={"isEnabled": False}, should_stream=False))
