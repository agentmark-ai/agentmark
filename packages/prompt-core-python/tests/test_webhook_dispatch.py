"""Managed-deployment dispatch — ``handle_webhook_request``.

This is the surface that broke: a Cloud-deployed Python app routes every
gateway job through its ``handler(event)``, and a hand-rolled handler that only
knew ``prompt-run`` / ``dataset-run`` raised on the dashboard's ``get-evals``
control-plane job — so the New Experiment dialog showed *"No evals available"*
even though the app registered evals. ``handle_webhook_request`` is the shared
routing that fixes it; this suite pins every branch.

The ``get-evals`` cases assert against the SAME
``conformance-vectors/control-plane.json`` the dev-server dispatch and the TS
side use — so the managed surface can't drift from the cross-language wire
contract. Drift/regression coverage is demonstrated red→green in the PR.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from agentmark.prompt_core import (
    WEBHOOK_JOB_TYPES,
    AgentMark,
    DefaultAdapter,
    create_agentmark,
    create_webhook_runner,
    handle_webhook_request,
)
from agentmark.prompt_core.executor_builder import create_executor
from agentmark.prompt_core.webhook_runner import WebhookRunner


def _vectors_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "conformance-vectors" / "vectors"


_CONTROL_PLANE_CASES = json.loads(
    (_vectors_dir() / "control-plane.json").read_text(encoding="utf-8")
)["cases"]


class _StubClient:
    """Minimal ControlPlaneClient — only the contract method the dispatch needs."""

    def __init__(self, names: list[str]) -> None:
        self._names = names

    def get_eval_names(self) -> list[str]:
        return self._names


class _RecordingHandler:
    """Stand-in adapter webhook handler: records the call so a delegation test
    can assert the dispatch forwarded the right args, and exposes ``client`` (the
    zero-config ``get-evals`` source) when one is supplied."""

    def __init__(self, client: Any = None) -> None:
        self._client = client
        self.calls: list[tuple[Any, ...]] = []

    @property
    def client(self) -> Any:
        return self._client

    async def run_prompt(
        self, prompt_ast: dict[str, Any], options: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        self.calls.append(("run_prompt", prompt_ast, options))
        return {"type": "object", "result": {"ok": True}}

    async def run_experiment(
        self,
        prompt_ast: dict[str, Any],
        dataset_run_name: str,
        dataset_path: str | None = None,
        sampling: dict[str, Any] | None = None,
        *,
        commit_sha: str | None = None,
        prompt_path: str | None = None,
        concurrency: int | None = None,
    ) -> dict[str, Any]:
        self.calls.append(
            (
                "run_experiment",
                prompt_ast,
                dataset_run_name,
                dataset_path,
                sampling,
                commit_sha,
                prompt_path,
                concurrency,
            )
        )
        return {"stream": object(), "streamHeaders": {}}


# ── get-evals (the control-plane job that regressed) ───────────────────────────


@pytest.mark.parametrize(
    "case", _CONTROL_PLANE_CASES, ids=lambda c: c["name"]
)
async def test_get_evals_payload_matches_control_plane_vector(case: dict[str, Any]) -> None:
    # The managed handler's get-evals answer is byte-identical to the shared
    # cross-language vector — sourced from the client, never the handler.
    result = await handle_webhook_request(
        {"type": "get-evals", "data": {}},
        _RecordingHandler(),
        client=_StubClient(case["evalNames"]),
    )
    assert result == case["expected"]


async def test_get_evals_sources_from_handler_client_when_no_explicit_client() -> None:
    # Zero-config: when the caller passes no client, the dispatch falls back to
    # handler.client (the adapter exposes it). This is what the canonical one-
    # liner relies on, and mirrors the TS `client ?? handler.client`.
    handler = _RecordingHandler(client=_StubClient(["b", "a"]))
    result = await handle_webhook_request({"type": "get-evals", "data": {}}, handler)
    assert result == {"type": "evals", "result": '["a","b"]', "traceId": ""}


async def test_explicit_client_overrides_handler_client() -> None:
    handler = _RecordingHandler(client=_StubClient(["from_handler"]))
    result = await handle_webhook_request(
        {"type": "get-evals", "data": {}}, handler, client=_StubClient(["from_caller"])
    )
    assert result == {"type": "evals", "result": '["from_caller"]', "traceId": ""}


async def test_get_evals_with_no_client_anywhere_degrades_to_empty_list() -> None:
    # No explicit client and the handler exposes none → empty list, never an
    # error: the dialog shows "no evals" rather than a 500.
    result = await handle_webhook_request(
        {"type": "get-evals", "data": {}}, _RecordingHandler()
    )
    assert result == {"type": "evals", "result": "[]", "traceId": ""}


async def test_get_evals_does_not_require_an_ast() -> None:
    # The control-plane job carries no AST. A dispatch that touched data["ast"]
    # before routing get-evals (or that fell through to the AST branches) would
    # KeyError here. It must not.
    handler = _RecordingHandler(client=_StubClient(["only_eval"]))
    result = await handle_webhook_request({"type": "get-evals"}, handler)
    assert result == {"type": "evals", "result": '["only_eval"]', "traceId": ""}
    assert handler.calls == []  # never touched run_prompt/run_experiment


# ── prompt-run / dataset-run delegation ────────────────────────────────────────


async def test_prompt_run_delegates_with_normalized_options() -> None:
    handler = _RecordingHandler()
    ast = {"name": "p"}
    await handle_webhook_request(
        {
            "type": "prompt-run",
            "data": {
                "ast": ast,
                "customProps": {"x": 1},
                "promptPath": "agentmark/p.prompt.mdx",
            },
        },
        handler,
    )
    assert handler.calls == [
        (
            "run_prompt",
            ast,
            {
                "shouldStream": True,
                "customProps": {"x": 1},
                "promptPath": "agentmark/p.prompt.mdx",
            },
        )
    ]


async def test_prompt_run_threads_should_stream_false() -> None:
    handler = _RecordingHandler()
    await handle_webhook_request(
        {
            "type": "prompt-run",
            "data": {"ast": {"name": "p"}, "options": {"shouldStream": False}},
        },
        handler,
    )
    assert handler.calls[0][2] == {
        "shouldStream": False,
        "customProps": None,
        "promptPath": None,
    }


async def test_dataset_run_delegates_with_all_experiment_args() -> None:
    handler = _RecordingHandler()
    ast = {"name": "p"}
    await handle_webhook_request(
        {
            "type": "dataset-run",
            "data": {
                "ast": ast,
                "experimentId": "exp-1",
                "datasetPath": "data/qa.jsonl",
                "sampling": {"percent": 20},
                "commitSha": "abc123",
                "promptPath": "agentmark/qa/eval.prompt.mdx",
                "concurrency": 5,
            },
        },
        handler,
    )
    # Positional parity with the adapter dev server — sampling/commit/promptPath/
    # concurrency must be forwarded, not dropped (the old hand-rolled handler
    # dropped them).
    assert handler.calls == [
        (
            "run_experiment",
            ast,
            "exp-1",
            "data/qa.jsonl",
            {"percent": 20},
            "abc123",
            "agentmark/qa/eval.prompt.mdx",
            5,
        )
    ]


# ── unknown / contract ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("bad", ["bogus", "", None])
async def test_unknown_or_missing_type_raises(bad: Any) -> None:
    event = {} if bad is None else {"type": bad, "data": {}}
    with pytest.raises(ValueError, match="Unknown event type"):
        await handle_webhook_request(event, _RecordingHandler())


def test_get_evals_is_a_declared_job_type() -> None:
    # The job that regressed must be in the declared contract set.
    assert "get-evals" in WEBHOOK_JOB_TYPES


# ── runner.dispatch — the canonical managed surface (the root fix) ──────────────
#
# A WebhookRunner sources get-evals from its OWN client, and `handler =
# runner.dispatch` has no client argument to omit — so the eval registry cannot
# be dropped on the way to the control plane. This is the surface a deployed app
# actually runs; testing it here is what the original bug lacked.


def _runner_with_evals(*names: str) -> WebhookRunner:
    executor = create_executor(
        name="noop",
        text=lambda formatted, ctx: {"text": "x", "usage": {"inputTokens": 1, "outputTokens": 1}},
    )
    client = AgentMark(
        adapter=DefaultAdapter(),
        evals={n: (lambda params: params) for n in names},
    )
    return WebhookRunner(client, executor)


async def test_runner_dispatch_get_evals_from_own_registry() -> None:
    runner = _runner_with_evals("lot_count", "lot_url_pattern")
    result = await runner.dispatch({"type": "get-evals", "data": {}})
    assert result == {
        "type": "evals",
        "result": '["lot_count","lot_url_pattern"]',
        "traceId": "",
    }


async def test_runner_satisfies_control_plane_contract() -> None:
    # A runner can be passed straight to handle_webhook_request with no client
    # arg — it answers get-evals from runner.client via get_eval_names().
    runner = _runner_with_evals("only_eval")
    assert runner.get_eval_names() == ["only_eval"]
    result = await handle_webhook_request({"type": "get-evals", "data": {}}, runner)
    assert result["result"] == '["only_eval"]'


async def test_runner_dispatch_rejects_unknown_job() -> None:
    runner = _runner_with_evals("e")
    with pytest.raises(ValueError, match="Unknown event type"):
        await runner.dispatch({"type": "nope", "data": {}})


# ── create_webhook_runner sources evals from the client ───────────────────────
#
# A custom-SDK app registers loader/evals ONCE, on create_agentmark, and hands
# that client to create_webhook_runner. The runner must source its eval
# registry from the client — a second registration point is how runners ended
# up with an empty New Experiment dialog while the app "had" evals.


def _noop_executor() -> object:
    return create_executor(
        name="noop",
        text=lambda formatted, ctx: {"text": "x", "usage": {"inputTokens": 1, "outputTokens": 1}},
    )


async def test_create_webhook_runner_lists_client_evals_for_get_evals() -> None:
    client = create_agentmark(evals={"acc": lambda p: p, "safety": lambda p: p})
    runner = create_webhook_runner(client, _noop_executor())
    result = await runner.dispatch({"type": "get-evals", "data": {}})
    assert result == {"type": "evals", "result": '["acc","safety"]', "traceId": ""}


async def test_create_webhook_runner_without_client_evals_lists_none() -> None:
    runner = create_webhook_runner(create_agentmark(), _noop_executor())
    result = await runner.dispatch({"type": "get-evals", "data": {}})
    assert result["result"] == "[]"


async def test_create_webhook_runner_executor_first_raises_type_error() -> None:
    # The legacy executor-first signature was removed — passing the executor
    # as the first argument gets a clear TypeError naming the fix, not an
    # AttributeError from deep inside the runner.
    with pytest.raises(TypeError, match="first argument must be your AgentMark"):
        create_webhook_runner(_noop_executor(), _noop_executor())
