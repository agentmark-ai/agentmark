"""run-prompt records template variables as ``agentmark.props`` — parity with
the experiment item span. The flat rendered messages (``agentmark.input``) are a
derived form; ``agentmark.props`` is the re-runnable dataset input, so a
``run-prompt --props`` trace surfaces a Variables panel and captures the
variables (not the rendered messages) on "Add to dataset", same as experiment
runs. Mirrors the TS runner's ``webhook-runner-props.test.ts``.
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager

import pytest

from agentmark.prompt_core import (
    ExecCtx,
    ExecutorCapabilities,
    FinishEvent,
    ObjectFinalEvent,
    TextDeltaEvent,
    UsageData,
    WebhookRunner,
)
from agentmark.prompt_core.webhook_runner import PromptSpanParams

CUSTOM_PROPS = {"ticket": "I was charged twice for my Pro plan."}


def _ast(config_line: str) -> dict:
    return {"children": [{"type": "yaml", "value": f"name: greet\n{config_line}\n"}]}


class _FullExecutor:
    name = "stub"

    def capabilities(self) -> ExecutorCapabilities:
        return ExecutorCapabilities(text=True, object=True, image=True, speech=True)

    async def execute_text(self, formatted, ctx: ExecCtx):
        yield TextDeltaEvent(text="hello")
        yield FinishEvent(
            reason="stop",
            usage=UsageData(input_tokens=1, output_tokens=1, total_tokens=2),
        )

    async def execute_object(self, formatted, ctx: ExecCtx):
        yield ObjectFinalEvent(value={"ok": True})
        yield FinishEvent(
            reason="stop",
            usage=UsageData(input_tokens=1, output_tokens=1, total_tokens=2),
        )

    async def execute_image(self, formatted, ctx: ExecCtx):
        return {"type": "image", "result": [{"mimeType": "image/png", "base64": "x"}]}

    async def execute_speech(self, formatted, ctx: ExecCtx):
        return {
            "type": "speech",
            "result": {"mimeType": "audio/mpeg", "base64": "x", "format": "mp3"},
        }


class _StubPrompt:
    async def format(self, props=None, telemetry=None):
        del props, telemetry
        return {"_fake": True}

    async def format_with_test_props(self, telemetry=None):
        del telemetry
        return {"_fake": True}


class _StubClient:
    def __init__(self) -> None:
        self._prompt = _StubPrompt()

    async def load_text_prompt(self, _ast):
        return self._prompt

    async def load_object_prompt(self, _ast):
        return self._prompt

    async def load_image_prompt(self, _ast):
        return self._prompt

    async def load_speech_prompt(self, _ast):
        return self._prompt

    def get_eval_registry(self):
        return None


class _CapturingSpan:
    trace_id = "abc123abc123abc123abc123abc123ab"

    def __init__(self, sink: list[tuple[str, object]]) -> None:
        self._sink = sink

    def set_attribute(self, key: str, value) -> None:
        self._sink.append((key, value))


def _spy_hook(sink: list[tuple[str, object]]):
    @asynccontextmanager
    async def hook(_params: PromptSpanParams):
        yield _CapturingSpan(sink)

    return hook


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("config_line", "options"),
    [
        ("text_config:\n  model_name: test", {"shouldStream": False}),
        ("text_config:\n  model_name: test", {"shouldStream": True}),
        ("object_config:\n  model_name: test", {"shouldStream": False}),
        ("object_config:\n  model_name: test", {"shouldStream": True}),
    ],
)
async def test_run_prompt_records_props(config_line, options):
    sink: list[tuple[str, object]] = []
    runner = WebhookRunner(_StubClient(), _FullExecutor(), prompt_span_hook=_spy_hook(sink))
    await runner.run_prompt(_ast(config_line), {**options, "customProps": CUSTOM_PROPS})
    assert ("agentmark.props", json.dumps(CUSTOM_PROPS, default=str)) in sink


@pytest.mark.asyncio
async def test_run_prompt_skips_props_when_absent():
    sink: list[tuple[str, object]] = []
    runner = WebhookRunner(_StubClient(), _FullExecutor(), prompt_span_hook=_spy_hook(sink))
    await runner.run_prompt(_ast("text_config:\n  model_name: test"), {"shouldStream": False})
    assert not any(key == "agentmark.props" for key, _ in sink)
