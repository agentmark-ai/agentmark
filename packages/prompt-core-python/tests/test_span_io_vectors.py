"""Cross-language span-I/O conformance: drive the WebhookRunner with the
pinned cases in ``conformance-vectors/vectors/span-io.json`` and assert the
prompt span receives the contracted ``agentmark.input`` / ``agentmark.output``
attributes — and that the span ends at stream drain, never at iterable
creation (the early-span-end regression that split model spans into a
separate trace).

Mirror of ``prompt-core/test/span-io-vectors.test.ts``. Both suites read the
SAME vector file, so a drift in either runner's span-attribute behavior
fails loudly in both CI runs.
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pytest

from agentmark.prompt_core import (
    ErrorEvent,
    ExecutorCapabilities,
    FinishEvent,
    ObjectDeltaEvent,
    ObjectFinalEvent,
    TextDeltaEvent,
    UsageData,
    WebhookRunner,
)


def _vectors_path() -> Path:
    packages_dir = Path(__file__).resolve().parents[2]
    return packages_dir / "conformance-vectors" / "vectors" / "span-io.json"


VECTORS = json.loads(_vectors_path().read_text())

TEXT_AST = {"children": [{"type": "yaml", "value": "text_config:\n  model_name: test\n"}]}
OBJECT_AST = {"children": [{"type": "yaml", "value": "object_config:\n  model_name: test\n"}]}


def _event_from_json(ev: dict[str, Any]) -> Any:
    """Map vector events (TS AgentEvent field names) onto Python dataclasses."""
    kind = ev["type"]
    if kind == "text-delta":
        return TextDeltaEvent(text=ev["text"])
    if kind == "object-delta":
        return ObjectDeltaEvent(partial=ev["partial"])
    if kind == "object-final":
        return ObjectFinalEvent(value=ev["value"])
    if kind == "finish":
        usage = ev.get("usage")
        return FinishEvent(
            reason=ev["reason"],
            usage=UsageData(
                input_tokens=usage["inputTokens"],
                output_tokens=usage["outputTokens"],
                total_tokens=usage["inputTokens"] + usage["outputTokens"],
            )
            if usage
            else None,
        )
    if kind == "error":
        return ErrorEvent(error=ev["error"])
    raise ValueError(f"unhandled vector event type: {kind}")


class _ReplayExecutor:
    """Executor that replays the vector's events verbatim."""

    name = "replay"

    def __init__(self, events: list[dict[str, Any]]) -> None:
        self._events = [_event_from_json(e) for e in events]

    def capabilities(self) -> ExecutorCapabilities:
        return ExecutorCapabilities(text=True, object=True)

    async def execute_text(self, formatted: Any, ctx: Any):
        for ev in self._events:
            yield ev

    async def execute_object(self, formatted: Any, ctx: Any):
        for ev in self._events:
            yield ev


class _Formatted:
    def __init__(self, messages: list[dict[str, Any]]) -> None:
        self.messages = messages


class _StubPrompt:
    def __init__(self, messages: list[dict[str, Any]]) -> None:
        self._messages = messages

    async def format(self, props: Any = None, telemetry: Any = None):
        del props, telemetry
        return _Formatted(self._messages)

    async def format_with_test_props(self, telemetry: Any = None):
        del telemetry
        return _Formatted(self._messages)


class _StubClient:
    def __init__(self, messages: list[dict[str, Any]]) -> None:
        self._prompt = _StubPrompt(messages)

    async def load_text_prompt(self, _ast: Any):
        return self._prompt

    async def load_object_prompt(self, _ast: Any):
        return self._prompt

    def get_eval_registry(self):
        return None


class _RecordingSpan:
    def __init__(self) -> None:
        self.trace_id = "abc123abc123abc123abc123abc123ab"
        self.attributes: dict[str, str | int] = {}

    def set_attribute(self, key: str, value: str | int) -> None:
        self.attributes[key] = value


class _RecordingHook:
    """Prompt span hook recording attributes and when the span ended."""

    def __init__(self) -> None:
        self.span = _RecordingSpan()
        self.ended = False

    def __call__(self, _params: Any):
        @asynccontextmanager
        async def _cm():
            try:
                yield self.span
            finally:
                self.ended = True

        return _cm()


def _assert_attributes(attributes: dict[str, str | int], expected: dict[str, Any]) -> None:
    # Input is always compared as parsed JSON — TS/Python spacing differs.
    assert "agentmark.input" in attributes
    assert json.loads(attributes["agentmark.input"]) == expected["input"]

    if expected["output"] is None:
        assert "agentmark.output" not in attributes
    elif isinstance(expected["output"], str):
        assert attributes["agentmark.output"] == expected["output"]
    else:
        assert json.loads(attributes["agentmark.output"]) == expected["output"]

    # Model is stamped from frontmatter at span start on every path.
    assert attributes["gen_ai.request.model"] == expected["model"]

    # Usage must be NUMERIC attributes (the normalizer rejects strings).
    if expected["usage"] is None:
        assert "gen_ai.usage.input_tokens" not in attributes
        assert "gen_ai.usage.output_tokens" not in attributes
    else:
        assert attributes["gen_ai.usage.input_tokens"] == expected["usage"]["input"]
        assert attributes["gen_ai.usage.output_tokens"] == expected["usage"]["output"]


@pytest.mark.asyncio
@pytest.mark.parametrize("case", VECTORS["cases"], ids=[c["name"] for c in VECTORS["cases"]])
async def test_span_io_vector(case: dict[str, Any]) -> None:
    hook = _RecordingHook()
    runner = WebhookRunner(
        _StubClient(case["messages"]),
        _ReplayExecutor(case["events"]),
        prompt_span_hook=hook,
    )
    ast = TEXT_AST if case["kind"] == "text" else OBJECT_AST

    if case["throws"]:
        with pytest.raises(Exception):
            await runner.run_prompt(ast, {"shouldStream": case["shouldStream"]})
        _assert_attributes(hook.span.attributes, case["expected"])
        assert hook.ended is True
        return

    response = await runner.run_prompt(ast, {"shouldStream": case["shouldStream"]})

    if case["shouldStream"]:
        # The span must NOT have ended at hand-back: the model call runs
        # during the drain, and ending early orphans the model spans.
        assert hook.ended is False
        async for _chunk in response["stream"]:
            pass
        assert hook.ended is True
    else:
        assert hook.ended is True

    _assert_attributes(hook.span.attributes, case["expected"])
