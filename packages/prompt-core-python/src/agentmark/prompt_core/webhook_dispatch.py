"""Shared dispatch for AgentMark **managed-deployment** handlers.

A managed AgentMark app (Cloud code deploy) exposes a single async
``handler(event)`` entry point. The builder wraps it in an HTTP server
(``_agentmark_server.py``) that POSTs each ``{type, data}`` job from the
gateway to ``/execute`` and returns the handler's result verbatim. Every
handler therefore has to route three job types — ``prompt-run``,
``dataset-run``, and the control-plane ``get-evals`` — and the one that bites
people is ``get-evals``: a hand-rolled handler that only knows ``prompt-run`` /
``dataset-run`` raises on it, the server 500s, and the dashboard's New
Experiment dialog shows *"No evals available"* even though the app registered
evals.

``handle_webhook_request`` is that routing, written once so a handler never
hand-rolls it (and never silently drops a control-plane job). It mirrors the
TypeScript ``handleWebhookRequest`` (``@agentmark-ai/prompt-core``) — the
canonical managed handler is the same one-liner in both languages:

    async def handler(event):
        return await handle_webhook_request(event, webhook, client)

**Return contract — FLAT results, not an envelope.** Unlike the TS
``handleWebhookRequest`` (which returns a ``{type:'json'|'stream'}`` envelope
that the CLI dev server unwraps via ``res.json(result.data)``), the Python
managed server consumes the handler result *directly*: it stream-detects a
``stream`` attribute/key and otherwise ``JSONResponse(result)``. So this helper
returns exactly what the underlying handler methods return —

  * ``get-evals``   → the flat ``{type:'evals', result, traceId}`` payload the
    dashboard's evals route parses (sourced from the client's eval registry via
    the shared ``build_evals_response`` — the SAME wire contract every adapter
    dev server emits, pinned by ``conformance-vectors/control-plane.json``).
  * ``prompt-run``  → ``handler.run_prompt(...)`` result (dict / stream dict).
  * ``dataset-run`` → ``handler.run_experiment(...)`` result (stream dict).

— with no envelope wrapping, because the managed server expects flat results
(see ``apps/builder/src/services/python-server-generator.ts``).
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from .control_plane import ControlPlaneClient, build_evals_response

# The complete set of webhook job types this dispatch routes — the Python half
# of a cross-language contract. The TS ``WebhookRequest['type']`` union is the
# other half, and ``conformance-vectors/protocol-catalog.json#webhookJobs`` is
# the normative bridge: both languages assert THIS set equals the catalog's
# keys, so a job type added to one language (or the catalog) without the other
# fails the other's suite. That is what stops the dispatch contract from
# drifting — the exact gap that let ``get-evals`` ship to the dev server but not
# the managed handler. Adding a member is a protocol change: update the catalog
# and BOTH languages in lock-step.
WEBHOOK_JOB_TYPES: frozenset[str] = frozenset(
    {"prompt-run", "dataset-run", "get-evals"}
)


@runtime_checkable
class WebhookHandler(Protocol):
    """The execution surface this dispatch routes to — satisfied structurally
    by every adapter's webhook handler (pydantic, claude-agent-sdk, …).

    Only ``run_prompt`` / ``run_experiment`` are required. ``client`` is
    optional: when present (adapters expose the client they were built from),
    ``get-evals`` works with no extra wiring even if the caller doesn't pass a
    client explicitly — mirroring the TS ``WebhookHandler.client`` fallback.
    """

    async def run_prompt(
        self, prompt_ast: dict[str, Any], options: dict[str, Any] | None = ...
    ) -> Any: ...

    async def run_experiment(
        self,
        prompt_ast: dict[str, Any],
        dataset_run_name: str,
        dataset_path: str | None = ...,
        sampling: dict[str, Any] | None = ...,
        commit_sha: str | None = ...,
        prompt_path: str | None = ...,
        concurrency: int | None = ...,
    ) -> Any: ...


class _NoEvalsClient:
    """Fallback ``ControlPlaneClient`` when no client is available — degrades
    ``get-evals`` to an empty list rather than erroring, so the envelope shape
    stays correct (mirrors TS ``buildEvalsResponse(cp ?? {getEvalNames: () => []})``)."""

    def get_eval_names(self) -> list[str]:
        return []


async def handle_webhook_request(
    event: dict[str, Any],
    handler: WebhookHandler,
    client: ControlPlaneClient | None = None,
) -> Any:
    """Route one managed-deployment webhook ``event`` to a flat result.

    Args:
        event: The ``{type, data}`` job from the gateway.
        handler: The adapter webhook handler (``run_prompt`` / ``run_experiment``).
        client: The AgentMark client — the eval-registry owner — used to answer
            ``get-evals``. Optional: falls back to ``handler.client`` when the
            adapter surfaces it, then to an empty eval list.

    Returns:
        The flat handler result (see module docstring). ``get-evals`` returns the
        ``{type:'evals', …}`` payload; ``prompt-run`` / ``dataset-run`` return
        the handler's own result.

    Raises:
        ValueError: on an unknown ``type`` (the managed server turns this into a
            500, same as a hand-rolled handler's ``raise``).
    """
    event_type = event.get("type")
    data = event.get("data") or {}

    # Gate on the declared contract first, so the accepted set and the routing
    # below can never silently diverge: a branch added without updating
    # WEBHOOK_JOB_TYPES (or vice versa) is caught by the conformance suite.
    if event_type not in WEBHOOK_JOB_TYPES:
        raise ValueError(f"Unknown event type: {event_type}")

    # Control-plane job: carries no AST, so it short-circuits ahead of the
    # execution branches. Names come from the client (the eval-registry owner),
    # never the handler — so this answer is byte-identical to every adapter's
    # dev server.
    if event_type == "get-evals":
        cp = client if client is not None else getattr(handler, "client", None)
        return build_evals_response(cp if cp is not None else _NoEvalsClient())

    if event_type == "prompt-run":
        options = {
            "shouldStream": (data.get("options") or {}).get("shouldStream", True),
            "customProps": data.get("customProps"),
            # Folder-aware prompt path (when supplied) → echoed onto the span as
            # ``agentmark.prompt_path``. The flat ``name`` collides across folders.
            "promptPath": data.get("promptPath"),
        }
        return await handler.run_prompt(data["ast"], options)

    if event_type == "dataset-run":
        # commit_sha / concurrency are keyword args: the WebhookRunner makes them
        # keyword-only, and the adapter handlers accept them by name too. Passing
        # them positionally works against the looser adapter signature but breaks
        # against the runner — so a runner could never be dispatched. Keyword
        # calling is the one form compatible with every handler shape.
        return await handler.run_experiment(
            data["ast"],
            data.get("experimentId", "experiment"),
            data.get("datasetPath"),
            data.get("sampling"),
            commit_sha=data.get("commitSha"),
            prompt_path=data.get("promptPath"),
            concurrency=data.get("concurrency"),
        )

    # Unreachable: the gate above admits only WEBHOOK_JOB_TYPES, and every
    # member is routed. If this fires, a job type was added to the set without
    # a branch — a contract/impl mismatch the conformance suite is meant to
    # catch first.
    raise AssertionError(  # pragma: no cover
        f"job type {event_type!r} is in WEBHOOK_JOB_TYPES but has no route"
    )
