"""Cross-language control-plane conformance: assert the Python
``build_evals_response`` agrees with the pinned JSON vectors in
``@agentmark-ai/conformance-vectors``.

Mirror of ``prompt-core/test/control-plane.test.ts``. Both suites read the
SAME ``control-plane.json``, so any divergence in the ``get-evals`` wire
envelope (key rename, name reordering, the ``result`` JSON-string spacing)
fails loudly in both CI runs instead of surfacing as a dashboard parse bug
for one language's users.

Also pins that the real ``AgentMark`` client satisfies the ``ControlPlaneClient``
contract (``get_eval_names`` reads its eval registry).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from agentmark.prompt_core import (
    AgentMark,
    ControlPlaneClient,
    DefaultAdapter,
    build_evals_response,
)


def _vectors_dir() -> Path:
    # prompt-core-python/tests/ → parents[2] = packages/ → sibling dir
    packages_dir = Path(__file__).resolve().parents[2]
    return packages_dir / "conformance-vectors" / "vectors"


def _load(name: str) -> dict[str, Any]:
    path = _vectors_dir() / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))


_CASES = _load("control-plane")["cases"]


class _StubClient:
    """Minimal ControlPlaneClient — only the contract method the helper needs."""

    def __init__(self, names: list[str]) -> None:
        self._names = names

    def get_eval_names(self) -> list[str]:
        return self._names


@pytest.mark.parametrize("case", _CASES, ids=lambda c: c["name"])
def test_build_evals_response_matches_vector(case: dict[str, Any]) -> None:
    client = _StubClient(case["evalNames"])
    assert build_evals_response(client) == case["expected"]


def test_result_is_byte_identical_to_js_json_stringify() -> None:
    # The dashboard JSON.parses `result`; the bytes must match TS JSON.stringify
    # exactly so the cross-language vector holds: sorted order, compact (no
    # spaces), non-ASCII left raw (ensure_ascii=False).
    assert build_evals_response(_StubClient(["b", "a"]))["result"] == '["a","b"]'
    assert build_evals_response(_StubClient(["café", "10"]))["result"] == '["10","café"]'


def test_agentmark_client_satisfies_control_plane_contract() -> None:
    # Structural check + the raw-vs-sorted split: get_eval_names is raw registry
    # order; build_evals_response canonicalizes (sorts) for the wire.
    client = AgentMark(
        adapter=DefaultAdapter(),
        evals={"safety": lambda params: params, "accuracy": lambda params: params},
    )
    assert isinstance(client, ControlPlaneClient)
    assert client.get_eval_names() == ["safety", "accuracy"]  # raw insertion order
    assert build_evals_response(client)["result"] == '["accuracy","safety"]'  # sorted


def test_agentmark_client_no_evals_yields_empty_list() -> None:
    client = AgentMark(adapter=DefaultAdapter())
    assert client.get_eval_names() == []
    assert build_evals_response(client)["result"] == "[]"
