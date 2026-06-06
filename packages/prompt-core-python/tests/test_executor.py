"""Conformance tests for the Executor protocol primitives in prompt-core-python.

Mirrors `executor.types.test.ts` + `executor-conformance.ts` coverage.
"""

from __future__ import annotations

import pytest

from agentmark.prompt_core import (
    AgentEvent,
    ConformanceError,
    ExecCtx,
    Executor,
    ExecutorCapabilities,
    FinishEvent,
    ObjectFinalEvent,
    TextDeltaEvent,
    ToolCallEvent,
    ToolResultEvent,
    UsageData,
    assert_abort_stream,
    assert_error_stream,
    assert_object_stream,
    assert_text_stream,
    assert_usage_shape,
)
from agentmark.prompt_core.executor import ErrorEvent


# ---------- Helpers ----------


async def _aiter(events: list[AgentEvent]):
    for ev in events:
        yield ev


# ---------- Minimal + full executor shapes ----------


class _MinimalExecutor:
    name = "minimal"

    def capabilities(self) -> ExecutorCapabilities:
        return ExecutorCapabilities(text=True, object=True)

    async def execute_text(self, formatted, ctx):
        yield TextDeltaEvent(text="hello")
        yield FinishEvent(
            reason="stop", usage=UsageData(input_tokens=1, output_tokens=1)
        )

    async def execute_object(self, formatted, ctx):
        yield ObjectFinalEvent(value={"ok": True})
        yield FinishEvent(
            reason="stop", usage=UsageData(input_tokens=1, output_tokens=1)
        )


def test_minimal_executor_matches_protocol():
    executor = _MinimalExecutor()
    assert isinstance(executor, Executor)


# ---------- Positive conformance ----------


@pytest.mark.asyncio
async def test_text_stream_with_usage_inline_on_finish():
    events = _aiter([
        TextDeltaEvent(text="hi"),
        FinishEvent(reason="stop", usage=UsageData(input_tokens=1, output_tokens=2)),
    ])
    observed = await assert_text_stream(events)
    assert len(observed) == 2


@pytest.mark.asyncio
async def test_text_stream_usage_on_finish():
    # Single usage channel: usage rides on the terminal FinishEvent.
    events = _aiter([
        TextDeltaEvent(text="hi"),
        FinishEvent(reason="stop", usage=UsageData(input_tokens=1, output_tokens=2)),
    ])
    observed = await assert_text_stream(events)
    assert len(observed) == 2


@pytest.mark.asyncio
async def test_text_stream_rejects_missing_finish_usage():
    # `finish.usage` is the single usage channel — a stream that never reports
    # usage on a finish fails conformance.
    events = _aiter([
        TextDeltaEvent(text="hi"),
        FinishEvent(reason="stop"),  # no usage
    ])
    with pytest.raises(Exception, match="exactly one finish carrying usage"):
        await assert_text_stream(events)


@pytest.mark.asyncio
async def test_text_stream_with_tool_call_and_result_pair():
    events = _aiter([
        ToolCallEvent(id="1", name="search", args={"q": "x"}),
        ToolResultEvent(id="1", name="search", result="hits"),
        FinishEvent(reason="stop", usage=UsageData(input_tokens=1, output_tokens=2)),
    ])
    observed = await assert_text_stream(events)
    assert len(observed) == 3


@pytest.mark.asyncio
async def test_object_stream_with_final_and_usage():
    # Single usage channel: usage rides on the terminal FinishEvent.
    events = _aiter([
        ObjectFinalEvent(value={"ok": True}),
        FinishEvent(reason="stop", usage=UsageData(input_tokens=1, output_tokens=2)),
    ])
    observed = await assert_object_stream(events)
    assert len(observed) == 2


@pytest.mark.asyncio
async def test_error_stream_terminal():
    events = _aiter([
        TextDeltaEvent(text="partial"),
        ErrorEvent(error="oops"),
    ])
    observed = await assert_error_stream(events)
    assert isinstance(observed[-1], ErrorEvent)


# ---------- Negative conformance (contract violations) ----------


