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
    ErrorEvent,
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


# ---------------------------------------------------------------------------
# Executor span-attribute override — last-write-wins (e.g. Bedrock real model ID)
# ---------------------------------------------------------------------------
# The classification attributes (gen_ai.operation.name, agentmark.span.kind)
# are tested via the shared span-io conformance vectors in test_span_io_vectors.py.
# This test covers the orthogonal contract: executors CAN override
# gen_ai.request.model (e.g. to stamp the real cross-region inference profile
# ID instead of the config alias), and the runner's first-write doesn't win.


class _CapturingSpan:
    """Records every set_attribute call so tests can assert on them."""

    def __init__(self, trace_id: str = "trace-abc") -> None:
        self.trace_id = trace_id
        self.attrs: dict[str, object] = {}

    def set_attribute(self, key: str, value: object) -> None:
        self.attrs[key] = value


@asynccontextmanager
async def _capturing_span(_params):
    span = _CapturingSpan()
    yield span
    # Expose the span on the context manager itself so tests can inspect it.
    _capturing_span._last_span = span  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_executor_can_override_model_attribute_last_write_wins():
    """An executor that resolves the real inference profile ID should be able to
    override gen_ai.request.model by calling span.set_attribute() — the runner
    stamps the config alias first and the executor's call wins (last-write)."""

    class _BedrockLikeExecutor(_PydanticStubExecutor):
        async def execute_text(self, formatted, ctx: ExecCtx):
            span = (ctx.extra or {}).get("span")
            if span:
                span.set_attribute(
                    "gen_ai.request.model",
                    "us.anthropic.claude-opus-4-8-20251101-v1:0",
                )
            yield TextDeltaEvent(text="ok")
            yield FinishEvent(
                reason="stop",
                usage=UsageData(input_tokens=1, output_tokens=1, total_tokens=2),
            )

    runner = WebhookRunner(
        _StubClient(),
        _BedrockLikeExecutor(),
        prompt_span_hook=_capturing_span,
    )
    ast = {
        "children": [
            {"type": "yaml", "value": "text_config:\n  model_name: us.anthropic.claude-opus-4-8\n"}
        ]
    }

    await runner.run_prompt(ast, {"shouldStream": False})

    span = _capturing_span._last_span  # type: ignore[attr-defined]
    # The executor's value must win over the config alias the runner stamped first.
    assert span.attrs.get("gen_ai.request.model") == "us.anthropic.claude-opus-4-8-20251101-v1:0"


# ---------------------------------------------------------------------------
# Sync / async eval parity — inspect.isawaitable fix (Issue 4)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sync_eval_function_does_not_raise():
    """A synchronous eval function returning a plain dict must not raise
    ``TypeError: 'dict' object can't be awaited``."""

    def sync_exact_match(params):
        match = params["output"] == params.get("expectedOutput")
        return {"score": 1.0 if match else 0.0, "passed": match}

    formatted_stub = type("Fmt", (), {"messages": [{"role": "user", "content": "hi"}]})()
    dataset_items = [
        {
            "formatted": formatted_stub,
            "dataset": {"input": {"q": "1+1"}, "expected_output": "hello"},
            "evals": ["exact_match"],
        }
    ]

    runner = WebhookRunner(
        _ExperimentClient(
            _ExperimentPrompt(dataset_items),
            {"exact_match": sync_exact_match},
        ),
        _PydanticStubExecutor(),
    )
    ast = {
        "children": [
            {"type": "yaml", "value": "text_config:\n  model_name: test\n"}
        ]
    }

    response = await runner.run_experiment(ast, "sync-eval-test")
    rows = []
    async for chunk in response["stream"]:
        rows.append(json.loads(chunk))

    # The row must have been emitted (not swallowed by a TypeError).
    assert rows, "no rows emitted — sync eval likely raised instead of returning"
    assert rows[0].get("type") != "error", f"unexpected error row: {rows[0]}"


@pytest.mark.asyncio
async def test_async_eval_function_still_works():
    """Async eval functions must continue to work after the isawaitable fix."""

    async def async_scorer(params):
        return {"score": 0.5, "passed": False}

    formatted_stub = type("Fmt", (), {"messages": []})()
    dataset_items = [
        {
            "formatted": formatted_stub,
            "dataset": {"input": {}, "expected_output": "x"},
            "evals": ["async_scorer"],
        }
    ]

    runner = WebhookRunner(
        _ExperimentClient(
            _ExperimentPrompt(dataset_items),
            {"async_scorer": async_scorer},
        ),
        _PydanticStubExecutor(),
    )
    ast = {
        "children": [
            {"type": "yaml", "value": "text_config:\n  model_name: test\n"}
        ]
    }

    response = await runner.run_experiment(ast, "async-eval-test")
    rows = []
    async for chunk in response["stream"]:
        rows.append(json.loads(chunk))

    assert rows, "no rows emitted"
    assert rows[0].get("type") != "error", f"unexpected error row: {rows[0]}"


# ---------------------------------------------------------------------------
# Bug #3 — experiment items missing model/classify/usage span attributes
# Bug #2 — executor ErrorEvent exits span cleanly (status OK instead of ERROR)
# ---------------------------------------------------------------------------


class _ItemCapturingSpan:
    """Records every set_attribute call and whether __aexit__ saw an exception."""

    def __init__(self, trace_id: str = "item-trace-abc") -> None:
        self.trace_id = trace_id
        self.attrs: dict[str, object] = {}
        self.exited_with_exc: bool = False

    def set_attribute(self, key: str, value: object) -> None:
        self.attrs[key] = value


_last_item_span: _ItemCapturingSpan | None = None


