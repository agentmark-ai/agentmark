"""Group AgentMark traces by session, user, and metadata.

The Python twin of the TypeScript ``@agentmark-ai/otel`` package. This is a
framework-agnostic OpenTelemetry helper: :func:`with_agentmark` stashes grouping
attributes in the OTel context, and :class:`AgentMarkGroupingProcessor` stamps
them onto every span started in that scope (using the attribute keys AgentMark's
normalizer reads). Both languages must produce the identical mapping so trace
grouping stays consistent across SDKs — the contract lives in
``conformance-vectors/vectors/grouping-attributes.json``.

Unlike the TS processor, :class:`AgentMarkGroupingProcessor` only *enriches*
spans; it does not export. The Python SDK already registers its own export
processors (see :class:`agentmark_sdk.AgentMarkSDK`), so this processor is purely
additive and safe to layer alongside them.

Example:
    from agentmark_sdk import with_agentmark, AgentMarkGroupingProcessor

    provider.add_span_processor(AgentMarkGroupingProcessor())

    with with_agentmark(session_id="sess-1", user_id="user-1", tags=["prod"]):
        # every span started here (sync or async) inherits the grouping
        ...
"""

from __future__ import annotations

import contextlib
import json
from typing import Any, Iterator

from opentelemetry.context import (
    attach,
    create_key,
    detach,
    get_value,
    set_value,
)
from opentelemetry.context.context import Context
from opentelemetry.sdk.trace import ReadableSpan, Span, SpanProcessor

# Module-level OTel context key under which the merged grouping attributes ride.
# ``create_key`` returns a process-unique opaque token, so this never collides
# with another library's context entry. Mirrors the TS
# ``createContextKey('agentmark.grouping.attributes')``.
_AGENTMARK_ATTRS_KEY = create_key("agentmark.grouping.attributes")


def to_agentmark_attributes(
    *,
    session_id: str | None = None,
    session_name: str | None = None,
    user_id: str | None = None,
    trace_name: str | None = None,
    tags: list[Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Translate the friendly grouping API into AgentMark span-attribute keys.

    Session / user / name fields land under ``agentmark.*``, custom metadata
    under ``agentmark.metadata.*``, and tags under ``agentmark.tags`` — the keys
    AgentMark's normalizer promotes universally, for any span scope. All values
    are strings. Tags and object/array metadata use *compact* JSON (no spaces)
    so the output byte-matches the TypeScript ``JSON.stringify`` /
    ``@agentmark-ai/otel`` mapping.

    ``None`` fields are omitted entirely, as are empty tag lists and
    ``None``-valued metadata entries.

    Args:
        session_id: Groups spans into a session. → ``agentmark.session_id``.
        session_name: Human-readable session label. → ``agentmark.session_name``.
        user_id: Associates the trace with an end user. → ``agentmark.user_id``.
        trace_name: Names the trace. → ``agentmark.trace_name``.
        tags: List of string tags, serialized as compact JSON to
            ``agentmark.tags`` (omitted when empty or ``None``).
        metadata: Arbitrary key/value pairs. Each non-``None`` value lands under
            ``agentmark.metadata.<key>``; dict/list values use compact JSON,
            scalars use ``str()``.

    Returns:
        A flat ``dict[str, str]`` of OTel attribute keys to string values.
    """
    out: dict[str, str] = {}

    # Scalar fields: stringify only when present. ``str()`` matches the TS
    # ``String(value)`` for the string inputs this contract carries.
    def _set(key: str, value: Any) -> None:
        if value is not None:
            out[f"agentmark.{key}"] = str(value)

    _set("session_id", session_id)
    _set("session_name", session_name)
    _set("user_id", user_id)
    _set("trace_name", trace_name)

    if isinstance(tags, list) and len(tags) > 0:
        out["agentmark.tags"] = json.dumps(tags, separators=(",", ":"))

    if isinstance(metadata, dict):
        for key, value in metadata.items():
            if value is None:
                continue
            if isinstance(value, (dict, list)):
                out[f"agentmark.metadata.{key}"] = json.dumps(
                    value, separators=(",", ":")
                )
            else:
                out[f"agentmark.metadata.{key}"] = str(value)

    return out


@contextlib.contextmanager
def with_agentmark(
    *,
    session_id: str | None = None,
    session_name: str | None = None,
    user_id: str | None = None,
    trace_name: str | None = None,
    tags: list[Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> Iterator[None]:
    """Activate AgentMark grouping for the duration of the ``with`` block.

    Every span started inside — sync or async, at any depth — is stamped with
    the grouping by :class:`AgentMarkGroupingProcessor`. Nesting *merges*: the
    inner scope's fields override the outer scope's, while unset outer fields are
    preserved. Because the OTel context is ``contextvars``-backed, concurrent
    scopes (e.g. under :func:`asyncio.gather`) stay isolated — each task sees
    only its own grouping.

    Requires :class:`AgentMarkGroupingProcessor` to be registered on the active
    ``TracerProvider`` for the attributes to reach spans.

    Args:
        session_id: See :func:`to_agentmark_attributes`.
        session_name: See :func:`to_agentmark_attributes`.
        user_id: See :func:`to_agentmark_attributes`.
        trace_name: See :func:`to_agentmark_attributes`.
        tags: See :func:`to_agentmark_attributes`.
        metadata: See :func:`to_agentmark_attributes`.

    Yields:
        ``None`` — use as a bare context manager.
    """
    attrs = to_agentmark_attributes(
        session_id=session_id,
        session_name=session_name,
        user_id=user_id,
        trace_name=trace_name,
        tags=tags,
        metadata=metadata,
    )

    # Merge over any grouping already active so nested scopes inherit the outer
    # fields (inner overrides outer). A fresh dict avoids mutating the parent's.
    previous = get_value(_AGENTMARK_ATTRS_KEY)
    merged: dict[str, str] = {}
    if isinstance(previous, dict):
        merged.update(previous)
    merged.update(attrs)

    token = attach(set_value(_AGENTMARK_ATTRS_KEY, merged))
    try:
        yield
    finally:
        detach(token)


class AgentMarkGroupingProcessor(SpanProcessor):
    """Stamps the active AgentMark grouping attributes onto each span at start.

    Reads the merged grouping dict that :func:`with_agentmark` stashed in the
    OTel context and, when present, applies it to the starting span via
    :meth:`opentelemetry.sdk.trace.Span.set_attributes`. This processor is
    *enrichment-only* — ``on_end`` / ``shutdown`` / ``force_flush`` are no-ops —
    so it composes alongside the SDK's export processors without exporting twice.
    """

    def on_start(self, span: Span, parent_context: Context | None = None) -> None:
        """Apply the active grouping attributes (if any) to the starting span."""
        attrs = get_value(_AGENTMARK_ATTRS_KEY, parent_context)
        if isinstance(attrs, dict) and attrs:
            span.set_attributes(attrs)

    def on_end(self, span: ReadableSpan) -> None:
        """No-op: this processor does not export spans."""

    def shutdown(self) -> None:
        """No-op: there is nothing to tear down."""

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        """No-op flush; always reports success."""
        return True
