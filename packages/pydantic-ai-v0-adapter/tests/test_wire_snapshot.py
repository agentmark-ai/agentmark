"""Byte-equality gate for the Pydantic AI adapter.

Parity with ai-sdk-v4-adapter/test/runner.snapshot.test.ts — asserts the
exact wire bytes the handler emits for the canonical flows. Any behavior
change here has to show up as a snapshot diff; silent wire drift across
the Python adapter surface is what this guard is meant to catch.

Scope: the shared-runner paths (text non-streaming, experiment single
item). Streaming text / object / image / speech paths are covered by the
behavioral tests in test_webhook.py.
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agentmark_pydantic_ai_v0.webhook import PydanticAIWebhookHandler


def _make_text_ast() -> dict[str, Any]:
    return {
        "type": "root",
        "children": [
            {
                "type": "yaml",
                "value": "name: snap\ntext_config:\n  model_name: test\ntest_settings:\n  dataset: ./snap.jsonl",
            }
        ],
        "data": {},
    }


@pytest.fixture
def mock_client() -> MagicMock:
    client = MagicMock()
    client.eval_registry = None
    return client


@pytest.fixture
def handler(mock_client: MagicMock) -> PydanticAIWebhookHandler:
    return PydanticAIWebhookHandler(mock_client)


@pytest.mark.asyncio
async def test_wire_non_streaming_text_prompt_shape(
    handler: PydanticAIWebhookHandler, mock_client: MagicMock
) -> None:
    """Exact dict shape the handler returns for run_prompt(shouldStream=False)."""
    mock_prompt = MagicMock()
    params = MagicMock()
    mock_prompt.format_with_test_props = AsyncMock(return_value=params)
    mock_client.load_text_prompt = AsyncMock(return_value=mock_prompt)

    usage = MagicMock()
    usage.request_tokens = 3
    usage.response_tokens = 7
    usage.total_tokens = 10
    run_result = MagicMock()
    run_result.output = "TEXT"
    run_result.all_messages = MagicMock(return_value=[])
    run_result.usage = MagicMock(return_value=usage)

    mock_agent = MagicMock()
    mock_agent.run = AsyncMock(return_value=run_result)

    with patch(
        "agentmark_pydantic_ai_v0.executor.Agent",
        MagicMock(return_value=mock_agent),
    ):
        result = await handler.run_prompt(_make_text_ast(), {"shouldStream": False})

    trace_id = result.pop("traceId", None)
    assert isinstance(trace_id, str) and len(trace_id) == 32

    # Byte-identical assertion against the expected wire shape. Field order
    # doesn't matter in a dict, but keys + types + values do.
    assert result == {
        "type": "text",
        "result": "TEXT",
        "usage": {
            "inputTokens": 3,
            "outputTokens": 7,
            "promptTokens": 3,
            "completionTokens": 7,
            "totalTokens": 10,
        },
        "finishReason": "stop",
        "toolCalls": [],
        "toolResults": [],
    }


@pytest.mark.asyncio
async def test_wire_experiment_item_chunk_shape(
    handler: PydanticAIWebhookHandler, mock_client: MagicMock
) -> None:
    """NDJSON per-item shape for run_experiment. Asserts bytes minus the
    fields that must vary per invocation (runId = uuid, traceId = span)."""
    mock_prompt = MagicMock()

    formatted = MagicMock()
    formatted._raw_messages = []
    formatted.user_prompt = "hi"

    reader = MagicMock()
    reader.read = AsyncMock(
        side_effect=[
            {
                "done": False,
                "value": {
                    "formatted": formatted,
                    "dataset": {"input": {"q": "hi"}, "expected_output": "ok"},
                    "evals": [],
                },
            },
            {"done": True},
        ]
    )
    dataset = MagicMock()
    dataset.get_reader = MagicMock(return_value=reader)
    mock_prompt.format_with_dataset = AsyncMock(return_value=dataset)
    mock_client.load_text_prompt = AsyncMock(return_value=mock_prompt)

    usage = MagicMock()
    usage.request_tokens = 1
    usage.response_tokens = 1
    usage.total_tokens = 2
    run_result = MagicMock()
    run_result.output = "hi-back"
    run_result.all_messages = MagicMock(return_value=[])
    run_result.usage = MagicMock(return_value=usage)

    mock_agent = MagicMock()
    mock_agent.run = AsyncMock(return_value=run_result)

    @asynccontextmanager
    async def fake_span_context(_opts: Any):
        yield MagicMock(trace_id="", set_attribute=lambda *_: None)

    with patch(
        "agentmark_pydantic_ai_v0.executor.Agent",
        MagicMock(return_value=mock_agent),
    ), patch(
        "agentmark_sdk.span_context",
        fake_span_context,
    ):
        response = await handler.run_experiment(_make_text_ast(), "snap-run")
        chunks: list[str] = []
        async for chunk in response["stream"]:
            chunks.append(chunk)

    # Exactly one dataset chunk, terminated by "\n".
    assert len(chunks) == 1
    line = chunks[0]
    assert line.endswith("\n")
    parsed = json.loads(line)

    # Strip the per-invocation fields (uuid + trace) to make this stable.
    run_id = parsed.pop("runId", None)
    parsed.pop("traceId", None)
    assert isinstance(run_id, str) and len(run_id) == 36  # uuid4

    assert parsed == {
        "type": "dataset",
        "result": {
            "input": {"q": "hi"},
            "expectedOutput": "ok",
            "actualOutput": "hi-back",
            "tokens": 2,
            "evals": [],
        },
        "runName": "snap-run",
    }
