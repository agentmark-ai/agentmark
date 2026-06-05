"""Canonical event stream + Executor protocol for AgentMark adapters.

Mirrors the TypeScript `Executor` / `AgentEvent` contract in
`@agentmark-ai/prompt-core`. Every SDK integration (Pydantic AI,
Claude Agent SDK Python, or a BYO framework) translates its native
event stream into `AgentEvent` so the shared `WebhookRunner` can produce
a byte-stable wire format regardless of which SDK is underneath.

Pydantic integration note: `ObjectFinalEvent.value` is typed `Any` so
executors can yield Pydantic model instances directly. The WebhookRunner
serializes Pydantic instances via `model_dump()` when emitting the wire
response — callers never need to pre-serialize.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, runtime_checkable


@dataclass
class TextDeltaEvent:
    text: str
    type: Literal["text-delta"] = "text-delta"


@dataclass
class ReasoningDeltaEvent:
    text: str
    type: Literal["reasoning-delta"] = "reasoning-delta"


@dataclass
class ObjectDeltaEvent:
    partial: Any
    type: Literal["object-delta"] = "object-delta"


@dataclass
class ObjectFinalEvent:
    """Final object value. Accepts Pydantic model instances as `value`; the
    WebhookRunner serializes them via `model_dump()` when emitting the
    wire response. BYO executors may also yield plain dicts."""

    value: Any
    type: Literal["object-final"] = "object-final"


@dataclass
class ToolCallEvent:
    id: str
    name: str
    args: Any
    type: Literal["tool-call"] = "tool-call"


@dataclass
class ToolResultEvent:
    id: str
    name: str
    result: Any
    is_error: bool = False
    type: Literal["tool-result"] = "tool-result"


@dataclass
class UsageData:
    input_tokens: int
    output_tokens: int
    total_tokens: int | None = None


@dataclass
class FinishEvent:
    """Terminal 'stream complete' event — the SINGLE canonical usage carrier.

    Every stream ends with exactly one ``FinishEvent`` (or a terminal
    ``ErrorEvent``). Usage rides on ``FinishEvent.usage``: SDKs that bundle
    usage into their finish signal and SDKs that deliver it on a side channel
    (pydantic-ai's RunUsage) both funnel into this one event."""

    reason: str = "stop"
    usage: UsageData | None = None
    type: Literal["finish"] = "finish"


@dataclass
class ErrorEvent:
    error: str
    type: Literal["error"] = "error"


# Two terminal events common to every stream kind.
CommonStreamEvent = FinishEvent | ErrorEvent

# Events a TEXT-kind stream may emit (mirrors TS `TextStreamEvent`).
TextStreamEvent = (
    TextDeltaEvent
    | ReasoningDeltaEvent
    | ToolCallEvent
    | ToolResultEvent
    | CommonStreamEvent
)

# Events an OBJECT-kind stream may emit (mirrors TS `ObjectStreamEvent`).
ObjectStreamEvent = ObjectDeltaEvent | ObjectFinalEvent | CommonStreamEvent

# Split by kind so executor method signatures carry kind-correctness. Note
# UsageEvent is deliberately NOT a member — it is a builder input only.
AgentEvent = TextStreamEvent | ObjectStreamEvent


@dataclass
class ExecutorCapabilities:
    """Capabilities declared by an Executor. The shared WebhookRunner uses
    these to emit a canonical error when the user invokes an unsupported
    path (e.g. calls an image prompt on an executor with image=False)."""

    text: bool = True
    object: bool = True
    image: bool = False
    speech: bool = False


@dataclass
class ExecCtx:
    """Context handed to every Executor call.

    Carries telemetry + optional cancellation. The `should_stream` flag
    lets executors branch to streaming vs one-shot SDK APIs while keeping
    the same AgentEvent contract; executors may ignore it and always
    stream.
    """

    telemetry: dict[str, Any] | None = None
    trace_id: str | None = None
    prompt_name: str | None = None
    should_stream: bool = True
    # Runtime cancellation: executors should check this periodically
    # and exit cleanly (no AgentEvent post-cancel).
    cancelled: object | None = None
    # Extra dictionary for SDK-specific context (e.g. span handle) —
    # not typed strongly to keep the protocol framework-neutral.
    extra: dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class Executor(Protocol):
    """The public, stable contract every SDK integration implements.

    Ships with ~150 LOC per adapter: translate the SDK's native events
    into AgentEvent. WebhookRunner handles NDJSON encoding, span wrapping,
    and the cloud contract on top.

    BYO-SDK users `from agentmark.prompt_core import Executor` and
    verify their implementation against `executor_conformance`.
    """

    @property
    def name(self) -> str:
        """Stable, human-readable executor name. Surfaced in traces."""
        ...

    def capabilities(self) -> ExecutorCapabilities: ...

    def execute_text(
        self, formatted: Any, ctx: ExecCtx
    ) -> AsyncIterator[TextStreamEvent]:
        """Stream events for a text-kind prompt. `formatted` is whatever the
        paired adapter produced from `adapt_text`. Yields only TextStreamEvents."""
        ...

    def execute_object(
        self, formatted: Any, ctx: ExecCtx
    ) -> AsyncIterator[ObjectStreamEvent]:
        """Stream events for an object-kind prompt. Executors may yield Pydantic
        instances as `ObjectFinalEvent.value` — the runner serializes. Yields
        only ObjectStreamEvents."""
        ...

    # execute_image / execute_speech are optional. Gated by capabilities().
    # Implementers add them as coroutines returning a dict matching the
    # wire response shape; see the BYO-SDK scaffold for the expected shape.
