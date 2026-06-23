"""Generic webhook runner — Python mirror of the TS WebhookRunner.

Consumes an Executor, emits the canonical wire format that AgentMark Cloud
and dashboard consumers expect. Byte-equivalent with the TypeScript runner
for text/object/experiment flows (within the tolerance of Python vs JS
JSON emission).

Pydantic support: `ObjectFinalEvent.value` may be a Pydantic model
instance. The runner serializes via `model_dump()` when building the wire
response so downstream dashboards see plain JSON regardless of the SDK's
native return type.
"""

from __future__ import annotations

import hashlib
import inspect
import json
import sys
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager, suppress
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Protocol

from .executor import (
    AgentEvent,
    ErrorEvent,
    ExecCtx,
    Executor,
    FinishEvent,
    ObjectDeltaEvent,
    ObjectFinalEvent,
    TextDeltaEvent,
    ToolCallEvent,
    ToolResultEvent,
    UsageData,
)
from .experiment import run_dataset_pool
from .template_engines import get_front_matter
from .webhook_dispatch import handle_webhook_request

if TYPE_CHECKING:
    from .agentmark import AgentMark


@dataclass
class ExperimentItemParams:
    """Parameters the shared runner hands to per-item span hooks.

    The hook builds SDK-specific tracing (e.g. agentmark_sdk SpanOptions)
    from these fields. The runner itself stays SDK-agnostic — it only
    knows that the hook returns an async context manager yielding an
    `ExperimentItemSpan` with `trace_id` + `set_attribute`.

    `dataset_item_name` is pre-computed by the runner as a 12-char md5
    digest of the JSON-serialized input (or the raw index when input is
    empty) — the canonical "stable item id" used for both TS + Python so
    re-runs of the same dataset keep the same item identity across the
    Experiments UI.
    """

    index: int
    experiment_run_id: str
    dataset_run_name: str
    prompt_name: str | None
    dataset_path: str | None
    dataset_item_name: str
    dataset_input: Any
    dataset_expected_output: Any
    commit_sha: str | None
    # Folder-aware prompt path; see ``PromptSpanParams.prompt_path``.
    prompt_path: str | None = None


class ExperimentItemSpan(Protocol):
    """Context yielded by an item span hook. Carries the wire trace_id and
    accepts per-attribute recording from the shared runner."""

    trace_id: str

    def set_attribute(self, key: str, value: str | int) -> None: ...


ExperimentItemSpanHook = Callable[
    [ExperimentItemParams], AbstractAsyncContextManager[ExperimentItemSpan]
]
"""Adapter-provided hook that wraps each experiment item in an SDK-native
span. When the hook is omitted, the runner runs items without spans and
emits `traceId: None` in each dataset chunk."""


@dataclass
class PromptSpanParams:
    """Parameters the shared runner hands to prompt-level span hooks."""

    name: str
    prompt_name: str | None
    # Commit sha the prompt content was served at (stamped by the gateway /
    # CLI dev server into the AST's ``agentmark_meta.commit_sha``). Lets
    # regular prompt-run traces link to the exact prompt VERSION. Mirrors
    # ``ExperimentItemParams.commit_sha``. Defaults to ``None`` so existing
    # hook implementations and call sites stay source-compatible.
    commit_sha: str | None = None
    # Folder-aware prompt path (e.g. ``agentmark/support/triage.prompt.mdx``).
    # The flat frontmatter ``name`` collides across folders, so the path is what
    # uniquely resolves a prompt. Forwarded from the webhook request's
    # ``promptPath``. Mirrors TS ``PromptSpanParams.promptPath``.
    prompt_path: str | None = None


class PromptSpan(Protocol):
    """Context yielded by a prompt span hook."""

    trace_id: str

    def set_attribute(self, key: str, value: str | int) -> None: ...


PromptSpanHook = Callable[
    [PromptSpanParams], AbstractAsyncContextManager[PromptSpan]
]
"""Adapter-provided hook that wraps each prompt run in an SDK-native span."""


@dataclass
class _NullSpan:
    trace_id: str | None = None

    def set_attribute(self, key: str, value: str | int) -> None:  # no-op
        pass


@asynccontextmanager
async def _null_span_hook(_params: ExperimentItemParams) -> AsyncIterator[_NullSpan]:
    yield _NullSpan()


@asynccontextmanager
async def _null_prompt_span_hook(_params: PromptSpanParams) -> AsyncIterator[_NullSpan]:
    yield _NullSpan()


def _commit_sha_from_frontmatter(frontmatter: Any) -> str | None:
    """Read the served-at commit sha the gateway/CLI dev server stamped into
    the AST frontmatter (``agentmark_meta.commit_sha``)."""
    if not isinstance(frontmatter, dict):
        return None
    meta = frontmatter.get("agentmark_meta")
    if not isinstance(meta, dict):
        return None
    sha = meta.get("commit_sha")
    return sha if isinstance(sha, str) and sha else None


def _serialize_value(value: Any) -> Any:
    """Serialize a value for the wire. Pydantic instances → model_dump()."""
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return value


def _set_span_model(span: PromptSpan, prompt_ast: Any) -> None:
    """Record the prompt's configured model as `gen_ai.request.model` on the
    prompt span. Read from frontmatter (adapter-agnostic), so traces from
    executors with NO model-SDK instrumentation still carry a model —
    doctor's "a model on any span" check and the dashboard's model column
    work for raw-SDK integrations out of the box."""
    with suppress(Exception):
        fm = get_front_matter(prompt_ast) or {}
        config = (
            fm.get("text_config")
            or fm.get("object_config")
            or fm.get("image_config")
            or fm.get("speech_config")
            or {}
        )
        model = config.get("model_name")
        if isinstance(model, str) and model:
            span.set_attribute("gen_ai.request.model", model)


