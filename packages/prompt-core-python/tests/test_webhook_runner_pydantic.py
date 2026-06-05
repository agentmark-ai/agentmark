"""Integration tests for WebhookRunner with Pydantic-native output types.

Key guarantee being tested: Pydantic BaseModel instances yielded by an
executor as `ObjectFinalEvent.value` are serialized via `model_dump()`
when emitted through the wire (streaming NDJSON + non-streaming dict).
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager

import pytest
from pydantic import BaseModel

from agentmark.prompt_core import (
    ExecCtx,
    ExecutorCapabilities,
    FinishEvent,
    ObjectDeltaEvent,
    ObjectFinalEvent,
    TextDeltaEvent,
    UsageData,
    WebhookRunner,
)


class Answer(BaseModel):
    answer: int
    explanation: str


class _PydanticStubExecutor:
    """Stub executor that yields Pydantic instances as ObjectFinalEvent.value.
    Ensures the runner's serialization path handles BaseModel correctly."""

    name = "pydantic-stub"

    def capabilities(self) -> ExecutorCapabilities:
        return ExecutorCapabilities(text=True, object=True)

    async def execute_text(self, formatted, ctx: ExecCtx):
        yield TextDeltaEvent(text="hello")
        yield FinishEvent(
            reason="stop", usage=UsageData(input_tokens=3, output_tokens=5, total_tokens=8)
        )

    async def execute_object(self, formatted, ctx: ExecCtx):
        yield ObjectFinalEvent(value=Answer(answer=42, explanation="because"))
        yield FinishEvent(
            reason="stop", usage=UsageData(input_tokens=5, output_tokens=10, total_tokens=15)
        )


class _StreamingObjectExecutor:
    """Yields multiple partials as Pydantic instances (streaming case)."""

    name = "pydantic-streaming-stub"

    def capabilities(self) -> ExecutorCapabilities:
        return ExecutorCapabilities(text=True, object=True)

    async def execute_text(self, formatted, ctx: ExecCtx):  # unused
        yield FinishEvent(reason="stop", usage=UsageData(input_tokens=0, output_tokens=0))

    async def execute_object(self, formatted, ctx: ExecCtx):
        yield ObjectDeltaEvent(partial=Answer(answer=1, explanation="partial-1"))
        yield ObjectDeltaEvent(partial=Answer(answer=2, explanation="partial-2"))
        yield FinishEvent(
            reason="stop",
            usage=UsageData(input_tokens=3, output_tokens=7, total_tokens=10),
        )


class _StubPrompt:
    """Mimics the async prompt returned by AgentMark.load_*_prompt."""

    async def format(self, props=None, telemetry=None):
        del telemetry
        return {"_fake": True}

    async def format_with_test_props(self, telemetry=None):
        del telemetry
        return {"_fake": True}


class _StubClient:
    """Minimal AgentMark-like client for the runner's non-experiment paths."""

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


class _ImageSpeechExecutor(_PydanticStubExecutor):
    def capabilities(self) -> ExecutorCapabilities:
        return ExecutorCapabilities(text=True, object=True, image=True, speech=True)

    async def execute_image(self, formatted, ctx: ExecCtx):
        return {
            "type": "image",
            "result": [{"mimeType": "image/png", "base64": "abc"}],
        }

    async def execute_speech(self, formatted, ctx: ExecCtx):
        return {
            "type": "speech",
            "result": {"mimeType": "audio/mpeg", "base64": "xyz", "format": "mp3"},
        }


class _TraceSpan:
    def __init__(self, trace_id: str) -> None:
        self.trace_id = trace_id
        self.attributes: list[tuple[str, str]] = []

    def set_attribute(self, key: str, value: str) -> None:
        self.attributes.append((key, value))


@asynccontextmanager
async def _prompt_span(_params):
    yield _TraceSpan("abc123abc123abc123abc123abc123ab")


@pytest.mark.asyncio
async def test_non_streaming_object_serializes_pydantic_model():
    runner = WebhookRunner(_StubClient(), _PydanticStubExecutor())
    ast = {
        "children": [
            {"type": "yaml", "value": "object_config:\n  model_name: test\n"}
        ]
    }
    response = await runner.run_prompt(ast, {"shouldStream": False})

    assert response["type"] == "object"
    # Pydantic instance must have been serialized via model_dump(),
    # NOT passed through as a BaseModel.
    assert isinstance(response["result"], dict)
    assert response["result"] == {"answer": 42, "explanation": "because"}
    assert response["usage"]["inputTokens"] == 5
    assert response["usage"]["promptTokens"] == 5  # legacy alias preserved


