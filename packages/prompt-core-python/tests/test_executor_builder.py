"""Proves Python `create_executor` makes a BYO-SDK executor protocol-correct BY
CONSTRUCTION — a raw AWS-Bedrock-style client wrapped in a few lines passes the
full conformance suite. Python twin of
prompt-core/test/executor-builder.test.ts.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import pytest

from agentmark.prompt_core import (
    ErrorEvent,
    ExecCtx,
    ExecutorCapabilities,
    ExecutorObjectResult,
    ExecutorTextResult,
    FinishEvent,
    ObjectDeltaEvent,
    ObjectFinalEvent,
    TextDeltaEvent,
    UsageData,
    assert_object_stream,
    assert_text_stream,
    create_executor,
    run_executor_conformance,
)

CTX = ExecCtx(telemetry={"isEnabled": False})


# ── The user's PRE-EXISTING raw SDK (stand-in for boto3 bedrock-runtime). ──
class FakeBedrockRuntime:
    def __init__(self) -> None:
        self.calls = 0

    async def converse(
        self, *, messages: list[dict[str, Any]], json_mode: bool = False, want_tool: bool = False
    ) -> dict[str, Any]:
        self.calls += 1
        if want_tool:
            return {"tool": {"id": "t1", "name": "lookup_order", "input": {"id": "A-100"}},
                    "usage": {"in": 10, "out": 4}}
        text = '{"answer":"42"}' if json_mode else "Your refund is on its way."
        return {"text": text, "usage": {"in": 12, "out": 8}}


def _build(bedrock: FakeBedrockRuntime) -> Any:
    # The entire BYO executor — no AgentEvent stream, no finish/usage/error
    # bookkeeping. The builder guarantees the protocol.
    async def text(formatted: dict[str, Any], _ctx: ExecCtx) -> ExecutorTextResult:
        if formatted.get("bad"):
            raise ValueError("ValidationException: malformed request")
        res = await bedrock.converse(
            messages=formatted.get("messages", []), want_tool=formatted.get("want_tool", False)
        )
        if "tool" in res:
            t = res["tool"]
            return ExecutorTextResult(
                tool_calls=[{"id": t["id"], "name": t["name"], "args": t["input"]}],
                tool_results=[{"id": t["id"], "name": t["name"], "result": {"ok": True}}],
                usage=UsageData(input_tokens=res["usage"]["in"], output_tokens=res["usage"]["out"]),
            )
        return ExecutorTextResult(
            text=res["text"],
            usage=UsageData(input_tokens=res["usage"]["in"], output_tokens=res["usage"]["out"]),
        )

    async def obj(formatted: dict[str, Any], _ctx: ExecCtx) -> ExecutorObjectResult:
        res = await bedrock.converse(messages=formatted.get("messages", []), json_mode=True)
        return ExecutorObjectResult(
            object=json.loads(res["text"]),
            usage=UsageData(input_tokens=res["usage"]["in"], output_tokens=res["usage"]["out"]),
        )

    return create_executor(name="bedrock-converse", text=text, object=obj)


@pytest.mark.asyncio
async def test_passes_conformance_by_construction() -> None:
    executor = _build(FakeBedrockRuntime())
    await run_executor_conformance(
        executor,
        text={"messages": [{"role": "user", "content": "refund?"}]},
        text_with_tools={"want_tool": True},
        object={"messages": []},
        error_input={"bad": True},
    )


@pytest.mark.asyncio
async def test_capabilities_derived_from_handlers() -> None:
    executor = _build(FakeBedrockRuntime())
    assert executor.capabilities() == ExecutorCapabilities(
        text=True, object=True, image=False, speech=False
    )


@pytest.mark.asyncio
async def test_text_stream_protocol_correct() -> None:
    events = await assert_text_stream(
        _build(FakeBedrockRuntime()).execute_text(
            {"messages": [{"role": "user", "content": "refund?"}]}, CTX
        )
    )
    delta = next(e for e in events if isinstance(e, TextDeltaEvent))
    assert "refund" in delta.text
    finish = next(e for e in events if isinstance(e, FinishEvent))
    assert finish.usage == UsageData(input_tokens=12, output_tokens=8, total_tokens=20)


@pytest.mark.asyncio
async def test_object_stream_protocol_correct() -> None:
    events = await assert_object_stream(
        _build(FakeBedrockRuntime()).execute_object({"messages": []}, CTX)
    )
    final = next(e for e in events if isinstance(e, ObjectFinalEvent))
    assert final.value == {"answer": "42"}


@pytest.mark.asyncio
async def test_thrown_error_becomes_single_terminal_error_event() -> None:
    events = [e async for e in _build(FakeBedrockRuntime()).execute_text({"bad": True}, CTX)]
    assert len(events) == 1
    assert events[0].type == "error"
    assert "ValidationException" in events[0].error


@pytest.mark.asyncio
async def test_unsupported_modality_yields_terminal_error() -> None:
    text_only = create_executor(
        name="text-only",
        text=lambda _f, _c: ExecutorTextResult(text="hi", usage=UsageData(1, 1)),
    )
    assert text_only.capabilities().object is False
    events = [e async for e in text_only.execute_object({}, CTX)]
    assert events[0].type == "error"


# ── Streaming variant (raw Bedrock ConverseStream) ──
@pytest.mark.asyncio
async def test_streaming_executor_passes_conformance() -> None:
    async def stream_text(formatted: dict[str, Any], _ctx: ExecCtx) -> AsyncIterator[Any]:
        if formatted.get("bad"):
            raise RuntimeError("ThrottlingException")
        for chunk in ["Your ", "refund ", "is on its way."]:
            yield TextDeltaEvent(text=chunk)
        yield FinishEvent(reason="stop", usage=UsageData(input_tokens=12, output_tokens=8))

    async def stream_object(_formatted: dict[str, Any], _ctx: ExecCtx) -> AsyncIterator[Any]:
        yield ObjectDeltaEvent(partial={"answer": ""})
        yield ObjectFinalEvent(value={"answer": "42"})
        yield FinishEvent(reason="stop", usage=UsageData(input_tokens=5, output_tokens=3))

    executor = create_executor(
        name="bedrock-converse-stream", stream_text=stream_text, stream_object=stream_object
    )

    await run_executor_conformance(
        executor, text={}, object={}, error_input={"bad": True}
    )

    # token-by-token, not buffered, + one accumulated usage on finish
    events = await assert_text_stream(executor.execute_text({}, CTX))
    assert sum(1 for e in events if isinstance(e, TextDeltaEvent)) == 3
    finish = next(e for e in events if isinstance(e, FinishEvent))
    assert finish.usage == UsageData(input_tokens=12, output_tokens=8, total_tokens=20)


@pytest.mark.asyncio
async def test_streamed_error_event_is_terminal_no_trailing_finish() -> None:
    # A streaming handler whose SDK maps an error chunk to an ErrorEvent (rather
    # than raising) must still produce a terminal error — no FinishEvent after.
    async def stream_text(_formatted: dict[str, Any], _ctx: ExecCtx) -> AsyncIterator[Any]:
        yield TextDeltaEvent(text="partial...")
        yield ErrorEvent(error="ServiceUnavailable")

    executor = create_executor(name="stream-err", stream_text=stream_text)
    events = await assert_text_stream(executor.execute_text({}, CTX))  # must not raise
    assert events[-1].type == "error"
    assert not any(isinstance(e, FinishEvent) for e in events)


@pytest.mark.asyncio
async def test_streamed_finish_reason_is_preserved() -> None:
    # A streamed FinishEvent carrying a provider reason ("length") must not be
    # flattened to the default "stop".
    async def stream_text(_formatted: dict[str, Any], _ctx: ExecCtx) -> AsyncIterator[Any]:
        yield TextDeltaEvent(text="partial...")
        yield FinishEvent(reason="length", usage=UsageData(input_tokens=1, output_tokens=100))

    executor = create_executor(name="finish-reason", stream_text=stream_text)
    events = await assert_text_stream(executor.execute_text({}, CTX))
    finish = next(e for e in events if isinstance(e, FinishEvent))
    assert finish.reason == "length"


@pytest.mark.asyncio
async def test_deltas_only_object_stream_ends_with_last_delta_as_final() -> None:
    # The SDK streams cumulative partials and never emits an explicit final — the
    # Executor contract still requires a terminal object-final, and the last
    # cumulative delta IS the resolved value (not None).
    async def stream_object(_formatted: dict[str, Any], _ctx: ExecCtx) -> AsyncIterator[Any]:
        yield ObjectDeltaEvent(partial={"answer": None})
        yield ObjectDeltaEvent(partial={"answer": "4"})
        yield ObjectDeltaEvent(partial={"answer": "42"})
        yield FinishEvent(reason="stop", usage=UsageData(input_tokens=5, output_tokens=3))

    executor = create_executor(name="object-delta-only", stream_object=stream_object)
    events = await assert_object_stream(executor.execute_object({}, CTX))
    final = next(e for e in events if isinstance(e, ObjectFinalEvent))
    assert final.value == {"answer": "42"}


@pytest.mark.asyncio
async def test_conformance_catches_broken_one_shot_behind_valid_stream() -> None:
    # A dual-handler executor with a valid streaming path but a BROKEN one-shot
    # path (empty text -> empty stream) must now FAIL conformance, because the
    # suite runs both should_stream=True and should_stream=False.
    async def stream_text(formatted: dict[str, Any], _ctx: ExecCtx) -> AsyncIterator[Any]:
        if formatted.get("bad"):
            raise RuntimeError("ValidationException")
        yield TextDeltaEvent(text="ok")
        yield FinishEvent(reason="stop", usage=UsageData(input_tokens=1, output_tokens=1))

    async def stream_object(_formatted: dict[str, Any], _ctx: ExecCtx) -> AsyncIterator[Any]:
        yield ObjectFinalEvent(value={"ok": True})
        yield FinishEvent(reason="stop", usage=UsageData(input_tokens=1, output_tokens=1))

    def broken_text(formatted: dict[str, Any], _ctx: ExecCtx) -> ExecutorTextResult:
        if formatted.get("bad"):
            raise RuntimeError("ValidationException")
        # BROKEN one-shot: empty text + no tool calls -> empty stream.
        return ExecutorTextResult(text="", usage=UsageData(1, 1))

    executor = create_executor(
        name="broken-one-shot",
        stream_text=stream_text,
        stream_object=stream_object,
        text=broken_text,
        object=lambda _f, _c: ExecutorObjectResult(object={"ok": True}, usage=UsageData(1, 1)),
    )
    with pytest.raises(Exception, match="no text-delta or tool-call"):
        await run_executor_conformance(executor, text={}, object={}, error_input={"bad": True})


@pytest.mark.asyncio
async def test_media_handlers_default_trace_id_when_omitted() -> None:
    async def image(_f: dict[str, Any], _c: ExecCtx) -> dict[str, Any]:
        return {"images": [{"base64": "iVBORw0KG..."}], "usage": {"in": 0, "out": 0}}

    async def speech(_f: dict[str, Any], _c: ExecCtx) -> dict[str, Any]:
        return {"audio": {"base64": "UklGR..."}, "usage": {"in": 0, "out": 0}}

    executor = create_executor(name="media", image=image, speech=speech)
    assert executor.capabilities().image is True
    assert executor.capabilities().speech is True
    img = await executor.execute_image({}, CTX)
    assert img["traceId"] == ""
    spc = await executor.execute_speech({}, CTX)
    assert spc["traceId"] == ""