def _classify_span_as_llm(span: PromptSpan) -> None:
    """Classify the prompt span as a GENERATION span so the normalizer and
    Requests view recognise it when the executor has no auto-instrumented
    model SDK (e.g. AWS Bedrock via raw boto3).

    gen_ai.operation.name is the key discriminator — without it the
    normalizer does not return SpanType.GENERATION and the Requests view
    query (WHERE Type = 'GENERATION') returns nothing.

    The runner stamps the config-name alias first via _set_span_model.
    Executors that resolve a different model ID (e.g. a Bedrock cross-region
    inference profile) can override gen_ai.request.model by calling
    span.set_attribute("gen_ai.request.model", real_id) inside their handler;
    set_attribute is last-write-wins on the same span object."""
    with suppress(Exception):
        span.set_attribute("gen_ai.operation.name", "chat")
    with suppress(Exception):
        span.set_attribute("agentmark.span.kind", "llm")


def _set_span_usage(span: PromptSpan, usage: UsageData | None) -> None:
    """Record executor-reported usage as `gen_ai.usage.*` on the prompt span.
    Integers, not strings — the normalizer only accepts numeric token
    attributes."""
    if usage is None:
        return
    with suppress(Exception):
        if isinstance(usage.input_tokens, int):
            span.set_attribute("gen_ai.usage.input_tokens", usage.input_tokens)
        if isinstance(usage.output_tokens, int):
            span.set_attribute("gen_ai.usage.output_tokens", usage.output_tokens)


def _msg_field(m: Any, key: str, default: Any = "") -> Any:
    """Read a message field from either a dict or an object (e.g. a Pydantic
    message), preserving falsy-but-present values like an empty string.

    The naive ``getattr(m, key, None) or m.get(key, default)`` pattern breaks on
    object messages whose field is ``""``: the empty string is falsy, so ``or``
    falls through to ``m.get`` — which a non-dict message does not have, raising
    AttributeError. Under the caller's ``suppress(Exception)`` that silently
    drops the WHOLE ``agentmark.input`` attribute (the list comprehension aborts
    on the first such message), so a prompt whose user content is empty produces
    a trace with no input at all.
    """
    val = m.get(key, default) if isinstance(m, dict) else getattr(m, key, None)
    return default if val is None else val


def _set_span_input(span: PromptSpan, formatted: Any) -> None:
    """Record the formatted messages as `agentmark.input` on the prompt span.

    The runner owns the prompt (root) span, so it is the one place that
    knows the request boundary — executors must not set this. Trace-level
    input derivation reads the root span's input first, falling back to
    GENERATION spans emitted by the host SDK's instrumentation.
    """
    messages = getattr(formatted, "messages", None)
    if not messages:
        return
    with suppress(Exception):
        serialized = [
            {
                "role": _msg_field(m, "role", None),
                "content": _msg_field(m, "content", ""),
            }
            for m in messages
        ]
        span.set_attribute("agentmark.input", json.dumps(serialized, default=str))


def _compute_dataset_item_name(dataset_input: Any, index: int) -> str:
    """Canonical dataset item name — 12-char md5 of the sorted-keys JSON of
    the input, falling back to the raw index when there's nothing to hash.
    Same formula as TS so re-runs of the same dataset keep identical item
    identity across both languages."""
    if dataset_input is None or dataset_input == "" or dataset_input == {}:
        return str(index)
    try:
        # Must match TS stableStringify byte-for-byte: compact separators,
        # no whitespace. Default `json.dumps` separators are `(", ", ": ")`
        # which produces a different digest and silently breaks cross-
        # language dataset item identity.
        digest_input = json.dumps(
            dataset_input, sort_keys=True, separators=(",", ":"), default=str
        )
    except (TypeError, ValueError):
        return str(index)
    return hashlib.md5(digest_input.encode()).hexdigest()[:12]


def _usage_to_wire(usage: UsageData | None) -> dict[str, Any] | None:
    """Translate the canonical UsageData into the legacy wire shape carrying
    both the `inputTokens`/`outputTokens` and the deprecated
    `promptTokens`/`completionTokens` field families.

    Field-compatible with the TS runner (same keys; `totalTokens` present only
    when known), but NOT byte-identical: TS places `totalTokens` between the
    output and prompt fields, and Python's `json.dumps` uses spaced separators.
    The cloud + dashboard consumers parse by key (order-agnostic), so this is
    interchangeable with the TS wire — it just isn't a literal byte match."""
    if usage is None:
        return None
    out: dict[str, Any] = {
        "inputTokens": usage.input_tokens,
        "outputTokens": usage.output_tokens,
        "promptTokens": usage.input_tokens,
        "completionTokens": usage.output_tokens,
    }
    if usage.total_tokens is not None:
        out["totalTokens"] = usage.total_tokens
    return out


