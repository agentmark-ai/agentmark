"""Executor conformance tests for PydanticAIExecutor.

Runs the shared conformance suite from ``agentmark.prompt_core`` so the
executor is held to the same AgentEvent contract as every other adapter
(mirrors claude-agent-sdk-v0-adapter-python/tests/test_executor.py).

Models are stubbed with pydantic-ai's offline ``TestModel`` /
``FunctionModel`` — real Agent graph, no network.
"""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import BaseModel
from pydantic_ai import Tool
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.models.test import TestModel

from agentmark.prompt_core import (
    AgentEvent,
    ExecCtx,
    Executor,
    FinishEvent,
    TextDeltaEvent,
    ToolCallEvent,
    ToolResultEvent,
    assert_abort_stream,
    assert_text_stream,
    assert_usage_shape,
    run_executor_conformance,
)

from agentmark_pydantic_ai_v0.executor import PydanticAIExecutor
from agentmark_pydantic_ai_v0.types import (
    PydanticAIObjectParams,
    PydanticAITextParams,
)


class _Answer(BaseModel):
    answer: str


def _add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b


def _raising_model(*_args: Any, **_kwargs: Any) -> Any:
    raise RuntimeError("model exploded")


def _text_params(**overrides: Any) -> PydanticAITextParams:
    defaults: dict[str, Any] = {
        "model": TestModel(),
        "system_prompt": None,
        "user_prompt": "Say hello",
    }
    defaults.update(overrides)
    return PydanticAITextParams(**defaults)


def _object_params() -> PydanticAIObjectParams[_Answer]:
    return PydanticAIObjectParams(
        model=TestModel(),
        system_prompt=None,
        user_prompt="Answer the question",
        output_type=_Answer,
    )


def test_executor_matches_protocol():
    assert isinstance(PydanticAIExecutor(), Executor)


@pytest.mark.asyncio
async def test_full_conformance_suite():
    """One-call conformance: text, text+tools, object, and error path —
    run under BOTH should_stream=True and should_stream=False contexts."""
    await run_executor_conformance(
        PydanticAIExecutor(),
        text=_text_params(),
        text_with_tools=_text_params(
            model=TestModel(call_tools=["add"]),
            tools=[Tool(function=_add, name="add", description="Add two numbers")],
        ),
        object=_object_params(),
        error_input=_text_params(model=FunctionModel(_raising_model)),
    )


@pytest.mark.asyncio
async def test_streaming_text_emits_tool_call_before_result_and_single_usage():
    """Pin the tool-event ordering and single-usage-channel invariants on the
    streaming path specifically (the suite above also covers one-shot)."""
    params = _text_params(
        model=TestModel(call_tools=["add"]),
        tools=[Tool(function=_add, name="add", description="Add two numbers")],
    )
    events: list[AgentEvent] = []
    async for ev in PydanticAIExecutor().execute_text(
        params, ExecCtx(telemetry={"isEnabled": False}, should_stream=True)
    ):
        events.append(ev)

    async def _gen():
        for ev in events:
            yield ev

    await assert_text_stream(_gen())

    tool_calls = [e for e in events if isinstance(e, ToolCallEvent)]
    tool_results = [e for e in events if isinstance(e, ToolResultEvent)]
    assert len(tool_calls) == 1
    assert tool_calls[0].name == "add"
    assert len(tool_results) == 1
    assert tool_results[0].id == tool_calls[0].id
    assert events.index(tool_calls[0]) < events.index(tool_results[0])

    finishes = [e for e in events if isinstance(e, FinishEvent)]
    assert len(finishes) == 1
    assert finishes[0].usage is not None
    assert_usage_shape(finishes[0].usage)


@pytest.mark.asyncio
async def test_abort_mid_stream_unwinds_cleanly():
    """Closing the stream mid-flight (the runner's cancellation path when a
    client disconnects) must unwind the executor's `async with agent.iter()`
    stack cleanly — no swallowed GeneratorExit, no events after the close."""
    params = _text_params(
        model=TestModel(custom_output_text="one two three four five six")
    )
    stream = PydanticAIExecutor().execute_text(
        params, ExecCtx(telemetry={"isEnabled": False}, should_stream=True)
    )
    observed = await assert_abort_stream(stream, abort_after_events=1)

    # Exactly the pre-close events; the stream yielded the first delta
    # before the boundary and nothing after it.
    assert len(observed) == 1
    assert isinstance(observed[0], TextDeltaEvent)
    # No FinishEvent may have been emitted — the run was cancelled before
    # completion, and finish-after-close would double-count usage upstream.
    assert not any(isinstance(e, FinishEvent) for e in observed)
