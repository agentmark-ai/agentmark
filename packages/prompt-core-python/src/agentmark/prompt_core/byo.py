"""BYO-SDK convenience builder: an Executor → a ready-to-dispatch WebhookRunner.

Mirror of the TypeScript ``createWebhookRunner`` (``@agentmark-ai/sdk``).
Collapses the client + neutral adapter + runner wiring to one call and —
critically — threads ``evals`` into the client, so the runner BOTH runs evals
during experiments AND lists them for the dashboard's New Experiment dialog (the
``get-evals`` control-plane job). The absence of an ``evals`` input on the BYO
path was exactly why custom-SDK apps silently showed *"No evals available"* — a
runner has nowhere to source the registry from.

    runner = create_webhook_runner(my_executor, loader=loader, evals=my_evals)
    # the deployed managed handler is just:  handler = runner.dispatch

Tracing: defaults to AgentMark SDK tracing when ``agentmark_sdk`` is installed
(via its ``create_agentmark_span_hooks``), mirroring the TS
``createWebhookRunner``. Explicit ``prompt_span_hook`` / ``item_span_hook`` win;
without the SDK you simply get no default tracing. The SDK import is lazy and
optional, so prompt-core stays lower-level than (and SDK-free of) the SDK.
"""

from __future__ import annotations

from contextlib import suppress
from typing import TYPE_CHECKING

from .agentmark import create_agentmark
from .webhook_runner import WebhookRunner

if TYPE_CHECKING:
    from .eval_registry import EvalRegistry
    from .executor import Executor
    from .types import Loader
    from .webhook_runner import ExperimentItemSpanHook, PromptSpanHook


def create_webhook_runner(
    executor: Executor,
    *,
    loader: Loader | None = None,
    evals: EvalRegistry | None = None,
    prompt_span_hook: PromptSpanHook | None = None,
    item_span_hook: ExperimentItemSpanHook | None = None,
) -> WebhookRunner:
    """Build a ready-to-serve :class:`WebhookRunner` from a BYO ``Executor``,
    wired with the neutral ``DefaultAdapter`` and the given ``evals``.

    The returned runner exposes ``dispatch`` (and ``run_prompt`` /
    ``run_experiment``) — exactly the shape the CLI dev server and the gateway
    dispatch expect. ``register evals once`` → they list AND run.
    """
    if prompt_span_hook is None and item_span_hook is None:
        # Default to AgentMark SDK tracing when the SDK is installed — mirrors the
        # TS createWebhookRunner default. Lazy + optional: prompt-core never hard-
        # depends on the SDK, so without it you just get no default tracing. The
        # guard is narrow on purpose — only a missing/too-old SDK (the import) is
        # swallowed; a real error from create_agentmark_span_hooks() (which runs
        # only after a successful import) surfaces instead of vanishing.
        with suppress(ImportError, ModuleNotFoundError):
            from agentmark_sdk import create_agentmark_span_hooks

            hooks = create_agentmark_span_hooks()
            prompt_span_hook = hooks["prompt_span_hook"]
            item_span_hook = hooks["item_span_hook"]

    client = create_agentmark(
        loader=loader,
        evals=evals,
    )
    return WebhookRunner(
        client,
        executor,
        prompt_span_hook=prompt_span_hook,
        item_span_hook=item_span_hook,
    )
