"""`get-evals` dispatch for the pydantic adapter — adapter adherence to the
shared control-plane contract.

The eval-listing logic is NOT in this adapter: it lives once on the client
(`get_eval_names`) and the shared `build_evals_response` helper. This suite
pins that the adapter's aiohttp server *routes* the `get-evals` job through
that shared path (sourcing names from the client, not the handler) and emits
the canonical envelope — asserted against the SAME
`conformance-vectors/control-plane.json` the prompt-core suites use, so this
adapter cannot drift from the cross-language wire contract.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from agentmark.prompt_core import WEBHOOK_JOB_TYPES, AgentMark, DefaultAdapter
from agentmark_pydantic_ai_v0.server import _handle_webhook
from agentmark_pydantic_ai_v0.webhook import PydanticAIWebhookHandler


def _vectors_dir() -> Path:
    # pydantic-ai-v0-adapter/tests/ → parents[2] = packages/ → sibling dir
    return Path(__file__).resolve().parents[2] / "conformance-vectors" / "vectors"


_CASES = json.loads(
    (_vectors_dir() / "control-plane.json").read_text(encoding="utf-8")
)["cases"]


def _client_with_evals(*names: str) -> AgentMark:
    return AgentMark(
        adapter=DefaultAdapter(),
        evals={n: (lambda params: params) for n in names},
    )


def _get_evals_request() -> MagicMock:
    request = MagicMock()
    request.json = AsyncMock(return_value={"type": "get-evals", "data": {}})
    return request


@pytest.mark.asyncio
@pytest.mark.parametrize("case", _CASES, ids=lambda c: c["name"])
async def test_get_evals_dispatch_matches_vector(case: dict[str, Any]) -> None:
    client = _client_with_evals(*case["evalNames"])
    handler = PydanticAIWebhookHandler(client)

    response = await _handle_webhook(_get_evals_request(), handler, client)

    assert response.status == 200
    assert json.loads(response.body) == case["expected"]


# ── dev-server / managed-dispatch drift guard ──────────────────────────────────
#
# The conformance suite pins the MANAGED dispatch's job-type set against the
# catalog. The dev server (this aiohttp `_handle_webhook`) is a separate routing
# implementation — so bind it too: every control-plane job the catalog declares
# must be answered here, and a non-catalogued type rejected. A control-plane job
# added to the managed dispatch + catalog without the dev server is caught here
# (the dev server would 400 on it instead of answering).

_CONTROL_PLANE_JOBS = [
    name
    for name, spec in json.loads(
        (_vectors_dir() / "protocol-catalog.json").read_text(encoding="utf-8")
    )["webhookJobs"].items()
    if spec["controlPlane"]
]


def _request_of_type(event_type: str) -> MagicMock:
    request = MagicMock()
    request.json = AsyncMock(return_value={"type": event_type, "data": {}})
    return request


@pytest.mark.asyncio
@pytest.mark.parametrize("job", _CONTROL_PLANE_JOBS)
async def test_dev_server_answers_every_catalogued_control_plane_job(job: str) -> None:
    client = _client_with_evals("e")
    handler = PydanticAIWebhookHandler(client)
    response = await _handle_webhook(_request_of_type(job), handler, client)
    assert response.status == 200


@pytest.mark.asyncio
async def test_dev_server_rejects_non_catalogued_job() -> None:
    assert "definitely-not-a-job" not in WEBHOOK_JOB_TYPES
    client = _client_with_evals("e")
    handler = PydanticAIWebhookHandler(client)
    response = await _handle_webhook(
        _request_of_type("definitely-not-a-job"), handler, client
    )
    assert response.status == 400
