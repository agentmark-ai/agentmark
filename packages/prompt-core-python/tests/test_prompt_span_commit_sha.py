"""Prompt-version trace linking — WebhookRunner → prompt span hook params.

The gateway / CLI dev server stamp ``agentmark_meta.commit_sha`` (the commit
the prompt content was served at) into the AST frontmatter. These tests pin
that ALL prompt-run paths (text/object/image/speech) forward both
``prompt_name`` and ``commit_sha`` to the prompt span hook via
``PromptSpanParams`` — mirroring the TS runner's
``webhook-runner-commit-sha.test.ts``.
"""

from __future__ import annotations

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

META_YAML = 'agentmark_meta:\n  commit_sha: "abc123def456"\n'


def _ast(config_line: str, with_meta: bool = True) -> dict:
    value = f"name: greet\n{config_line}\n"
    if with_meta:
        value += META_YAML
    return {"children": [{"type": "yaml", "value": value}]}


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
        del telemetry
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


class _Span:
    trace_id = "abc123abc123abc123abc123abc123ab"

    def set_attribute(self, key: str, value: str) -> None:
        pass


def _spy_hook(captured: list[PromptSpanParams]):
    @asynccontextmanager
    async def hook(params: PromptSpanParams):
        captured.append(params)
        yield _Span()

    return hook


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("config_line", "options"),
    [
        ("text_config:\n  model_name: test", {"shouldStream": False}),
        ("text_config:\n  model_name: test", {"shouldStream": True}),
        ("object_config:\n  model_name: test", {"shouldStream": False}),
        ("object_config:\n  model_name: test", {"shouldStream": True}),
        ("image_config:\n  model_name: test", {}),
        ("speech_config:\n  model_name: test", {}),
    ],
)
async def test_prompt_span_receives_prompt_name_and_commit_sha(config_line, options):
    captured: list[PromptSpanParams] = []
    runner = WebhookRunner(
        _StubClient(), _FullExecutor(), prompt_span_hook=_spy_hook(captured)
    )

    await runner.run_prompt(_ast(config_line), options)

    # Exact dataclass equality — a dropped or renamed field fails here.
    assert captured == [
        PromptSpanParams(
            name="greet", prompt_name="greet", commit_sha="abc123def456"
        )
    ]


@pytest.mark.asyncio
async def test_prompt_span_commit_sha_none_without_agentmark_meta():
    captured: list[PromptSpanParams] = []
    runner = WebhookRunner(
        _StubClient(), _FullExecutor(), prompt_span_hook=_spy_hook(captured)
    )

    await runner.run_prompt(
        _ast("text_config:\n  model_name: test", with_meta=False),
        {"shouldStream": False},
    )

    assert captured == [
        PromptSpanParams(name="greet", prompt_name="greet", commit_sha=None)
    ]


@pytest.mark.asyncio
async def test_null_hook_behavior_unchanged():
    runner = WebhookRunner(_StubClient(), _FullExecutor())
    response = await runner.run_prompt(
        _ast("text_config:\n  model_name: test"), {"shouldStream": False}
    )
    assert response["result"] == "hello"
    # Null hooks yield no trace id — the envelope omits the key entirely.
    assert "traceId" not in response
