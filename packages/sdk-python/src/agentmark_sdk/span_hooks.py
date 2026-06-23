"""AgentMark span hooks for the shared ``WebhookRunner``.

``create_agentmark_span_hooks()`` is the Python counterpart of the TypeScript
``createAgentmarkSpanHooks()`` (``@agentmark-ai/sdk``): the one call that wires a
runner so every prompt run and every experiment item is traced to AgentMark. A
bring-your-own-SDK app passes it to ``create_webhook_runner`` (which also
defaults to it when this SDK is installed), so Python BYO tracing is as
turn-key as TypeScript.

The hooks map the runner's per-call params (``ExperimentItemParams`` /
``PromptSpanParams`` from ``agentmark.prompt_core``, duck-typed here so this SDK
stays prompt-core-free) onto ``span_context``. They are intentionally identical
to the per-adapter hooks the pydantic / claude adapters define inline today —
those should adopt this single source in a follow-up so the mapping lives once.
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from typing import Any

from .trace import SpanOptions, span_context


@dataclass
class _AgentMarkSpanCtx:
    """Adapts a span context to the hook Protocol the shared runner expects:
    ``trace_id`` + ``set_attribute(key, value)``."""

    _inner: Any
    trace_id: str = ""

    def set_attribute(self, key: str, value: str) -> None:
        with suppress(Exception):
            self._inner.set_attribute(key, value)


@asynccontextmanager
async def _item_span(params: Any) -> Any:
    """Per-item experiment span: maps the runner's params → SpanOptions."""
    dataset_expected = (
        json.dumps(params.dataset_expected_output)
        if params.dataset_expected_output is not None
        else None
    )
    dataset_input_json = (
        json.dumps(params.dataset_input, default=str)
        if params.dataset_input is not None
        else None
    )
    options = SpanOptions(
        name=f"experiment-{params.dataset_run_name}-{params.index}",
        prompt_name=params.prompt_name,
        dataset_run_id=params.experiment_run_id,
        dataset_run_name=params.dataset_run_name,
        dataset_item_name=params.dataset_item_name,
        dataset_expected_output=dataset_expected,
        dataset_input=dataset_input_json,
        dataset_path=params.dataset_path,
        prompt_path=getattr(params, "prompt_path", None),
        metadata={"commit_sha": params.commit_sha} if params.commit_sha else None,
    )
    async with span_context(options) as ctx:
        yield _AgentMarkSpanCtx(_inner=ctx, trace_id=ctx.trace_id)


@asynccontextmanager
async def _prompt_span(params: Any) -> Any:
    """Prompt-level span for a single run.

    ``commit_sha`` (the version the prompt content was served at) is read via
    ``getattr`` so the hook stays duck-typed against older prompt-core
    ``PromptSpanParams`` that predate the field. It rides the same
    ``metadata.commit_sha`` key the experiment item hook emits, so the
    normalizer promotes it to the trace's CommitSha on regular runs too.
    """
    commit_sha = getattr(params, "commit_sha", None)
    options = SpanOptions(
        name=params.name,
        prompt_name=params.prompt_name,
        prompt_path=getattr(params, "prompt_path", None),
        metadata={"commit_sha": commit_sha} if commit_sha else None,
    )
    async with span_context(options) as ctx:
        yield _AgentMarkSpanCtx(_inner=ctx, trace_id=ctx.trace_id)


def create_agentmark_span_hooks() -> dict[str, Any]:
    """Return ``{"prompt_span_hook", "item_span_hook"}`` for a ``WebhookRunner`` —
    every run and experiment item traced to AgentMark. Mirrors the TS
    ``createAgentmarkSpanHooks()``."""
    return {"prompt_span_hook": _prompt_span, "item_span_hook": _item_span}
