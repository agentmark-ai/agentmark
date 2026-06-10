"""Webhook handler for Claude Agent SDK adapter.

Thin shim over the shared WebhookRunner + ClaudeAgentExecutor. Preserves
the historical WebhookResult / StreamingResult / ExperimentResult
dataclass API so downstream consumers don't break, and preserves the
unsupported-config-type short-circuit (image_config / speech_config
return a WebhookResult with an error message rather than raising).
"""

from __future__ import annotations

import json as _json
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass, field
from typing import Any

import yaml as _yaml

from agentmark.prompt_core import (
    ExperimentItemParams,
    PromptSpanParams,
    WebhookRunner,
)
from agentmark.prompt_core.template_engines import get_front_matter

from .executor import ClaudeAgentExecutor
from .traced import generate_fallback_trace_id


@dataclass
class _ClaudeAgentSpanCtx:
    """Adapts agentmark_sdk's span context to the hook Protocol shape."""

    _inner: Any
    trace_id: str = ""

    def set_attribute(self, key: str, value: str) -> None:
        with suppress(Exception):
            self._inner.set_attribute(key, value)


@asynccontextmanager
async def _claude_agent_item_span(params: ExperimentItemParams):
    """Per-item span hook: builds agentmark_sdk SpanOptions from the
    runner-provided params and yields a ctx the shared runner can annotate.
    The shared runner owns `dataset_item_name` hashing + attribute
    recording; this hook just maps params → SpanOptions."""
    from agentmark_sdk import SpanOptions, span_context

    dataset_expected = (
        _json.dumps(params.dataset_expected_output)
        if params.dataset_expected_output is not None
        else None
    )
    dataset_input_json = (
        _json.dumps(params.dataset_input, default=str)
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
        yield _ClaudeAgentSpanCtx(_inner=ctx, trace_id=ctx.trace_id)


@asynccontextmanager
async def _claude_agent_prompt_span(params: PromptSpanParams):
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
        yield _ClaudeAgentSpanCtx(_inner=ctx, trace_id=ctx.trace_id)


@dataclass
class WebhookResult:
    """Result from running a prompt (non-streaming)."""

    type: str
    result: Any
    usage: dict[str, int]
    finish_reason: str
    trace_id: str


@dataclass
class StreamingResult:
    """Result from running a streaming prompt."""

    type: str = "stream"
    stream: AsyncIterator[str] | AsyncGenerator[bytes, None] | None = None
    stream_header: dict[str, str] = field(
        default_factory=lambda: {"AgentMark-Streaming": "true"}
    )
    trace_id: str = ""


@dataclass
class ExperimentResult:
    """Result from running an experiment."""

    stream: AsyncIterator[str] | AsyncGenerator[bytes, None] | None = None
    stream_headers: dict[str, str] = field(
        default_factory=lambda: {"AgentMark-Streaming": "true"}
    )


_UNSUPPORTED_USAGE = {"promptTokens": 0, "completionTokens": 0, "totalTokens": 0}


def _normalize_usage(raw: dict[str, Any] | None) -> dict[str, int]:
    if not raw:
        return dict(_UNSUPPORTED_USAGE)
    pt = raw.get("promptTokens")
    if pt is None:
        pt = raw.get("inputTokens", 0) or 0
    ct = raw.get("completionTokens")
    if ct is None:
        ct = raw.get("outputTokens", 0) or 0
    total = raw.get("totalTokens")
    if total is None:
        total = (pt or 0) + (ct or 0)
    return {
        "promptTokens": int(pt or 0),
        "completionTokens": int(ct or 0),
        "totalTokens": int(total or 0),
    }


def _kind_for_frontmatter(frontmatter: dict[str, Any]) -> str:
    return "object" if "object_config" in frontmatter else "text"


def _ensure_ast_has_frontmatter(
    prompt_ast: dict[str, Any], frontmatter: dict[str, Any]
) -> dict[str, Any]:
    """Return an AST whose `get_front_matter` view matches `frontmatter`."""
    try:
        existing = get_front_matter(prompt_ast) or {}
    except Exception:
        existing = {}
    if existing == frontmatter:
        return prompt_ast
    yaml_value = _yaml.safe_dump(frontmatter, sort_keys=False)
    children = list(prompt_ast.get("children") or [])
    new_children: list[Any] = []
    replaced = False
    for child in children:
        if isinstance(child, dict) and child.get("type") == "yaml":
            new_children.append({"type": "yaml", "value": yaml_value})
            replaced = True
        else:
            new_children.append(child)
    if not replaced:
        new_children.insert(0, {"type": "yaml", "value": yaml_value})
    return {**prompt_ast, "children": new_children}


class ClaudeAgentWebhookHandler:
    """Webhook handler for Claude Agent SDK adapter.

    Internally delegates to the shared WebhookRunner with a
    ClaudeAgentExecutor. Historical dataclass return types preserved.
    """

    def __init__(
        self,
        client: Any,
        *,
        mcp_servers: dict[str, Any] | None = None,
    ) -> None:
        self._client = client
        self._default_mcp_servers = mcp_servers or {}
        self._executor = ClaudeAgentExecutor(
            default_mcp_servers=(mcp_servers or None)
        )
        # Both span hooks bundled at construction so the runner alone can
        # `dispatch` — including experiments with rich per-item tracing — with no
        # per-call hook threading.
        self._runner: WebhookRunner = WebhookRunner(
            client,
            self._executor,
            prompt_span_hook=_claude_agent_prompt_span,
            item_span_hook=_claude_agent_item_span,
        )

    @property
    def client(self) -> Any:
        """The AgentMark client this handler executes against — the eval-registry
        owner. Sourced from the runner (the single owner) so the handler and its
        runner can't disagree; surfaced so the shared dispatch answers the
        ``get-evals`` control-plane job with no extra wiring."""
        return self._runner.client

    async def dispatch(self, event: dict[str, Any]) -> Any:
        """Route a managed-deployment webhook job through the shared runner. The
        canonical deployed handler is ``handler = ClaudeAgentWebhookHandler(client)``
        + ``handler.dispatch`` — identical routing to every other adapter, no
        per-adapter dispatch code. Equivalent to ``runner.dispatch``."""
        return await self._runner.dispatch(event)

    def _get_frontmatter(self, prompt_ast: dict[str, Any]) -> dict[str, Any]:
        """Extract frontmatter. Overridable so tests can inject synthesized
        frontmatter without constructing a real AST."""
        return get_front_matter(prompt_ast) or {}

    async def run_prompt(
        self,
        prompt_ast: dict[str, Any],
        *,
        should_stream: bool = False,
        custom_props: dict[str, Any] | None = None,
        telemetry: dict[str, Any] | None = None,
    ) -> WebhookResult | StreamingResult:
        frontmatter = self._get_frontmatter(prompt_ast)

        if "image_config" in frontmatter:
            return WebhookResult(
                type="text",
                result=(
                    "Error: Image generation is not supported by Claude Agent SDK. "
                    "Use the Vercel AI SDK adapter with an image model."
                ),
                usage=dict(_UNSUPPORTED_USAGE),
                finish_reason="error",
                trace_id="",
            )
        if "speech_config" in frontmatter:
            return WebhookResult(
                type="text",
                result=(
                    "Error: Speech generation is not supported by Claude Agent SDK. "
                    "Use the Vercel AI SDK adapter with a speech model."
                ),
                usage=dict(_UNSUPPORTED_USAGE),
                finish_reason="error",
                trace_id="",
            )
        if "text_config" not in frontmatter and "object_config" not in frontmatter:
            raise ValueError(
                "Invalid prompt: No recognized config type "
                "(text_config, object_config, image_config, speech_config)"
            )

        ast_for_runner = _ensure_ast_has_frontmatter(prompt_ast, frontmatter)

        options: dict[str, Any] = {"shouldStream": should_stream}
        if custom_props is not None:
            options["customProps"] = custom_props
        if telemetry is not None:
            options["telemetry"] = telemetry

        try:
            response = await self._runner.run_prompt(ast_for_runner, options)
        except RuntimeError as err:
            return WebhookResult(
                type=_kind_for_frontmatter(frontmatter),
                result=f"Error: {err}",
                usage=dict(_UNSUPPORTED_USAGE),
                finish_reason="error",
                trace_id=generate_fallback_trace_id(),
            )

        if response.get("type") == "stream":
            return StreamingResult(
                type="stream",
                stream=response["stream"],
                stream_header={"AgentMark-Streaming": "true"},
                trace_id=response.get("traceId") or generate_fallback_trace_id(),
            )

        return WebhookResult(
            type=response.get("type", "text"),
            result=response.get("result"),
            usage=_normalize_usage(response.get("usage")),
            finish_reason=response.get("finishReason", "stop"),
            trace_id=response.get("traceId") or generate_fallback_trace_id(),
        )

    async def run_experiment(
        self,
        prompt_ast: dict[str, Any],
        dataset_run_name: str,
        dataset_path: str | None = None,
        sampling: dict[str, Any] | None = None,
        commit_sha: str | None = None,
        concurrency: int | None = None,
    ) -> ExperimentResult:
        """`commit_sha` is threaded to each item's span via the shared
        runner's span hook; `concurrency` bounds parallel dataset rows."""
        frontmatter = self._get_frontmatter(prompt_ast)
        if "image_config" in frontmatter or "speech_config" in frontmatter:
            async def error_stream_unsupported() -> AsyncIterator[str]:
                yield (
                    _json.dumps(
                        {
                            "type": "error",
                            "error": (
                                "Image and speech prompts are not supported "
                                "by Claude Agent SDK"
                            ),
                        }
                    )
                    + "\n"
                )

            return ExperimentResult(
                stream=error_stream_unsupported(),
                stream_headers={"AgentMark-Streaming": "true"},
            )

        resolved_dataset_path = dataset_path or (
            frontmatter.get("test_settings", {}).get("dataset")
            if isinstance(frontmatter.get("test_settings"), dict)
            else None
        )
        if not resolved_dataset_path:
            async def error_stream_no_dataset() -> AsyncIterator[str]:
                yield (
                    _json.dumps(
                        {
                            "type": "error",
                            "error": (
                                "No dataset path provided. Specify via "
                                "`datasetPath` argument or prompt frontmatter "
                                "`test_settings.dataset`."
                            ),
                        }
                    )
                    + "\n"
                )

            return ExperimentResult(
                stream=error_stream_no_dataset(),
                stream_headers={"AgentMark-Streaming": "true"},
            )

        ast_for_runner = _ensure_ast_has_frontmatter(prompt_ast, frontmatter)
        response = await self._runner.run_experiment(
            ast_for_runner,
            dataset_run_name,
            resolved_dataset_path,
            sampling,
            commit_sha=commit_sha,
            concurrency=concurrency,
        )

        return ExperimentResult(
            stream=response["stream"],
            stream_headers=response.get(
                "streamHeaders", {"AgentMark-Streaming": "true"}
            ),
        )
