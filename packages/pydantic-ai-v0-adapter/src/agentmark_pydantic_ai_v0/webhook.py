"""Webhook handler for executing AgentMark prompts with Pydantic AI.

This module provides PydanticAIWebhookHandler, which implements the
AgentMark webhook protocol for executing prompts via HTTP. It mirrors
TypeScript's VercelAdapterWebhookHandler for Python/Pydantic AI.

Example:
    from agentmark_pydantic_ai_v0 import create_pydantic_ai_client
    from agentmark_pydantic_ai_v0.webhook import PydanticAIWebhookHandler

    client = create_pydantic_ai_client()
    handler = PydanticAIWebhookHandler(client)

    # Execute a prompt
    result = await handler.run_prompt(prompt_ast, {"shouldStream": False})

    # Run an experiment across a dataset
    result = await handler.run_experiment(prompt_ast, "my-experiment")
    async for chunk in result["stream"]:
        print(chunk)
"""

from __future__ import annotations

import asyncio
import inspect
import json
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from typing import Any

from agentmark.prompt_core import (
    AgentMark,
    ExperimentItemParams,
    PromptSpanParams,
    WebhookRunner,
)
from agentmark.prompt_core.types import EvalFunction, EvalParams

from .executor import PydanticAIExecutor


@dataclass
class _PydanticSpanCtx:
    """Adapts agentmark_sdk's span context to the Protocol the shared
    WebhookRunner expects: trace_id + set_attribute(k, v)."""

    _inner: Any
    trace_id: str = ""

    def set_attribute(self, key: str, value: str) -> None:
        with suppress(Exception):
            self._inner.set_attribute(key, value)


@asynccontextmanager
async def _pydantic_item_span(params: ExperimentItemParams):
    """Per-item span hook. Builds agentmark_sdk SpanOptions from the
    runner-provided params and yields a _PydanticSpanCtx. The runner owns
    `dataset_item_name` hashing + `agentmark.props`/`agentmark.output`
    recording; this hook only threads SpanOptions into the SDK."""
    from agentmark_sdk import SpanOptions, span_context

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
        metadata={"commit_sha": params.commit_sha} if params.commit_sha else None,
    )
    async with span_context(options) as ctx:
        wrapper = _PydanticSpanCtx(_inner=ctx, trace_id=ctx.trace_id)
        yield wrapper


@asynccontextmanager
async def _pydantic_prompt_span(params: PromptSpanParams):
    """Prompt-level span hook for shared WebhookRunner prompt executions."""
    from agentmark_sdk import SpanOptions, span_context

    options = SpanOptions(
        name=params.name,
        prompt_name=params.prompt_name,
        metadata=(
            {"commit_sha": params.commit_sha} if params.commit_sha else None
        ),
    )
    async with span_context(options) as ctx:
        yield _PydanticSpanCtx(_inner=ctx, trace_id=ctx.trace_id)