def _text_event_to_wire(ev: AgentEvent) -> dict[str, Any] | None:
    """Map one TEXT-stream AgentEvent to its wire chunk dict, or ``None``
    when the event isn't wired (e.g. reasoning deltas — deliberately not on
    the wire).

    Parity contract: behavior-identical to ``textEventToWire`` in
    prompt-core's ``wire.ts``. Both are exercised against the shared
    ``conformance-vectors/wire-chunks.json`` golden cases so the NDJSON the
    two runners emit cannot drift silently.
    """
    if isinstance(ev, TextDeltaEvent):
        return {"type": "text", "result": ev.text}
    if isinstance(ev, ToolCallEvent):
        return {
            "type": "text",
            "toolCall": {
                "toolCallId": ev.id,
                "toolName": ev.name,
                "args": ev.args,
            },
        }
    if isinstance(ev, ToolResultEvent):
        return {
            "type": "text",
            "toolResult": {
                "toolCallId": ev.id,
                "toolName": ev.name,
                "result": ev.result,
            },
        }
    if isinstance(ev, FinishEvent):
        # `finish` is the single canonical usage carrier; usage-less finishes
        # emit the reason alone — the key is omitted, matching TS where
        # JSON.stringify drops the undefined property.
        payload: dict[str, Any] = {"type": "text", "finishReason": ev.reason}
        if ev.usage is not None:
            payload["usage"] = _usage_to_wire(ev.usage)
        return payload
    if isinstance(ev, ErrorEvent):
        return {"type": "error", "error": ev.error}
    return None


def _text_response_to_wire(
    *,
    result: str,
    usage: UsageData | None,
    finish_reason: str | None,
    tool_calls: list[dict[str, Any]],
    tool_results: list[dict[str, Any]],
    trace_id: str | None,
) -> dict[str, Any]:
    """Build the non-streaming TEXT response envelope.

    Parity contract: behavior-identical to ``textResponseToWire`` in
    prompt-core's ``wire.ts``; both run against the shared
    ``conformance-vectors/response-envelopes.json`` golden cases.

    Canonical absence semantics follow TS: ``usage`` / ``finishReason`` are
    OMITTED when unknown — never null (pre-vector this runner emitted
    ``"usage": null``) — and ``traceId`` is omitted when empty.
    ``toolCalls``/``toolResults`` are always arrays.
    """
    payload: dict[str, Any] = {"type": "text", "result": result}
    wire_usage = _usage_to_wire(usage)
    if wire_usage is not None:
        payload["usage"] = wire_usage
    if finish_reason is not None:
        payload["finishReason"] = finish_reason
    payload["toolCalls"] = tool_calls
    payload["toolResults"] = tool_results
    if trace_id:
        payload["traceId"] = trace_id
    return payload


def _object_response_to_wire(
    *,
    result: Any,
    usage: UsageData | None,
    finish_reason: str | None,
    trace_id: str | None,
) -> dict[str, Any]:
    """Object twin of :func:`_text_response_to_wire` — mirrors
    ``objectResponseToWire`` in ``wire.ts``. ``result`` is omitted (never
    null) when the run produced no resolved value."""
    payload: dict[str, Any] = {"type": "object"}
    if result is not None:
        payload["result"] = result
    wire_usage = _usage_to_wire(usage)
    if wire_usage is not None:
        payload["usage"] = wire_usage
    if finish_reason is not None:
        payload["finishReason"] = finish_reason
    if trace_id:
        payload["traceId"] = trace_id
    return payload


def _dataset_row_to_wire(
    *,
    input_data: Any,
    expected_output: Any,
    actual_output: Any,
    tokens: int | None,
    evals: list[dict[str, Any]],
    trace_id: str | None,
    run_id: str,
    run_name: str,
) -> dict[str, Any]:
    """Build the ``{type:"dataset"}`` experiment-row chunk.

    Parity contract: behavior-identical to ``datasetRowToWire`` in
    prompt-core's ``wire.ts``; both run against the shared
    ``conformance-vectors/dataset-rows.json`` golden cases.

    Canonical absence semantics follow TS (where JSON.stringify drops
    undefined): ``expectedOutput`` / ``actualOutput`` / ``tokens`` are
    OMITTED when unknown — never emitted as null — and ``traceId`` is
    omitted when empty. (Pre-vector, this runner emitted
    ``"expectedOutput": null`` for rows without one — a silent divergence
    from the TS wire that consumers tolerated only because they probe by
    key.)
    """
    result: dict[str, Any] = {"input": input_data}
    if expected_output is not None:
        result["expectedOutput"] = expected_output
    if actual_output is not None:
        result["actualOutput"] = actual_output
    if tokens is not None:
        result["tokens"] = tokens
    result["evals"] = evals

    payload: dict[str, Any] = {"type": "dataset", "result": result}
    if trace_id:
        payload["traceId"] = trace_id
    payload["runId"] = run_id
    payload["runName"] = run_name
    return payload


def _object_event_to_wire(ev: AgentEvent) -> dict[str, Any] | None:
    """Map one OBJECT-stream AgentEvent to its wire chunk dict, or ``None``
    when no chunk is emitted (usage-less ``finish`` — historical wire emits
    nothing). Parity contract: mirrors ``objectEventToWire`` in ``wire.ts``;
    see ``_text_event_to_wire``.
    """
    if isinstance(ev, ObjectDeltaEvent):
        return {"type": "object", "result": _serialize_value(ev.partial)}
    if isinstance(ev, ObjectFinalEvent):
        return {"type": "object", "result": _serialize_value(ev.value)}
    if isinstance(ev, FinishEvent):
        if ev.usage is None:
            return None
        return {"type": "object", "usage": _usage_to_wire(ev.usage)}
    if isinstance(ev, ErrorEvent):
        return {"type": "error", "error": ev.error}
    return None


