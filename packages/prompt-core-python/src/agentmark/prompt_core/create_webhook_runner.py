"""One-call webhook-runner wiring: your client + an Executor → a ready-to-dispatch WebhookRunner.

Mirror of the TypeScript ``createWebhookRunner``. Wraps
``WebhookRunner(client, executor, ...)`` and defaults the span hooks to
AgentMark tracing. The runner sources BOTH the prompt loader and the eval
registry from the ``client`` you pass — register them exactly once, on
:func:`create_agentmark`:

    client = create_agentmark(loader=loader, scorers=my_scorers)
    runner = create_webhook_runner(client, my_executor)
    # the deployed managed handler is just:  handler = runner.dispatch

There is deliberately no ``loader``/``evals`` input: a second registration
point is how apps ended up with a runner whose client drifted from the one
their app loaded prompts with (the *"No evals available"* class of bug).

Tracing: defaults to AgentMark SDK tracing when ``agentmark_sdk`` is installed
(via its ``create_agentmark_span_hooks``), mirroring the TS
``createWebhookRunner`` from ``@agentmark-ai/sdk``. Explicit
``prompt_span_hook`` / ``item_span_hook`` win; without the SDK you simply get
no default tracing. The SDK import is lazy and optional, so prompt-core stays
lower-level than (and SDK-free of) the SDK.
"""

from __future__ import annotations

from contextlib import suppress
from typing import TYPE_CHECKING

from .agentmark import AgentMark
from .webhook_runner import WebhookRunner

if TYPE_CHECKING:
    from .executor import Executor
    from .webhook_runner import ExperimentItemSpanHook, PromptSpanHook


def create_webhook_runner(
    client: AgentMark,
    executor: Executor,
    *,
    prompt_span_hook: PromptSpanHook | None = None,
    item_span_hook: ExperimentItemSpanHook | None = None,
) -> WebhookRunner:
    """Build a ready-to-serve :class:`WebhookRunner` from your client + a custom
    ``Executor``, wired with AgentMark span hooks by default.

    ``create_webhook_runner(client, executor)`` — loader and evals come from
    the client; register them once, on :func:`create_agentmark`.
    """
    if not isinstance(client, AgentMark):
        raise TypeError(
            "create_webhook_runner: the first argument must be your AgentMark "
            "client (from create_agentmark); the executor is the second argument."
        )

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

    return WebhookRunner(
        client,
        executor,
        prompt_span_hook=prompt_span_hook,
        item_span_hook=item_span_hook,
    )
