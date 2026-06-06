"""Unit tests for ClaudeAgentExecutor.

Verifies the SDK message → AgentEvent translation in isolation from the
real Claude Agent SDK by stubbing `traced_query`. Runs the shared
conformance assertions from `agentmark.prompt_core` so the executor is
held to the same contract as the TS adapters.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest

from agentmark.prompt_core import (
    AgentEvent,
    ErrorEvent,
    ExecCtx,
    Executor,
    FinishEvent,
    ObjectDeltaEvent,
    ObjectFinalEvent,
    TextDeltaEvent,
    assert_error_stream,
    assert_object_stream,
    assert_text_stream,
)

from agentmark_claude_agent_sdk_v0.executor import ClaudeAgentExecutor


# ---------- SDK message stubs (match Claude Agent SDK shape by class name) ----------


class AssistantMessage:
    def __init__(self, content: list[dict[str, Any]]) -> None:
        self.content = content


class ResultMessage:
    def __init__(
        self,
        subtype: str = "success",
        result: str = "",
        structured_output: Any = None,
        usage: dict[str, int] | None = None,
        errors: list[str] | None = None,
    ) -> None:
        self.subtype = subtype
        self.result = result
        self.structured_output = structured_output
        self.usage = usage or {}
        self.errors = errors


def _patch_traced_query(messages: list[Any]):
    """Patch traced_query to yield the given messages."""

    async def fake_traced_query(_adapted: Any, default_mcp_servers: Any = None):
        for m in messages:
            yield m

    return patch(
        "agentmark_claude_agent_sdk_v0.traced.traced_query", fake_traced_query
    )


# ---------- Protocol + basic wiring ----------


def test_executor_matches_protocol():
    assert isinstance(ClaudeAgentExecutor(), Executor)


def test_capabilities_declare_image_and_speech_unsupported():
    caps = ClaudeAgentExecutor().capabilities()
    assert caps.text is True
    assert caps.object is True
    assert caps.image is False
    assert caps.speech is False


# ---------- Positive: text + object flows ----------


@pytest.mark.asyncio
async def test_text_flow_emits_deltas_and_finish_with_usage():
    messages = [
        AssistantMessage(content=[{"type": "text", "text": "hello"}]),
        AssistantMessage(content=[{"type": "text", "text": " world"}]),
        ResultMessage(
            subtype="success",
            result="hello world",
            usage={"input_tokens": 5, "output_tokens": 7},
        ),
    ]
    with _patch_traced_query(messages):
        events: list[AgentEvent] = []
        async for ev in ClaudeAgentExecutor().execute_text({}, ExecCtx()):
            events.append(ev)

    # Conformance: valid text stream.
    async def _gen():
        for ev in events:
            yield ev

    await assert_text_stream(_gen())

    # Specific content: at least the two streaming deltas + a final delta
    # replaying the full result, plus a combined finish+usage event.
    text_deltas = [e for e in events if isinstance(e, TextDeltaEvent)]
    assert len(text_deltas) >= 2
    finishes = [e for e in events if isinstance(e, FinishEvent)]
    assert len(finishes) == 1
    assert finishes[0].usage is not None
    assert finishes[0].usage.input_tokens == 5
    assert finishes[0].usage.output_tokens == 7
    assert finishes[0].usage.total_tokens == 12


@pytest.mark.asyncio
async def test_object_flow_emits_object_delta_then_final_and_finish():
    structured = {"answer": 42}
    messages = [
        # Claude streams JSON fragments as text during structured-output runs.
        AssistantMessage(content=[{"type": "text", "text": '{"answer":'}]),
        AssistantMessage(content=[{"type": "text", "text": " 42}"}]),
        ResultMessage(
            subtype="success",
            result='{"answer": 42}',
            structured_output=structured,
            usage={"input_tokens": 3, "output_tokens": 4},
        ),
    ]
    with _patch_traced_query(messages):
        events: list[AgentEvent] = []
        async for ev in ClaudeAgentExecutor().execute_object({}, ExecCtx()):
            events.append(ev)

    async def _gen():
        for ev in events:
            yield ev

    await assert_object_stream(_gen())

    deltas = [e for e in events if isinstance(e, ObjectDeltaEvent)]
    finals = [e for e in events if isinstance(e, ObjectFinalEvent)]
    assert deltas, "expected streamed object-delta events for JSON fragments"
    assert len(finals) == 1
    assert finals[0].value == structured


# ---------- Negative: error handling ----------


@pytest.mark.asyncio
async def test_error_result_becomes_terminal_error_event():
    messages = [
        AssistantMessage(content=[{"type": "text", "text": "partial"}]),
        ResultMessage(
            subtype="error_during_execution",
            errors=["tool exploded", "downstream 500"],
        ),
    ]
    with _patch_traced_query(messages):
        events: list[AgentEvent] = []
        async for ev in ClaudeAgentExecutor().execute_text({}, ExecCtx()):
            events.append(ev)

    async def _gen():
        for ev in events:
            yield ev

    await assert_error_stream(_gen())
    assert isinstance(events[-1], ErrorEvent)
    assert "tool exploded" in events[-1].error


@pytest.mark.asyncio
async def test_raised_exception_becomes_terminal_error_event():
    async def raising_query(_adapted: Any, default_mcp_servers: Any = None):
        if False:
            yield
        raise RuntimeError("SDK boom")

    with patch(
        "agentmark_claude_agent_sdk_v0.traced.traced_query", raising_query
    ):
        events: list[AgentEvent] = []
        async for ev in ClaudeAgentExecutor().execute_text({}, ExecCtx()):
            events.append(ev)

    assert events and isinstance(events[-1], ErrorEvent)
    assert "SDK boom" in events[-1].error


# ---------- Abort: closing the stream mid-flight ----------


@pytest.mark.asyncio
async def test_abort_mid_stream_closes_sdk_generator():
    """Closing the executor's stream (the runner's cancellation path) must
    propagate GeneratorExit into the SDK query generator — its cleanup runs,
    and no events are emitted past the close boundary."""
    from agentmark.prompt_core import assert_abort_stream

    sdk_cleaned_up = False

    async def endless_query(_adapted, default_mcp_servers=None):
        nonlocal sdk_cleaned_up
        try:
            while True:
                yield AssistantMessage(content=[{"type": "text", "text": "tick"}])
        finally:
            # A real SDK releases its subprocess/connection here.
            sdk_cleaned_up = True

    with patch(
        "agentmark_claude_agent_sdk_v0.traced.traced_query", endless_query
    ):
        stream = ClaudeAgentExecutor().execute_text({}, ExecCtx())
        observed = await assert_abort_stream(stream, abort_after_events=2)

    # Exactly the pre-close events — all deltas, no finish (the run was
    # cancelled; finish-after-close would double-count usage upstream).
    assert len(observed) == 2
    assert all(isinstance(e, TextDeltaEvent) for e in observed)
    assert not any(isinstance(e, FinishEvent) for e in observed)
    # GeneratorExit reached the SDK layer: its finally block ran.
    assert sdk_cleaned_up is True
