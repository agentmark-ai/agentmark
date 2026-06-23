"""A streamed run that errors marks the span ERROR.

Regression guard: a streaming run reported an executor error as a wire chunk but
closed the prompt span CLEAN (status OK) — so a failed prod run looked
successful in the trace. The non-streaming path already closes the span with the
exception (``span_cm.__aexit__(*sys.exc_info())``); these pin the streaming
generators (text + object) to the same contract: the error chunk is STILL
emitted AND the span context is exited with the exception. Mirrors the TS
runner's ``webhook-runner.test.ts``.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import pytest

from agentmark.prompt_core import (
    ErrorEvent,
    ExecCtx,
    ExecutorCapabilities,
    FinishEvent,
    ObjectFinalEvent,
    UsageData,
    WebhookRunner,
)


class _ErroringExecutor:
    name = "stub"

    def capabilities(self) -> ExecutorCapabilities:
        return ExecutorCapabilities(text=True, object=True, image=False, speech=False)

    async def execute_text(self, formatted, ctx: ExecCtx):
        raise RuntimeError("boom-mid-stream")
        yield  # unreachable — present only so this is an async generator

    async def execute_object(self, formatted, ctx: ExecCtx):
        yield ErrorEvent(error="router rejected category")


class _CleanExecutor:
    name = "stub"

    def capabilities(self) -> ExecutorCapabilities:
        return ExecutorCapabilities(text=False, object=True, image=False, speech=False)

    async def execute_object(self, formatted, ctx: ExecCtx):
        yield ObjectFinalEvent(value={"category": "billing_disputes"})
        yield FinishEvent(
            reason="stop",
            usage=UsageData(input_tokens=1, output_tokens=1, total_tokens=2),
        )


class _StubPrompt:
    async def format(self, props=None, telemetry=None):
        del props, telemetry
        return {"_formatted": True}

    async def format_with_test_props(self, telemetry=None):
        del telemetry
        return {"_formatted": True}


class _StubClient:
    def __init__(self) -> None:
        self._prompt = _StubPrompt()

    async def load_text_prompt(self, _ast):
        return self._prompt

    async def load_object_prompt(self, _ast):
        return self._prompt

    def get_eval_registry(self):
        return None


class _Span:
    trace_id = "abc123abc123abc123abc123abc123ab"

    def set_attribute(self, key: str, value: str) -> None:
        del key, value


def _error_spy_hook(state: dict):
    """A prompt-span hook that records whether its context was exited with an
    exception — exactly how the real OTEL span CM is told to mark the span
    ERROR, so ``state['errored']`` is a faithful proxy for span status ERROR.
    """

    @asynccontextmanager
    async def hook(_params):
        try:
            yield _Span()
        except BaseException as exc:  # noqa: BLE001 — recording the exit signal
            state["errored"] = True
            state["error"] = exc
            # Swallow: recording is enough for the assertion, and the runner's
            # streaming finally wraps __aexit__ in suppress() anyway.

    return hook


def _ast(config_line: str) -> dict:
    return {"children": [{"type": "yaml", "value": f"name: greet\n{config_line}\n"}]}


async def _drain(stream) -> list[str]:
    return [chunk async for chunk in stream]


@pytest.mark.asyncio
async def test_object_yielded_error_marks_span_error():
    state: dict = {"errored": False, "error": None}
    runner = WebhookRunner(
        _StubClient(), _ErroringExecutor(), prompt_span_hook=_error_spy_hook(state)
    )
    res = await runner.run_prompt(
        _ast("object_config:\n  model_name: test"), {"shouldStream": True}
    )
    chunks = await _drain(res["stream"])
    # Wire contract unchanged — the error still reaches the caller…
    assert any('"type": "error"' in c and "router rejected category" in c for c in chunks)
    # …and the span context was exited with the exception (= span ERROR).
    assert state["errored"] is True
    assert "router rejected category" in str(state["error"])


@pytest.mark.asyncio
async def test_text_thrown_executor_marks_span_error():
    state: dict = {"errored": False, "error": None}
    runner = WebhookRunner(
        _StubClient(), _ErroringExecutor(), prompt_span_hook=_error_spy_hook(state)
    )
    res = await runner.run_prompt(
        _ast("text_config:\n  model_name: test"), {"shouldStream": True}
    )
    chunks = await _drain(res["stream"])
    assert any('"type": "error"' in c and "boom-mid-stream" in c for c in chunks)
    assert state["errored"] is True
    assert "boom-mid-stream" in str(state["error"])


@pytest.mark.asyncio
async def test_clean_stream_does_not_mark_span_error():
    state: dict = {"errored": False, "error": None}
    runner = WebhookRunner(
        _StubClient(), _CleanExecutor(), prompt_span_hook=_error_spy_hook(state)
    )
    res = await runner.run_prompt(
        _ast("object_config:\n  model_name: test"), {"shouldStream": True}
    )
    await _drain(res["stream"])
    assert state["errored"] is False
