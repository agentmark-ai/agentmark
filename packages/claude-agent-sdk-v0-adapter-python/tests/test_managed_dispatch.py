"""Managed-deployment dispatch for the claude-agent-sdk adapter — parity twin of
the pydantic ``test_managed_dispatch.py``.

A Cloud-deployed claude app's managed handler routes every gateway job through
the shared dispatch. This drives a real ``ClaudeAgentWebhookHandler`` for the
``get-evals`` control-plane job and asserts the answer equals the SAME
``conformance-vectors/control-plane.json`` every other surface uses, so the
managed claude surface cannot drift from the cross-language wire contract.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from agentmark.prompt_core import AgentMark, DefaultAdapter
from agentmark_claude_agent_sdk_v0 import handle_webhook_request
from agentmark_claude_agent_sdk_v0.webhook import ClaudeAgentWebhookHandler


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
    handler = ClaudeAgentWebhookHandler(client)

    result = await handle_webhook_request(
        {"type": "get-evals", "data": {}}, handler, client
    )

    assert result == case["expected"]


@pytest.mark.asyncio
async def test_managed_get_evals_zero_config_via_handler_client() -> None:
    client = _client_with_evals("safety", "accuracy")
    handler = ClaudeAgentWebhookHandler(client)

    result = await handle_webhook_request({"type": "get-evals", "data": {}}, handler)

    assert result == {
        "type": "evals",
        "result": '["accuracy","safety"]',
        "traceId": "",
    }


@pytest.mark.asyncio
async def test_handler_dispatch_answers_get_evals() -> None:
    client = _client_with_evals("a", "b")
    handler = ClaudeAgentWebhookHandler(client)
    result = await handler.dispatch({"type": "get-evals", "data": {}})
    assert result == {"type": "evals", "result": '["a","b"]', "traceId": ""}


@pytest.mark.asyncio
async def test_claude_handler_exposes_its_client() -> None:
    client = _client_with_evals("x")
    assert ClaudeAgentWebhookHandler(client).client is client