@pytest.mark.asyncio
async def test_streaming_object_emits_ndjson_with_serialized_partials():
    runner = WebhookRunner(_StubClient(), _StreamingObjectExecutor())
    ast = {
        "children": [
            {"type": "yaml", "value": "object_config:\n  model_name: test\n"}
        ]
    }
    response = await runner.run_prompt(ast, {"shouldStream": True})

    assert response["type"] == "stream"
    chunks: list[dict] = []
    async for line in response["stream"]:
        for piece in line.splitlines():
            if piece.strip():
                chunks.append(json.loads(piece))

    # Two object-delta partials → two {"type":"object","result":{...}} chunks.
    object_result_chunks = [c for c in chunks if c.get("type") == "object" and "result" in c]
    assert len(object_result_chunks) == 2
    assert object_result_chunks[0]["result"] == {"answer": 1, "explanation": "partial-1"}
    assert object_result_chunks[1]["result"] == {"answer": 2, "explanation": "partial-2"}

    # The finish event carried usage inline — should land in the stream.
    usage_chunks = [c for c in chunks if "usage" in c]
    assert usage_chunks, f"no usage chunk found in NDJSON: {chunks}"


@pytest.mark.asyncio
async def test_non_streaming_text_wire_shape():
    runner = WebhookRunner(
        _StubClient(),
        _PydanticStubExecutor(),
        prompt_span_hook=_prompt_span,
    )
    ast = {
        "children": [
            {"type": "yaml", "value": "text_config:\n  model_name: test\n"}
        ]
    }
    response = await runner.run_prompt(ast, {"shouldStream": False})

    assert response["type"] == "text"
    assert response["result"] == "hello"
    assert response["finishReason"] == "stop"
    # Both legacy field families present (matches TS byte shape).
    assert response["usage"] == {
        "inputTokens": 3,
        "outputTokens": 5,
        "promptTokens": 3,
        "completionTokens": 5,
        "totalTokens": 8,
    }
    assert response["toolCalls"] == []
    assert response["toolResults"] == []
    assert response["traceId"] == "abc123abc123abc123abc123abc123ab"


@pytest.mark.asyncio
async def test_streaming_text_includes_trace_id():
    runner = WebhookRunner(
        _StubClient(),
        _PydanticStubExecutor(),
        prompt_span_hook=_prompt_span,
    )
    ast = {
        "children": [
            {"type": "yaml", "value": "text_config:\n  model_name: test\n"}
        ]
    }

    response = await runner.run_prompt(ast, {"shouldStream": True})

    assert response["type"] == "stream"
    assert response["traceId"] == "abc123abc123abc123abc123abc123ab"


@pytest.mark.asyncio
async def test_image_prompt_runs_through_shared_runner():
    runner = WebhookRunner(
        _StubClient(),
        _ImageSpeechExecutor(),
        prompt_span_hook=_prompt_span,
    )
    ast = {
        "children": [
            {"type": "yaml", "value": "image_config:\n  model_name: test\n"}
        ]
    }

    response = await runner.run_prompt(ast, {"shouldStream": False})

    assert response == {
        "type": "image",
        "result": [{"mimeType": "image/png", "base64": "abc"}],
        "traceId": "abc123abc123abc123abc123abc123ab",
    }


@pytest.mark.asyncio
async def test_speech_prompt_runs_through_shared_runner():
    runner = WebhookRunner(
        _StubClient(),
        _ImageSpeechExecutor(),
        prompt_span_hook=_prompt_span,
    )
    ast = {
        "children": [
            {"type": "yaml", "value": "speech_config:\n  model_name: test\n"}
        ]
    }

    response = await runner.run_prompt(ast, {"shouldStream": False})

    assert response == {
        "type": "speech",
        "result": {"mimeType": "audio/mpeg", "base64": "xyz", "format": "mp3"},
        "traceId": "abc123abc123abc123abc123abc123ab",
    }


# ---------------------------------------------------------------------------
# Regression: eval input must be populated for adapters (pydantic-ai) whose
# formatted payload exposes `_raw_messages` / `user_prompt` instead of the
# AI SDK-style `messages` field.
# ---------------------------------------------------------------------------


from dataclasses import dataclass, field


@dataclass
class _PydanticAIFormattedLike:
    """Mimics PydanticAITextParams — has _raw_messages + user_prompt, no `messages`."""

    user_prompt: str
    _raw_messages: list = field(default_factory=list)


class _DatasetReader:
    def __init__(self, items: list) -> None:
        self._items = items
        self._i = 0

    async def read(self):
        if self._i >= len(self._items):
            return {"done": True, "value": None}
        item = self._items[self._i]
        self._i += 1
        return {"done": False, "value": item}


class _DatasetStream:
    def __init__(self, items: list) -> None:
        self._items = items

    def get_reader(self) -> _DatasetReader:
        return _DatasetReader(self._items)