@asynccontextmanager
async def _capturing_item_span(_params):
    global _last_item_span
    span = _ItemCapturingSpan()
    _last_item_span = span
    try:
        yield span
    except Exception:
        span.exited_with_exc = True
        raise


@pytest.mark.asyncio
async def test_experiment_item_span_gets_model_and_classify_attributes():
    """Bug #3: item spans must carry gen_ai.request.model and gen_ai.operation.name
    so the dashboard's Model column and Requests view work for experiment rows."""
    formatted_stub = type("Fmt", (), {"messages": []})()
    dataset_items = [
        {
            "formatted": formatted_stub,
            "dataset": {"input": {"q": "hi"}, "expected_output": "hello"},
            "evals": [],
        }
    ]

    runner = WebhookRunner(
        _ExperimentClient(_ExperimentPrompt(dataset_items), {}),
        _PydanticStubExecutor(),
        item_span_hook=_capturing_item_span,
    )
    ast = {"children": [{"type": "yaml", "value": "text_config:\n  model_name: bedrock/claude\n"}]}

    response = await runner.run_experiment(ast, "model-attr-test")
    async for _ in response["stream"]:
        pass

    span = _last_item_span
    assert span is not None
    assert span.attrs.get("gen_ai.request.model") == "bedrock/claude", (
        "item span missing gen_ai.request.model — dashboard Model column shows '-'"
    )
    assert span.attrs.get("gen_ai.operation.name") == "chat", (
        "item span missing gen_ai.operation.name — Requests view query returns nothing"
    )


@pytest.mark.asyncio
async def test_experiment_item_span_gets_usage_attributes():
    """Bug #3: item spans must carry gen_ai.usage.* so the Tokens column works."""
    formatted_stub = type("Fmt", (), {"messages": []})()
    dataset_items = [
        {
            "formatted": formatted_stub,
            "dataset": {"input": {}, "expected_output": ""},
            "evals": [],
        }
    ]

    runner = WebhookRunner(
        _ExperimentClient(_ExperimentPrompt(dataset_items), {}),
        _PydanticStubExecutor(),  # yields UsageData(input=3, output=5, total=8)
        item_span_hook=_capturing_item_span,
    )
    ast = {"children": [{"type": "yaml", "value": "text_config:\n  model_name: test\n"}]}

    response = await runner.run_experiment(ast, "usage-attr-test")
    async for _ in response["stream"]:
        pass

    span = _last_item_span
    assert span is not None
    assert span.attrs.get("gen_ai.usage.input_tokens") == 3
    assert span.attrs.get("gen_ai.usage.output_tokens") == 5


@pytest.mark.asyncio
async def test_experiment_tokens_wire_field_sums_when_total_tokens_absent():
    """Bug #3: when the executor returns UsageData without total_tokens, the wire
    `tokens` field must be input+output — not omitted (which shows as 0 in UI)."""

    class _NoTotalExecutor(_PydanticStubExecutor):
        async def execute_text(self, formatted, ctx: ExecCtx):
            yield TextDeltaEvent(text="hi")
            yield FinishEvent(
                reason="stop",
                usage=UsageData(input_tokens=4, output_tokens=6),  # total_tokens omitted
            )

    formatted_stub = type("Fmt", (), {"messages": []})()
    dataset_items = [
        {
            "formatted": formatted_stub,
            "dataset": {"input": {}, "expected_output": ""},
            "evals": [],
        }
    ]

    runner = WebhookRunner(
        _ExperimentClient(_ExperimentPrompt(dataset_items), {}),
        _NoTotalExecutor(),
    )
    ast = {"children": [{"type": "yaml", "value": "text_config:\n  model_name: test\n"}]}

    response = await runner.run_experiment(ast, "tokens-fallback-test")
    rows = []
    async for chunk in response["stream"]:
        rows.append(json.loads(chunk))

    assert rows, "no rows emitted"
    row = rows[0]
    assert row.get("type") != "error", f"unexpected error: {row}"
    assert row["result"]["tokens"] == 10, (
        "tokens should be input(4)+output(6)=10 when total_tokens is not provided"
    )


@pytest.mark.asyncio
async def test_experiment_executor_error_event_exits_span_with_exception():
    """Bug #2: an ErrorEvent from the executor must propagate as an exception
    through the item span hook so the OTel span status is ERROR, not OK."""

    class _ErrorExecutor(_PydanticStubExecutor):
        async def execute_text(self, formatted, ctx: ExecCtx):
            yield ErrorEvent(error="bedrock rate limit")

    formatted_stub = type("Fmt", (), {"messages": []})()
    dataset_items = [
        {
            "formatted": formatted_stub,
            "dataset": {"input": {"q": "hi"}, "expected_output": ""},
            "evals": [],
        }
    ]

    runner = WebhookRunner(
        _ExperimentClient(_ExperimentPrompt(dataset_items), {}),
        _ErrorExecutor(),
        item_span_hook=_capturing_item_span,
    )
    ast = {"children": [{"type": "yaml", "value": "text_config:\n  model_name: test\n"}]}

    response = await runner.run_experiment(ast, "error-status-test")
    rows = []
    async for chunk in response["stream"]:
        rows.append(json.loads(chunk))

    assert rows, "no rows emitted"
    assert rows[0].get("type") == "error", (
        "executor ErrorEvent must produce an error wire chunk"
    )
    assert "bedrock rate limit" in rows[0].get("error", "")

    span = _last_item_span
    assert span is not None
    assert span.exited_with_exc, (
        "span hook __aexit__ must receive an exception so OTel marks the span ERROR"
    )