class PydanticAIWebhookHandler:
    """Webhook handler implementing the AgentMark webhook protocol.

    Mirrors TypeScript's VercelAdapterWebhookHandler for Python/Pydantic AI.
    Supports text prompts, object prompts (structured output), streaming,
    and experiment/dataset runs.

    Example:
        client = create_pydantic_ai_client()
        handler = PydanticAIWebhookHandler(client)

        # Run a prompt
        result = await handler.run_prompt(ast, {"customProps": {"name": "Alice"}})
        print(result["result"])

        # Run an experiment
        result = await handler.run_experiment(ast, "experiment-1")
        async for chunk in result["stream"]:
            print(chunk)
    """

    def __init__(self, client: AgentMark) -> None:
        """Initialize the handler with an AgentMark client.

        Args:
            client: An AgentMark client configured with PydanticAIAdapter.
        """
        self._client = client
        self._executor = PydanticAIExecutor()
        # Both span hooks bundled at construction so the runner alone can
        # `dispatch` — including experiments with rich per-item tracing — with no
        # per-call hook threading.
        self._runner: WebhookRunner = WebhookRunner(
            client,
            self._executor,
            prompt_span_hook=_pydantic_prompt_span,
            item_span_hook=_pydantic_item_span,
        )

    @property
    def client(self) -> AgentMark:
        """The AgentMark client this handler executes against — the eval-registry
        owner. Sourced from the runner (the single owner) so the handler and its
        runner can't disagree; surfaced so the shared dispatch answers the
        ``get-evals`` control-plane job with no extra wiring."""
        return self._runner.client

    async def dispatch(self, event: dict[str, Any]) -> Any:
        """Route a managed-deployment webhook job through the shared runner. The
        canonical deployed handler is ``handler = PydanticAIWebhookHandler(client)``
        + ``handler.dispatch`` — identical routing to every other adapter, no
        per-adapter dispatch code. Equivalent to ``runner.dispatch``."""
        return await self._runner.dispatch(event)

    async def run_prompt(
        self,
        prompt_ast: dict[str, Any],
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute a prompt and return the result.

        Delegates to the shared WebhookRunner via PydanticAIExecutor.
        Back-compat: same dict shape as before — {type,result,usage,
        finishReason,toolCalls,toolResults} for text; {type,result,usage,
        finishReason} for object; {type:"stream",stream} for streaming.
        """
        return await self._runner.run_prompt(prompt_ast, options)

    async def _run_eval(
        self,
        eval_fn: EvalFunction,
        eval_name: str,
        input_data: Any,
        output: Any,
        expected_output: Any | None,
    ) -> dict[str, Any]:
        """Execute a single eval function and return its result dict.

        Kept as an instance method so the test suite can exercise it in
        isolation. The shared WebhookRunner runs evals internally via
        its own path for run_prompt and run_experiment; this helper is
        retained for backwards-compat + unit testing.
        """
        params: EvalParams = {
            "input": input_data,
            "output": output,
            "expectedOutput": expected_output,
        }
        if inspect.iscoroutinefunction(eval_fn):
            result = await eval_fn(params)
        else:
            result = eval_fn(params)
        return {"name": eval_name, **result}

    async def _execute_evals(
        self,
        eval_names: list[str],
        input_data: Any,
        output: Any,
        expected_output: Any | None,
    ) -> list[dict[str, Any]]:
        """Run multiple evals in parallel and return their results."""
        eval_registry = self._client.eval_registry
        if not eval_registry or not eval_names:
            return []

        evaluators: list[tuple[str, EvalFunction]] = []
        for eval_name in eval_names:
            eval_fn = eval_registry.get(eval_name)
            if eval_fn:
                evaluators.append((eval_name, eval_fn))
        if not evaluators:
            return []

        eval_results = await asyncio.gather(
            *(
                self._run_eval(
                    fn,
                    name,
                    input_data=input_data,
                    output=output,
                    expected_output=expected_output,
                )
                for name, fn in evaluators
            )
        )
        return list(eval_results)

    async def run_experiment(
        self,
        prompt_ast: dict[str, Any],
        dataset_run_name: str,
        dataset_path: str | None = None,
        sampling: dict[str, Any] | None = None,
        commit_sha: str | None = None,
        concurrency: int | None = None,
    ) -> dict[str, Any]:
        """Run an experiment across a dataset.

        Delegates to the shared WebhookRunner, passing a per-item span hook
        that wraps each item in an agentmark_sdk span_context. The hook
        threads SpanOptions (dataset_run_id, dataset_item_name,
        dataset_input, dataset_expected_output, dataset_path, commit_sha)
        per item so the Experiments tab sees rich per-row tracing, same
        as before the WebhookRunner flip.

        Returns the canonical {stream, streamHeaders} dict; per-item wire
        chunks are {type:'dataset', result:{input,expectedOutput,
        actualOutput,tokens,evals}, runId, runName, traceId}.
        """
        return await self._runner.run_experiment(
            prompt_ast,
            dataset_run_name,
            dataset_path,
            sampling,
            commit_sha=commit_sha,
            concurrency=concurrency,
        )
