"""Shared control-plane contract for AgentMark webhook adapters.

Control-plane webhook jobs (currently ``get-evals``) answer the dashboard's
questions *about* a deployed app — e.g. "which evals can I run in a new
experiment?" — rather than executing a prompt. The logic lives here once,
sourced from the AgentMark client (the eval-registry owner), so every adapter
— built-in or customer-authored — answers identically and never reimplements
it. The shared webhook dispatch depends on the ``ControlPlaneClient``
abstraction, not on any concrete adapter (DIP).

This is the Python half of a cross-language contract. The TypeScript half lives
in ``@agentmark-ai/prompt-core`` (``src/control-plane.ts``). Keep the two in
lock-step:

* ``ControlPlaneClient.get_eval_names()`` ⇔ ``ControlPlaneClient.getEvalNames()``
* ``build_evals_response()`` ⇔ ``buildEvalsResponse()``
* the wire shape ``{"type": "evals", "result": <json string>, "traceId": ""}``
  is byte-for-byte identical in both languages.
"""

from __future__ import annotations

import json
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class ControlPlaneClient(Protocol):
    """Client capability the control-plane dispatch depends on.

    ``AgentMark`` satisfies this structurally. A custom client only needs
    ``get_eval_names()`` to participate in the ``get-evals`` webhook job.
    """

    def get_eval_names(self) -> list[str]:
        """Return the names of the registered evals."""
        ...


def build_evals_response(client: ControlPlaneClient) -> dict[str, Any]:
    """Wire payload for the ``get-evals`` webhook job.

    The single source of truth for the shape the dashboard's evals route
    parses: ``{"type": "evals", "result": "<json array of names>",
    "traceId": ""}``.

    Names are **sorted** here so order is deterministic and identical across
    languages — never relying on registry/insertion order, which JS reorders
    for integer-like keys (``Object.keys`` puts ``"10"`` before ``"a"``).

    ``result`` is serialized to be **byte-identical** to TypeScript's
    ``JSON.stringify``: compact separators (``["a","b"]``, no spaces) and
    ``ensure_ascii=False`` so non-ASCII names stay raw UTF-8 (``"café"``, not
    ``"caf\\u00e9"``) the way ``JSON.stringify`` emits them. Both invariants are
    pinned by the shared ``conformance-vectors/control-plane.json`` golden cases.
    """
    names = sorted(client.get_eval_names())
    return {
        "type": "evals",
        "result": json.dumps(names, separators=(",", ":"), ensure_ascii=False),
        "traceId": "",
    }
