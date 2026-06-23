"""Folder-aware prompt-path trace linking — WebhookRunner → prompt span hook params.

The flat frontmatter ``name`` collides across folders (platform uniqueness is
``(app_id, name, parent_path, file_extension)``), so the webhook request carries
a ``promptPath`` that the dispatch forwards as the run-prompt option
``promptPath``. These tests pin that ALL prompt-run paths
(text/object/image/speech) forward ``prompt_path`` to the prompt span hook via
``PromptSpanParams`` — mirroring the TS runner's
``webhook-runner-prompt-path.test.ts``. The SDK then emits it as the
``agentmark.prompt_path`` span attribute (pinned in sdk-python's trace tests).
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

PROMPT_PATH = "agentmark/support/triage.prompt.mdx"


def _ast(config_line: str) -> dict:
    # No agentmark_meta → commit_sha resolves to None, isolating prompt_path.
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
        ("text_config:\n  model_name: test", {"shouldStream": False, "promptPath": PROMPT_PATH}),
        ("text_config:\n  model_name: test", {"shouldStream": True, "promptPath": PROMPT_PATH}),
        ("object_config:\n  model_name: test", {"shouldStream": False, "promptPath": PROMPT_PATH}),
        ("object_config:\n  model_name: test", {"shouldStream": True, "promptPath": PROMPT_PATH}),
        ("image_config:\n  model_name: test", {"promptPath": PROMPT_PATH}),
        ("speech_config:\n  model_name: test", {"promptPath": PROMPT_PATH}),
    ],
)
async def test_prompt_span_receives_prompt_path(config_line, options):
    captured: list[PromptSpanParams] = []
    runner = WebhookRunner(
        _StubClient(), _FullExecutor(), prompt_span_hook=_spy_hook(captured)
    )

    await runner.run_prompt(_ast(config_line), options)

    # Exact dataclass equality — a dropped/renamed/mis-sourced field fails here.
    assert captured == [
        PromptSpanParams(
            name="greet",
            prompt_name="greet",
            commit_sha=None,
            prompt_path=PROMPT_PATH,
        )
    ]


@pytest.mark.asyncio
async def test_prompt_span_prompt_path_none_when_option_omitted():
    captured: list[PromptSpanParams] = []
    runner = WebhookRunner(
        _StubClient(), _FullExecutor(), prompt_span_hook=_spy_hook(captured)
    )

    await runner.run_prompt(
        _ast("text_config:\n  model_name: test"), {"shouldStream": False}
    )

    assert captured == [
        PromptSpanParams(
            name="greet", prompt_name="greet", commit_sha=None, prompt_path=None
        )
    ]
