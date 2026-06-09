"""Managed-deployment dispatch for the pydantic adapter — the REAL surface that
broke.

A Cloud-deployed pydantic app runs ``handle_webhook_request(event, handler,
client)`` inside its ``handler(event)`` (the builder's ``_agentmark_server.py``
calls that handler for every gateway job). This suite drives a real
``PydanticAIWebhookHandler`` — not a stub — through that dispatch for the
``get-evals`` control-plane job, and asserts the answer equals the SAME
``conformance-vectors/control-plane.json`` the dev server and TS use.

The dev-server path is covered by ``test_get_evals_webhook.py``; this is its
managed-handler twin. They are different code paths (aiohttp ``_handle_webhook``
vs the flat ``handle_webhook_request``), and the managed one is the one that
had no test — which is why ``get-evals`` shipped broken to deployed apps.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from agentmark.prompt_core import AgentMark, DefaultAdapter
from agentmark_pydantic_ai_v0 import PydanticAIWebhookHandler, handle_webhook_request


def _vectors_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "conformance-vectors" / "vectors"


_CASES = json.loads(
    (_vectors_dir() / "control-plane.json").read_text(encoding="utf-8")
)["cases"]


def _client_with_evals(*names: str) -> AgentMark:
    return AgentMark(
        adapter=DefaultAdapter(),
        evals={n: (lambda params: params) for n in names},
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("case", _CASES, ids=lambda c: c["name"])
async def test_managed_get_evals_matches_vector(case: dict[str, Any]) -> None:
    client = _client_with_evals(*case["evalNames"])
    handler = PydanticAIWebhookHandler(client)

    result = await handle_webhook_request(
        {"type": "get-evals", "data": {}}, handler, client
    )

    assert result == case["expected"]


@pytest.mark.asyncio
async def test_managed_get_evals_zero_config_via_handler_client() -> None:
    # The canonical handler.py calls handle_webhook_request(event, webhook,
    # client) — but even without the explicit client, the dispatch must source
    # names from handler.client (the property this adapter exposes). Removing
    # that property regresses this test (→ empty list).
    client = _client_with_evals("lot_count", "lot_url_pattern")
    handler = PydanticAIWebhookHandler(client)

    result = await handle_webhook_request({"type": "get-evals", "data": {}}, handler)

    assert result == {
        "type": "evals",
        "result": '["lot_count","lot_url_pattern"]',
        "traceId": "",
    }


@pytest.mark.asyncio
async def test_pydantic_handler_exposes_its_client() -> None:
    client = _client_with_evals("x")
    assert PydanticAIWebhookHandler(client).client is client


@pytest.mark.asyncio
async def test_handler_dispatch_answers_get_evals() -> None:
    # The collapsed canonical surface: `handler = PydanticAIWebhookHandler(client)`
    # and the deployed entry is `handler.dispatch` — it routes get-evals through
    # the shared runner with no per-adapter dispatch code.
    client = _client_with_evals("a", "b")
    handler = PydanticAIWebhookHandler(client)
    result = await handler.dispatch({"type": "get-evals", "data": {}})
    assert result == {"type": "evals", "result": '["a","b"]', "traceId": ""}