class _ExperimentPrompt:
    def __init__(self, items: list) -> None:
        self._items = items

    async def format_with_dataset(self, **_: object) -> _DatasetStream:
        return _DatasetStream(self._items)


class _ExperimentClient:
    """Client whose registry routes to a single capturing scorer."""

    def __init__(self, prompt: _ExperimentPrompt, registry: dict) -> None:
        self._prompt = prompt
        self._registry = registry

    async def load_text_prompt(self, _ast):
        return self._prompt

    async def load_object_prompt(self, _ast):
        return self._prompt

    def get_eval_registry(self):
        return self._registry


@pytest.mark.asyncio
async def test_experiment_eval_receives_raw_messages_for_pydantic_ai_formatted():
    """Regression: eval ``input`` was always None for pydantic-ai because the
    runner only looked at ``formatted.messages``. Ensure we fall back through
    ``_raw_messages`` → ``user_prompt``."""

    captured: dict = {}

    async def capture_scorer(params):
        captured["input"] = params["input"]
        return {"score": 1.0, "passed": True}

    raw_messages = [{"role": "user", "content": "hello from dataset"}]
    formatted = _PydanticAIFormattedLike(
        user_prompt="hello from dataset", _raw_messages=raw_messages
    )

    dataset_items = [
        {
            "formatted": formatted,
            "dataset": {"input": {"name": "Ada"}, "expected_output": "hi Ada"},
            "evals": ["capture"],
        }
    ]

    runner = WebhookRunner(
        _ExperimentClient(
            _ExperimentPrompt(dataset_items),
            {"capture": capture_scorer},
        ),
        _PydanticStubExecutor(),
    )

    ast = {
        "children": [
            {"type": "yaml", "value": "text_config:\n  model_name: test\n"}
        ]
    }

    response = await runner.run_experiment(ast, "test-run")
    async for _ in response["stream"]:
        pass

    # The capturing scorer must have been called with a non-None input.
    assert "input" in captured, "scorer was never invoked"
    assert captured["input"] is not None
    # Prefer the richer _raw_messages when present.
    assert captured["input"] == raw_messages


@pytest.mark.asyncio
async def test_experiment_eval_falls_back_to_user_prompt_when_raw_messages_empty():
    """When _raw_messages is an empty list and there's only a user_prompt,
    the scorer input must surface user_prompt rather than the falsy list."""

    captured: dict = {}

    async def capture_scorer(params):
        captured["input"] = params["input"]
        return {"score": 1.0, "passed": True}

    formatted = _PydanticAIFormattedLike(
        user_prompt="render-only user prompt", _raw_messages=[]
    )

    dataset_items = [
        {
            "formatted": formatted,
            "dataset": {"input": {"x": 1}, "expected_output": "ok"},
            "evals": ["capture"],
        }
    ]

    runner = WebhookRunner(
        _ExperimentClient(
            _ExperimentPrompt(dataset_items),
            {"capture": capture_scorer},
        ),
        _PydanticStubExecutor(),
    )

    ast = {
        "children": [
            {"type": "yaml", "value": "text_config:\n  model_name: test\n"}
        ]
    }

    response = await runner.run_experiment(ast, "test-run")
    async for _ in response["stream"]:
        pass

    assert captured.get("input") == "render-only user prompt"


# ---------------------------------------------------------------------------
# Regression: _compute_dataset_item_name must be byte-compatible with TS's
# computeDatasetItemName. Changing the JSON separator silently breaks dataset
# row identity across languages, so pin the canonical digests here; the
# matching TS test lives at packages/prompt-core/test/dataset-item-name.test.ts.
# ---------------------------------------------------------------------------


from agentmark.prompt_core.webhook_runner import _compute_dataset_item_name


@pytest.mark.parametrize(
    "value,index,expected",
    [
        # Null / empty → fall back to index (no hashing).
        (None, 0, "0"),
        ("", 7, "7"),
        ({}, 2, "2"),
        # Pinned vectors — MUST match TS `computeDatasetItemName` exactly.
        ({"a": 1, "b": [2, 3]}, 0, "94dc2faee24e"),
        ({"b": [2, 3], "a": 1}, 0, "94dc2faee24e"),  # key order irrelevant
        ({"xs": [1, 2, 3]}, 0, "413ec960d6b8"),
        ({"xs": [3, 2, 1]}, 0, "ca304d7dbc5a"),  # array order significant
        ([1, 2, 3], 0, "f1e46f328e6d"),
        ("hello", 0, "5deaee1c1332"),
        (42, 0, "a1d0c6e83f02"),
        (True, 0, "b326b5062b2f"),
    ],
)
def test_dataset_item_name_parity_vectors(value, index, expected):
    assert _compute_dataset_item_name(value, index) == expected
