"""Byte-equality gate for the Claude Agent SDK adapter (Python).

Parity with ai-sdk-v4-adapter/test/runner.snapshot.test.ts and
pydantic-ai-v0-adapter/tests/test_wire_snapshot.py — asserts the exact
NDJSON bytes the handler emits.

claude-agent-python delegates directly to the shared WebhookRunner with
no adapter-specific wire envelope (the legacy experiment_start /
experiment_end / experiment_item_error markers were removed in favor of
the canonical v4/v5/pydantic wire shape — a bare `dataset` chunk per
item, error or otherwise, with stream closure as the terminal signal).
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agentmark_claude_agent_sdk_v0.webhook import ClaudeAgentWebhookHandler

# Re-use the helper set already consumed by test_webhook.py.
from tests.test_webhook import (  # noqa: E402
    TRACED_QUERY_PATH,
    create_mock_ast,
    create_mock_client,
    make_mock_traced_query_from_gen,
)


@pytest.fixture
def mock_client() -> MagicMock:
    return create_mock_client()


@pytest.fixture
def handler(mock_client: MagicMock) -> ClaudeAgentWebhookHandler:
    return ClaudeAgentWebhookHandler(mock_client)


@pytest.mark.asyncio
async def test_wire_experiment_stream_shape(
    handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
) -> None:
    """One dataset item → exactly one `dataset` chunk, no envelope.

    Asserts exact JSON bytes minus the fields that legitimately vary per
    invocation (runId uuid, traceId).
    """

    async def mock_dataset() -> AsyncGenerator[dict[str, Any], None]:
        yield {
            "formatted": MagicMock(
                query=MagicMock(prompt="test", options=MagicMock()),
                telemetry=MagicMock(is_enabled=True, prompt_name="snap"),
            ),
            "dataset": {"input": {"q": "hi"}, "expected_output": "ok"},
        }

    mock_client._mock_text_prompt.format_with_dataset.return_value = mock_dataset()

    async def mock_query_results() -> AsyncGenerator[dict[str, Any], None]:
        yield {
            "type": "result",
            "subtype": "success",
            "result": "hi-back",
            "usage": {"input_tokens": 1, "output_tokens": 1},
        }

    @asynccontextmanager
    async def fake_span_context(_opts: Any):
        yield MagicMock(trace_id="", set_attribute=lambda *_: None)

    with patch.object(
        handler,
        "_get_frontmatter",
        return_value={
            "name": "snap",
            "text_config": {},
            "test_settings": {"dataset": "./snap.jsonl"},
        },
    ), patch(TRACED_QUERY_PATH, make_mock_traced_query_from_gen(mock_query_results)), patch(
        "agentmark_sdk.span_context", fake_span_context
    ):
        response = await handler.run_experiment(create_mock_ast(), "snap-run")
        chunks: list[str] = []
        async for chunk in response.stream:
            text = chunk.decode() if isinstance(chunk, bytes) else str(chunk)
            chunks.append(text)

    parsed = [json.loads(c) for c in chunks]
    # Shape: exactly one `dataset` chunk, no envelope markers — matches
    # the v4/v5/pydantic wire.
    assert [p.get("type") for p in parsed] == ["dataset"]

    dataset_chunk = parsed[0]
    run_id = dataset_chunk.pop("runId", None)
    dataset_chunk.pop("traceId", None)
    assert isinstance(run_id, str) and len(run_id) == 36

    assert dataset_chunk == {
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