@pytest.mark.asyncio
async def test_text_stream_rejects_object_events():
    events = _aiter([
        TextDeltaEvent(text="hi"),
        ObjectFinalEvent(value={"nope": True}),
        FinishEvent(reason="stop", usage=UsageData(input_tokens=1, output_tokens=1)),
    ])
    with pytest.raises(ConformanceError) as info:
        await assert_text_stream(events)
    assert "object-final is not allowed" in info.value.violation.reason


@pytest.mark.asyncio
async def test_text_stream_requires_usage_exactly_once():
    events = _aiter([TextDeltaEvent(text="hi")])
    with pytest.raises(ConformanceError):
        await assert_text_stream(events)


@pytest.mark.asyncio
async def test_tool_result_without_preceding_tool_call_is_rejected():
    events = _aiter([
        ToolResultEvent(id="99", name="ghost", result=None),
        FinishEvent(reason="stop", usage=UsageData(input_tokens=1, output_tokens=1)),
    ])
    with pytest.raises(ConformanceError):
        await assert_text_stream(events)


@pytest.mark.asyncio
async def test_object_stream_rejects_text_deltas():
    events = _aiter([
        TextDeltaEvent(text="nope"),
        ObjectFinalEvent(value={}),
        FinishEvent(reason="stop", usage=UsageData(input_tokens=1, output_tokens=1)),
    ])
    with pytest.raises(ConformanceError):
        await assert_object_stream(events)


@pytest.mark.asyncio
async def test_error_in_middle_is_rejected():
    events = _aiter([
        TextDeltaEvent(text="partial"),
        ErrorEvent(error="oops"),
        TextDeltaEvent(text="more after error — violation"),
    ])
    with pytest.raises(ConformanceError):
        await assert_text_stream(events)


# ---------- Usage shape ----------


def test_usage_shape_accepts_non_negative_ints():
    assert_usage_shape(UsageData(input_tokens=0, output_tokens=0))
    assert_usage_shape(UsageData(input_tokens=3, output_tokens=7, total_tokens=10))


def test_usage_shape_rejects_negative_values():
    with pytest.raises(ConformanceError):
        assert_usage_shape(UsageData(input_tokens=-1, output_tokens=0))
    with pytest.raises(ConformanceError):
        assert_usage_shape(UsageData(input_tokens=0, output_tokens=0, total_tokens=-5))


# ---------- Pydantic support — ObjectFinalEvent accepts model instances ----------


def test_object_final_accepts_pydantic_instance():
    from pydantic import BaseModel

    class Result(BaseModel):
        answer: int

    ev = ObjectFinalEvent(value=Result(answer=42))
    assert hasattr(ev.value, "model_dump")
    assert ev.value.model_dump() == {"answer": 42}


# ---------- assert_abort_stream (self-tests for the assertion itself) ----------


@pytest.mark.asyncio
async def test_abort_stream_consumes_then_closes_cleanly():
    """Happy path: events collected up to the boundary, then the close
    propagates — the executor's finally runs and nothing is observed past
    the boundary."""
    cleaned = False

    async def well_behaved():
        nonlocal cleaned
        try:
            while True:
                yield TextDeltaEvent(text="tick")
        finally:
            cleaned = True

    observed = await assert_abort_stream(well_behaved(), abort_after_events=2)
    assert [type(e) for e in observed] == [TextDeltaEvent, TextDeltaEvent]
    assert cleaned is True


@pytest.mark.asyncio
async def test_abort_stream_flags_swallowed_generator_exit():
    """An executor that swallows GeneratorExit and keeps yielding is a
    cancellation bug — the assertion must surface it as ConformanceError."""

    async def stubborn():
        while True:
            try:
                yield TextDeltaEvent(text="tick")
            except GeneratorExit:  # noqa: PERF203 — the bug under test
                continue

    with pytest.raises(ConformanceError) as info:
        await assert_abort_stream(stubborn(), abort_after_events=1)
    assert "did not terminate cleanly" in str(info.value)


@pytest.mark.asyncio
async def test_abort_stream_flags_pre_abort_raise():
    """A raise BEFORE the abort point is an executor failure (errors must be
    terminal events, never exceptions) — distinct scenario from the close."""

    async def exploding():
        yield TextDeltaEvent(text="one")
        raise RuntimeError("boom")

    with pytest.raises(ConformanceError) as info:
        await assert_abort_stream(exploding(), abort_after_events=5)
    assert "raised before the abort point" in str(info.value)
