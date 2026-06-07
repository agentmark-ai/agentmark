"""Wire-level streaming tests: real OpenAI SSE -> real pydantic-ai parser.

WHY THIS FILE EXISTS: pydantic-ai's offline ``TestModel``/``FunctionModel``
emit a *different event sequence* than its production model parsers do. The
test models emit an EMPTY ``PartStartEvent`` and deliver all text via
``TextPartDelta`` events; the real OpenAI parser folds a part's FIRST content
chunk into the ``PartStartEvent`` itself (and a single-chunk response arrives
ONLY there). An executor that handles only deltas passes every TestModel-based
test while silently dropping the opening token(s) of every real streamed
response — which is exactly the regression this file pins.

These tests therefore bypass the test models entirely: a local aiohttp server
speaks OpenAI's chat-completions SSE wire format, pydantic-ai's REAL OpenAI
model parses it (via ``OPENAI_BASE_URL``), and the assertion is on the NDJSON
the production ``PydanticAIWebhookHandler.run_prompt`` path emits. If an
upstream pydantic-ai release changes event timing again, this fails in CI
instead of in production.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiohttp import web

from agentmark_pydantic_ai_v0.webhook import PydanticAIWebhookHandler

EXPECTED_TEXT = "The capital of France is Paris."

PROMPT_AST = {
    "type": "root",
    "children": [{"type": "yaml", "value": "text_config:\n  model_name: test"}],
}


def _chat_chunk(
    delta: dict[str, Any],
    finish: str | None = None,
    usage: dict[str, int] | None = None,
) -> bytes:
    payload: dict[str, Any] = {
        "id": "chatcmpl-wire-1",
        "object": "chat.completion.chunk",
        "created": 1700000000,
        "model": "gpt-4o-mini",
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
    }
    if usage is not None:
        payload["usage"] = usage
    return b"data: " + json.dumps(payload).encode() + b"\n\n"


async def _serve_sse(content_chunks: list[str]) -> tuple[web.AppRunner, str]:
    """Boot an aiohttp server speaking the chat-completions SSE wire format.

    Streams ``content_chunks`` one delta at a time after the customary
    role-only first chunk, then a finish chunk carrying usage, then [DONE].
    Returns the runner (caller cleans up) and the base URL.
    """

    async def chat_completions(request: web.Request) -> web.StreamResponse:
        # The parser only changes behavior on the response; the request body
        # is irrelevant here beyond being valid JSON.
        await request.json()
        resp = web.StreamResponse(
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
            }
        )
        await resp.prepare(request)
        await resp.write(_chat_chunk({"role": "assistant", "content": ""}))
        for piece in content_chunks:
            await resp.write(_chat_chunk({"content": piece}))
        await resp.write(
            _chat_chunk(
                {},
                finish="stop",
                usage={
                    "prompt_tokens": 12,
                    "completion_tokens": 8,
                    "total_tokens": 20,
                },
            )
        )
        await resp.write(b"data: [DONE]\n\n")
        await resp.write_eof()
        return resp

    app = web.Application()
    app.router.add_post("/v1/chat/completions", chat_completions)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = runner.addresses[0][1]
    return runner, f"http://127.0.0.1:{port}/v1"


def _wire_handler() -> PydanticAIWebhookHandler:
    """Production handler with the loader/client seams stubbed.

    The model is the REAL ``openai:gpt-4o-mini`` string so the executor's
    ``Agent(...)`` resolves pydantic-ai's real OpenAI model — no test models.
    """
    params = MagicMock()
    params.model = "openai:gpt-4o-mini"
    params.system_prompt = ""
    params.user_prompt = "What is the capital of France?"
    params.model_settings = {}
    params.tools = []

    mock_prompt = MagicMock()
    mock_prompt.format_with_test_props = AsyncMock(return_value=params)

    client = MagicMock()
    client.eval_registry = None
    client.load_text_prompt = AsyncMock(return_value=mock_prompt)
    return PydanticAIWebhookHandler(client)


async def _run_streaming(base_url: str, monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_BASE_URL", base_url)

    result = await _wire_handler().run_prompt(PROMPT_AST, {"shouldStream": True})
    chunks: list[dict] = []
    async for chunk in result["stream"]:
        chunks.append(json.loads(chunk))
    return chunks


class TestStreamingOverRealWire:
    async def test_single_chunk_response_text_survives(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A single-content-chunk stream arrives ENTIRELY inside
        ``PartStartEvent`` on the real parser — the pre-fix executor emitted
        no text at all for this shape."""
        runner, base_url = await _serve_sse([EXPECTED_TEXT])
        try:
            chunks = await _run_streaming(base_url, monkeypatch)
        finally:
            await runner.cleanup()

        texts = [c["result"] for c in chunks if "result" in c]
        assert "".join(texts) == EXPECTED_TEXT

        finish = [c for c in chunks if c.get("finishReason")]
        assert len(finish) == 1
        assert finish[0]["finishReason"] == "stop"
        assert finish[0]["usage"]["inputTokens"] == 12
        assert finish[0]["usage"]["outputTokens"] == 8
        assert finish[0]["usage"]["totalTokens"] == 20

    async def test_multi_chunk_response_keeps_first_token(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Token-by-token streaming: the first content chunk rides the
        part-start event, the rest arrive as deltas — the real-OpenAI shape.
        The pre-fix executor dropped the opening token."""
        pieces = ["The capital", " of France", " is Paris."]
        runner, base_url = await _serve_sse(pieces)
        try:
            chunks = await _run_streaming(base_url, monkeypatch)
        finally:
            await runner.cleanup()

        texts = [c["result"] for c in chunks if "result" in c]
        # Positional: order preserved, nothing merged away, nothing dropped —
        # most importantly the FIRST piece (the part-start one) is present.
        assert "".join(texts) == EXPECTED_TEXT
        assert texts[0].startswith("The")