async def _drain_events(
    events: AsyncIterator[AgentEvent],
) -> tuple[
    str,
    Any,
    list[dict[str, Any]],
    list[dict[str, Any]],
    UsageData | None,
    str,
    str | None,
]:
    """Collect an AgentEvent stream into (text, obj_value, tool_calls,
    tool_results, usage, finish_reason, error_message).

    For streaming callers, the text/object paths instead iterate events
    directly and emit NDJSON as they go."""
    text_buf = ""
    obj_value: Any = None
    tool_calls: list[dict[str, Any]] = []
    tool_results: list[dict[str, Any]] = []
    usage: UsageData | None = None
    finish_reason = "stop"
    error_message: str | None = None
    async for ev in events:
        if isinstance(ev, TextDeltaEvent):
            text_buf += ev.text
        elif isinstance(ev, ObjectFinalEvent):
            obj_value = ev.value
        elif isinstance(ev, ObjectDeltaEvent):
            obj_value = ev.partial
        elif isinstance(ev, ToolCallEvent):
            tool_calls.append(
                {"toolCallId": ev.id, "toolName": ev.name, "args": ev.args}
            )
        elif isinstance(ev, ToolResultEvent):
            tool_results.append(
                {"toolCallId": ev.id, "toolName": ev.name, "result": ev.result}
            )
        elif isinstance(ev, FinishEvent):
            finish_reason = ev.reason
            if ev.usage is not None:
                usage = ev.usage
        elif isinstance(ev, ErrorEvent):
            error_message = ev.error
            break
    return text_buf, obj_value, tool_calls, tool_results, usage, finish_reason, error_message


class WebhookRunner:
    """Shared runner over an Executor. Replaces per-adapter runner duplication.

    Accepts an AgentMark client + any conformant Executor implementation.
    Emits wire-compatible dicts for text/object/image/speech and an
    AsyncIterator of NDJSON strings for experiments.
    """

    def __init__(
        self,
        client: AgentMark,
        executor: Executor,
        *,
        prompt_span_hook: PromptSpanHook | None = None,
        item_span_hook: ExperimentItemSpanHook | None = None,
    ) -> None:
        self._client = client
        self._executor = executor
        self._prompt_span_hook = prompt_span_hook or _null_prompt_span_hook
        # Bundled at construction (like the TS runner's hooks) so `dispatch()`
        # can drive experiments with rich per-item tracing without the caller
        # threading the hook per call. run_experiment still accepts a per-call
        # override.
        self._item_span_hook = item_span_hook or _null_span_hook

    @property
    def client(self) -> AgentMark:
        """The AgentMark client this runner executes against — the eval-registry
        owner. Public so the shared dispatch (and ``dispatch()`` below) answer the
        ``get-evals`` control-plane job from the runner's own registry."""
        return self._client

    def get_eval_names(self) -> list[str]:
        """Names of the registered evals — satisfies ``ControlPlaneClient`` so a
        runner can be passed straight to ``handle_webhook_request`` and answer
        ``get-evals`` with zero extra wiring."""
        return self._client.get_eval_names()

    async def dispatch(self, event: dict[str, Any]) -> Any:
        """Route one gateway webhook job — prompt-run / dataset-run / get-evals —
        sourcing evals from this runner's OWN client. The canonical managed entry
        point: a deployed ``handler`` is just ``runner.dispatch``. No passable,
        omittable client argument, so the eval registry can't be dropped on the
        way to the control plane (the root cause of the empty New Experiment
        dialog). Adapters and BYO builders both produce a runner — they add zero
        dispatch code."""
        return await handle_webhook_request(event, self, self._client)

    async def run_prompt(
        self,
        prompt_ast: Any,
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        options = options or {}
        frontmatter = get_front_matter(prompt_ast)
        should_stream = options.get("shouldStream", True)
        custom_props = options.get("customProps")
        telemetry = options.get("telemetry")
        prompt_name = frontmatter.get("name") if isinstance(frontmatter, dict) else None
        commit_sha = _commit_sha_from_frontmatter(frontmatter)
        # Folder-aware prompt path — sourced from the request options (the
        # dispatch forwards the webhook body's ``promptPath``), unlike commit_sha
        # which is read from the AST frontmatter. Mirrors TS RunPromptOptions.
        prompt_path = options.get("promptPath")

        # Use `in` rather than `.get(...)` — an empty config dict is valid
        # (users sometimes declare just `text_config: {}` to pick up
        # adapter defaults) but `{}` is falsy via .get().
        if "object_config" in frontmatter:
            return await self._run_object(
                prompt_ast, should_stream, custom_props, telemetry, prompt_name, commit_sha, prompt_path
            )
        if "text_config" in frontmatter:
            return await self._run_text(
                prompt_ast, should_stream, custom_props, telemetry, prompt_name, commit_sha, prompt_path
            )
        if "image_config" in frontmatter:
            return await self._run_image(
                prompt_ast, custom_props, telemetry, prompt_name, commit_sha, prompt_path
            )
        if "speech_config" in frontmatter:
            return await self._run_speech(
                prompt_ast, custom_props, telemetry, prompt_name, commit_sha, prompt_path
            )
        raise ValueError(
            "Invalid prompt: no text_config, object_config, image_config, or speech_config found"
        )

    async def _run_text(
        self,
        prompt_ast: Any,
        should_stream: bool,
        custom_props: dict[str, Any] | None,
        telemetry: dict[str, Any] | None,
        prompt_name: str | None,
        commit_sha: str | None = None,
        prompt_path: str | None = None,
    ) -> dict[str, Any]:
        # The span is entered manually (not `async with`) because on the
        # streaming path its ownership transfers to the NDJSON generator:
        # the span must end when the stream drains, not when this method
        # returns the stream object — otherwise the span closes before the
        # model call runs and the model spans land in a separate trace.
        span_cm = self._prompt_span(prompt_name, commit_sha, prompt_path)
        span = await span_cm.__aenter__()
        try:
            prompt = await self._client.load_text_prompt(prompt_ast)
            formatted = (
                await prompt.format(props=custom_props)
                if custom_props
                else await prompt.format_with_test_props()
            )
            _set_span_input(span, formatted)
            _set_span_model(span, prompt_ast)
            _classify_span_as_llm(span)
            ctx = ExecCtx(
                telemetry=telemetry,
                trace_id=getattr(span, "trace_id", None),
                prompt_name=prompt_name,
                should_stream=should_stream,
                extra={"span": span},
            )
            if should_stream:
                return self._with_trace_id(
                    {
                        "type": "stream",
                        "stream": self._stream_text_ndjson(
                            formatted, ctx, span=span, span_cm=span_cm
                        ),
                    },
                    ctx.trace_id,
                )

            events = self._executor.execute_text(formatted, ctx)
            text, _obj, tool_calls, tool_results, usage, finish_reason, err = (
                await _drain_events(events)
            )
            if err is not None:
                raise RuntimeError(err)
            with suppress(Exception):
                span.set_attribute("agentmark.output", text)
            _set_span_usage(span, usage)
            # Envelope assembly is the pure _text_response_to_wire, pinned by
            # the shared response-envelopes.json golden vectors that the TS
            # runner's mirror also runs.
            response = _text_response_to_wire(
                result=text,
                usage=usage,
                finish_reason=finish_reason,
                tool_calls=tool_calls,
                tool_results=tool_results,
                trace_id=ctx.trace_id,
            )
        except BaseException:
            await span_cm.__aexit__(*sys.exc_info())
            raise
        await span_cm.__aexit__(None, None, None)
        return response

    async def _run_object(
        self,
        prompt_ast: Any,
        should_stream: bool,
        custom_props: dict[str, Any] | None,
        telemetry: dict[str, Any] | None,
        prompt_name: str | None,
        commit_sha: str | None = None,
        prompt_path: str | None = None,
    ) -> dict[str, Any]:
        # See _run_text for why the span is entered manually: streaming
        # transfers span ownership to the NDJSON generator.
        span_cm = self._prompt_span(prompt_name, commit_sha, prompt_path)
        span = await span_cm.__aenter__()
        try:
            prompt = await self._client.load_object_prompt(prompt_ast)
            formatted = (
                await prompt.format(props=custom_props)
                if custom_props
                else await prompt.format_with_test_props()
            )
            _set_span_input(span, formatted)
            _set_span_model(span, prompt_ast)
            _classify_span_as_llm(span)
            ctx = ExecCtx(
                telemetry=telemetry,
                trace_id=getattr(span, "trace_id", None),
                prompt_name=prompt_name,
                should_stream=should_stream,
                extra={"span": span},
            )
            if should_stream:
                return self._with_trace_id(
                    {
                        "type": "stream",
                        "stream": self._stream_object_ndjson(
                            formatted, ctx, span=span, span_cm=span_cm
                        ),
                    },
                    ctx.trace_id,
                )
            events = self._executor.execute_object(formatted, ctx)
            _text, obj_value, _tc, _tr, usage, finish_reason, err = await _drain_events(
                events
            )
            if err is not None:
                raise RuntimeError(err)
            serialized = _serialize_value(obj_value)
            with suppress(Exception):
                span.set_attribute("agentmark.output", json.dumps(serialized, default=str))
            _set_span_usage(span, usage)
            # See _run_text — vector-pinned envelope assembly.
            response = _object_response_to_wire(
                result=serialized,
                usage=usage,
                finish_reason=finish_reason,
                trace_id=ctx.trace_id,
            )
        except BaseException:
            await span_cm.__aexit__(*sys.exc_info())
            raise
        await span_cm.__aexit__(None, None, None)
        return response

    async def _run_image(
        self,
        prompt_ast: Any,
        custom_props: dict[str, Any] | None,
        telemetry: dict[str, Any] | None,
        prompt_name: str | None,
        commit_sha: str | None = None,
        prompt_path: str | None = None,
    ) -> dict[str, Any]:
        if not self._executor.capabilities().image:
            raise ValueError(
                f"Executor '{self._executor.name}' does not support image prompts."
            )
        execute_image = getattr(self._executor, "execute_image", None)
        if execute_image is None:
            raise ValueError(
                f"Executor '{self._executor.name}' does not implement execute_image()."
            )

        async with self._prompt_span(prompt_name, commit_sha, prompt_path) as span:
            prompt = await self._client.load_image_prompt(prompt_ast)
            formatted = (
                await prompt.format(props=custom_props, telemetry=telemetry)
                if custom_props
                else await prompt.format_with_test_props(telemetry=telemetry)
            )
            ctx = ExecCtx(
                telemetry=telemetry,
                trace_id=getattr(span, "trace_id", None),
                prompt_name=prompt_name,
                should_stream=False,
                extra={"span": span},
            )
            _set_span_input(span, formatted)
            _set_span_model(span, prompt_ast)
            result = await execute_image(formatted, ctx)
            return self._with_trace_id(dict(result), ctx.trace_id)

    async def _run_speech(
        self,
        prompt_ast: Any,
        custom_props: dict[str, Any] | None,
        telemetry: dict[str, Any] | None,
        prompt_name: str | None,
        commit_sha: str | None = None,
        prompt_path: str | None = None,
    ) -> dict[str, Any]:
        if not self._executor.capabilities().speech:
            raise ValueError(
                f"Executor '{self._executor.name}' does not support speech prompts."
            )
        execute_speech = getattr(self._executor, "execute_speech", None)
        if execute_speech is None:
            raise ValueError(
                f"Executor '{self._executor.name}' does not implement execute_speech()."
            )

        async with self._prompt_span(prompt_name, commit_sha, prompt_path) as span:
            prompt = await self._client.load_speech_prompt(prompt_ast)
            formatted = (
                await prompt.format(props=custom_props, telemetry=telemetry)
                if custom_props
                else await prompt.format_with_test_props(telemetry=telemetry)
            )
            ctx = ExecCtx(
                telemetry=telemetry,
                trace_id=getattr(span, "trace_id", None),
                prompt_name=prompt_name,
                should_stream=False,
                extra={"span": span},
            )
            _set_span_input(span, formatted)
            _set_span_model(span, prompt_ast)
            result = await execute_speech(formatted, ctx)
            return self._with_trace_id(dict(result), ctx.trace_id)

    @asynccontextmanager
    async def _prompt_span(
        self,
        prompt_name: str | None,
        commit_sha: str | None = None,
        prompt_path: str | None = None,
    ) -> AsyncIterator[PromptSpan]:
        async with self._prompt_span_hook(
            PromptSpanParams(
                name=prompt_name or "prompt-run",
                prompt_name=prompt_name,
                commit_sha=commit_sha,
                prompt_path=prompt_path,
            )
        ) as span:
            yield span

    def _with_trace_id(
        self, payload: dict[str, Any], trace_id: str | None
    ) -> dict[str, Any]:
        if trace_id:
            payload["traceId"] = trace_id
        return payload

    async def _stream_text_ndjson(
        self,
        formatted: Any,
        ctx: ExecCtx,
        span: PromptSpan | None = None,
        span_cm: AbstractAsyncContextManager[PromptSpan] | None = None,
    ) -> AsyncIterator[str]:
        # When span/span_cm are passed, this generator owns the prompt span:
        # it records the accumulated output and ends the span when the stream
        # drains (or errors), keeping the model call inside the span.
        text_parts: list[str] = []
        usage_cap: UsageData | None = None
        # Set on an error event / caught exception; the span is then closed WITH
        # this exc info so a streamed run that errored is marked ERROR (mirrors
        # the non-streaming path), not silently OK.
        stream_error: BaseException | None = None
        try:
            try:
                async for ev in self._executor.execute_text(formatted, ctx):
                    if isinstance(ev, TextDeltaEvent):
                        text_parts.append(ev.text)
                    elif isinstance(ev, FinishEvent) and ev.usage is not None:
                        usage_cap = ev.usage
                    # Pure event→chunk mapping is module-level, pinned by the
                    # shared wire-chunks.json golden vectors that the TS runner's
                    # mirror also runs. Terminal handling stays here.
                    chunk = _text_event_to_wire(ev)
                    if chunk is not None:
                        yield json.dumps(chunk) + "\n"
                    if isinstance(ev, ErrorEvent):
                        stream_error = RuntimeError(ev.error)
                        return
            except Exception as exc:  # noqa: BLE001 — executor errors become wire errors
                stream_error = exc
                yield json.dumps({"type": "error", "error": str(exc)}) + "\n"
        finally:
            if span is not None and text_parts:
                with suppress(Exception):
                    span.set_attribute("agentmark.output", "".join(text_parts))
            if span is not None:
                _set_span_usage(span, usage_cap)
            if span_cm is not None:
                with suppress(Exception):
                    if stream_error is not None:
                        await span_cm.__aexit__(
                            type(stream_error), stream_error, stream_error.__traceback__
                        )
                    else:
                        await span_cm.__aexit__(None, None, None)

    async def _stream_object_ndjson(
        self,
        formatted: Any,
        ctx: ExecCtx,
        span: PromptSpan | None = None,
        span_cm: AbstractAsyncContextManager[PromptSpan] | None = None,
    ) -> AsyncIterator[str]:
        # Span ownership mirrors _stream_text_ndjson.
        obj_value: Any = None
        usage_cap: UsageData | None = None
        # See _stream_text_ndjson: close the span WITH exc info on error so the
        # streamed run is marked ERROR, not silently OK.
        stream_error: BaseException | None = None
        try:
            try:
                async for ev in self._executor.execute_object(formatted, ctx):
                    # Same accumulation semantics as _drain_events.
                    if isinstance(ev, ObjectFinalEvent):
                        obj_value = ev.value
                    elif isinstance(ev, ObjectDeltaEvent):
                        obj_value = ev.partial
                    elif isinstance(ev, FinishEvent) and ev.usage is not None:
                        usage_cap = ev.usage
                    # Pure event→chunk mapping is module-level (vector-pinned, see
                    # _stream_text_ndjson): usage-less finish emits nothing.
                    chunk = _object_event_to_wire(ev)
                    if chunk is not None:
                        yield json.dumps(chunk) + "\n"
                    if isinstance(ev, ErrorEvent):
                        stream_error = RuntimeError(ev.error)
                        return
            except Exception as exc:  # noqa: BLE001
                stream_error = exc
                yield json.dumps({"type": "error", "error": str(exc)}) + "\n"
        finally:
            if span is not None and obj_value is not None:
                with suppress(Exception):
                    span.set_attribute(
                        "agentmark.output",
                        json.dumps(_serialize_value(obj_value), default=str),
                    )
            if span is not None:
                _set_span_usage(span, usage_cap)
            if span_cm is not None:
                with suppress(Exception):
                    if stream_error is not None:
                        await span_cm.__aexit__(
                            type(stream_error), stream_error, stream_error.__traceback__
                        )
                    else:
                        await span_cm.__aexit__(None, None, None)

    async def run_experiment(
        self,
        prompt_ast: Any,
        dataset_run_name: str,
        dataset_path: str | None = None,
        sampling: dict[str, Any] | None = None,
        *,
        item_span_hook: ExperimentItemSpanHook | None = None,
        commit_sha: str | None = None,
        prompt_path: str | None = None,
        concurrency: int | None = None,
    ) -> dict[str, Any]:
        """Run a prompt across a dataset, emitting per-item NDJSON chunks.

        Args:
            item_span_hook: Optional per-item span wrapper. Adapters that
                need rich per-item tracing (e.g. agentmark_sdk
                span_context with dataset_run_id / dataset_item_name /
                commit_sha) provide a hook here. The runner hands the
                hook an ExperimentItemParams, awaits its async context
                manager around each item's execution, and uses the
                resulting span's `trace_id` in the wire chunk.
            commit_sha: Surfaced to the hook so SDK spans can record it;
                otherwise ignored.
        """
        frontmatter = get_front_matter(prompt_ast)
        experiment_run_id = str(uuid.uuid4())
        eval_registry = self._client.get_eval_registry()
        resolved_dataset_path = dataset_path or (
            frontmatter.get("test_settings", {}).get("dataset")
            if isinstance(frontmatter, dict)
            else None
        )
        prompt_name = frontmatter.get("name") if isinstance(frontmatter, dict) else None
        # Caller-supplied commit_sha (e.g. the CLI's run-experiment git
        # stamping) wins; the AST's served-at agentmark_meta.commit_sha is
        # only a fallback for cloud-loaded prompts run without an explicit sha.
        commit_sha = commit_sha or _commit_sha_from_frontmatter(frontmatter)

        if "text_config" in frontmatter:
            kind = "text"
        elif "object_config" in frontmatter:
            kind = "object"
        else:
            raise ValueError("Invalid prompt: no text_config or object_config")

        hook = item_span_hook or self._item_span_hook
        return {
            "stream": self._stream_experiment(
                prompt_ast,
                kind,
                dataset_run_name,
                experiment_run_id,
                resolved_dataset_path,
                sampling,
                eval_registry,
                prompt_name,
                hook,
                commit_sha,
                prompt_path,
                concurrency,
            ),
            "streamHeaders": {"AgentMark-Streaming": "true"},
        }

    async def _stream_experiment(
        self,
        prompt_ast: Any,
        kind: str,
        dataset_run_name: str,
        experiment_run_id: str,
        dataset_path: str | None,
        sampling: dict[str, Any] | None,
        eval_registry: Any,
        prompt_name: str | None,
        item_span_hook: ExperimentItemSpanHook,
        commit_sha: str | None,
        prompt_path: str | None,
        concurrency: int | None,
    ) -> AsyncIterator[str]:
        if kind == "text":
            prompt = await self._client.load_text_prompt(prompt_ast)
        else:
            prompt = await self._client.load_object_prompt(prompt_ast)

        # Python's prompt.format_with_dataset uses snake_case kwargs —
        # `dataset_path`, not `datasetPath`. Per-item span wrapping happens
        # via item_span_hook, so no `telemetry` flag is needed here.
        kwargs: dict[str, Any] = {"dataset_path": dataset_path}
        if sampling is not None:
            kwargs["sampling"] = sampling
        dataset = await prompt.format_with_dataset(**kwargs)

        def _get(container: Any, key: str, default: Any = None) -> Any:
            """Duck-typed accessor — real DatasetStreamChunk exposes attrs,
            test mocks + dict-based producers expose dict keys. Accept both."""
            if container is None:
                return default
            if isinstance(container, dict):
                return container.get(key, default)
            return getattr(container, key, default)

        # Iterate via get_reader() since that's what the DatasetStream
        # Protocol mandates. SimpleDatasetStream also supports `async for`
        # but real/mocked custom streams may only implement get_reader().
        async def _iter_dataset() -> AsyncIterator[Any]:
            if hasattr(dataset, "get_reader"):
                reader = dataset.get_reader()
                while True:
                    read_result = await reader.read()
                    if isinstance(read_result, dict):
                        if read_result.get("done"):
                            break
                        yield read_result.get("value")
                    else:
                        # Duck-typed — older/alt readers may yield items directly.
                        done = getattr(read_result, "done", None)
                        if done:
                            break
                        yield getattr(read_result, "value", read_result)
            else:
                async for item in dataset:
                    yield item

        # Wrap the dual reader/async-for iterator into a `read()`-shaped reader
        # so the bounded pool can drain it. run_dataset_pool yields finished
        # chunks as they complete (completion order, not read order); each
        # chunk carries its own input/error, so order-independence is fine.
        class _GenReader:
            def __init__(self, agen: AsyncIterator[Any]) -> None:
                self._agen = agen

            async def read(self) -> dict[str, Any]:
                try:
                    value = await self._agen.__anext__()
                except StopAsyncIteration:
                    return {"done": True}
                return {"done": False, "value": value}

        async def process_item(item: Any, index: int) -> str | None:
            # Dataset load errors (typed `type="error"`, or the legacy
            # top-level `error` key without `formatted`) surface as a unified
            # error chunk — `{type:"error"}`, matching the TS runner and the
            # CLI/cloud consumer — instead of being silently dropped.
            err_reason = None
            if _get(item, "type") == "error":
                err_reason = _get(item, "error") or "dataset error"
            elif (
                isinstance(item, dict)
                and "error" in item
                and "formatted" not in item
            ):
                err_reason = item["error"]
            if err_reason is not None:
                return json.dumps({"type": "error", "error": err_reason})

            formatted = _get(item, "formatted")
            ctx = ExecCtx(
                telemetry={"isEnabled": True},
                prompt_name=prompt_name,
                should_stream=False,
            )

            dataset_meta = _get(item, "dataset")
            expected = _get(dataset_meta, "expected_output")
            input_data = _get(dataset_meta, "input")
            span_params = ExperimentItemParams(
                index=index,
                experiment_run_id=experiment_run_id,
                dataset_run_name=dataset_run_name,
                prompt_name=prompt_name,
                dataset_path=dataset_path,
                dataset_item_name=_compute_dataset_item_name(input_data, index),
                dataset_input=input_data,
                dataset_expected_output=expected,
                commit_sha=commit_sha,
                prompt_path=prompt_path,
            )

            trace_id: str | None = None
            try:
                # Wrap the executor call in the adapter's per-item span. The
                # shared runner records props + input and model/classify after
                # entering the span, and output/usage after execution —
                # mirroring _run_text so item spans carry the same attributes
                # as single-prompt spans.
                async with item_span_hook(span_params) as item_span:
                    if input_data is not None:
                        with suppress(TypeError, ValueError):
                            item_span.set_attribute(
                                "agentmark.props",
                                json.dumps(input_data, default=str),
                            )

                    # Record the rendered messages as agentmark.input, exactly as
                    # the run-prompt paths do — so the experiment item span shows the
                    # real system/user/assistant turns, not just the raw dataset props.
                    # agentmark.props (above) stays for re-runnable dataset rows.
                    _set_span_input(item_span, formatted)  # type: ignore[arg-type]
                    _set_span_model(item_span, prompt_ast)  # type: ignore[arg-type]
                    _classify_span_as_llm(item_span)  # type: ignore[arg-type]

                    events = (
                        self._executor.execute_text(formatted, ctx)
                        if kind == "text"
                        else self._executor.execute_object(formatted, ctx)
                    )
                    text, obj_value, _tc, _tr, usage, _fr, err = (
                        await _drain_events(events)
                    )

                    if err is not None:
                        # Raise so the span hook's __aexit__ receives the
                        # exception and marks the span ERROR — setting an
                        # attribute then returning cleanly leaves the span
                        # status as OK.
                        raise RuntimeError(err)

                    _set_span_usage(item_span, usage)  # type: ignore[arg-type]

                    output: Any = (
                        text if kind == "text" else _serialize_value(obj_value)
                    )

                    # Mirror the run-prompt paths' agentmark.output contract:
                    # raw string for text, JSON for objects. json.dumps() on a
                    # text string double-encodes it ('hello' -> '"hello"'),
                    # diverging from both the TS runner and Python's own
                    # _run_text. Pinned by span-io.json (experiment cases).
                    with suppress(TypeError, ValueError):
                        item_span.set_attribute(
                            "agentmark.output",
                            output
                            if isinstance(output, str)
                            else json.dumps(output, default=str),
                        )

                    trace_id = getattr(item_span, "trace_id", None)

                eval_results: list[dict[str, Any]] = []
                score_names = _get(item, "evals") or []
                if eval_registry and isinstance(score_names, list) and score_names:
                    for name in score_names:
                        fn = (
                            eval_registry.get(name)
                            if hasattr(eval_registry, "get")
                            else None
                        )
                        if fn is None:
                            continue
                        # Adapter-specific formatted shapes expose the prompt
                        # messages under different field names. Prefer the AI
                        # SDK-style `messages`, fall back to pydantic-ai's
                        # `_raw_messages`, finally surface `user_prompt` so
                        # evals never silently receive None.
                        eval_input = (
                            getattr(formatted, "messages", None)
                            or getattr(formatted, "_raw_messages", None)
                            or getattr(formatted, "user_prompt", None)
                        )
                        _eval_result = fn({
                            "input": eval_input,
                            "output": output,
                            "expectedOutput": expected,
                        })
                        r = await _eval_result if inspect.isawaitable(_eval_result) else _eval_result
                        eval_results.append({"name": name, **(r or {})})

                # Row assembly is the pure _dataset_row_to_wire (module
                # level), pinned by the shared dataset-rows.json golden
                # vectors that the TS runner's mirror also runs.
                tokens: int | None = None
                if usage is not None:
                    tokens = (
                        usage.total_tokens
                        if usage.total_tokens is not None
                        else usage.input_tokens + usage.output_tokens
                    )
                payload = _dataset_row_to_wire(
                    input_data=input_data,
                    expected_output=expected,
                    actual_output=output,
                    tokens=tokens,
                    evals=eval_results,
                    trace_id=trace_id,
                    run_id=experiment_run_id,
                    run_name=dataset_run_name,
                )
                return json.dumps(payload)
            except Exception as exc:  # noqa: BLE001
                # Pool policy: a row failure becomes an error row and the run
                # continues — an exception escaping process_item would abort
                # the whole pool.
                return json.dumps({"type": "error", "error": str(exc)})

        reader = _GenReader(_iter_dataset())
        async for chunk in run_dataset_pool(reader, process_item, concurrency):
            yield chunk + "\n"
