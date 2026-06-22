"""Behavioral tests for the AgentMark trace-grouping context + processor.

Exercises :func:`with_agentmark` and :class:`AgentMarkGroupingProcessor` against
a real ``TracerProvider`` + in-memory exporter: spans started inside a grouping
scope must carry the ``agentmark.*`` attributes, spans outside must carry none,
nested scopes must merge (inner wins), and — the critical case — concurrent
asyncio scopes must stay isolated with zero cross-bleed.
"""

from __future__ import annotations

import asyncio

import pytest
from opentelemetry.sdk.trace import ReadableSpan, Tracer, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
    InMemorySpanExporter,
)

from agentmark_sdk import AgentMarkGroupingProcessor, with_agentmark


@pytest.fixture()
def harness() -> tuple[Tracer, InMemorySpanExporter]:
    """A TracerProvider wired with the grouping processor + an in-memory export.

    The grouping processor is registered *before* the export processor so the
    attributes it stamps at ``on_start`` are present when the export processor
    reads the finished span at ``on_end``.
    """
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(AgentMarkGroupingProcessor())
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    tracer = provider.get_tracer("grouping-test")
    return tracer, exporter


def _attrs_of(span: ReadableSpan) -> dict[str, object]:
    return dict(span.attributes or {})


def _only(exporter: InMemorySpanExporter, name: str) -> ReadableSpan:
    spans = [s for s in exporter.get_finished_spans() if s.name == name]
    assert len(spans) == 1, f"expected exactly one span named {name!r}, got {len(spans)}"
    return spans[0]


def test_span_inside_scope_carries_grouping(
    harness: tuple[Tracer, InMemorySpanExporter],
) -> None:
    """A span started inside with_agentmark carries the full agentmark.* set."""
    tracer, exporter = harness

    with with_agentmark(
        session_id="sess-1",
        session_name="Support chat",
        user_id="user-1",
        trace_name="handle-message",
        tags=["prod", "beta"],
        metadata={"feature": "support", "retries": 2},
    ):
        with tracer.start_as_current_span("inside"):
            pass

    attrs = _attrs_of(_only(exporter, "inside"))
    assert attrs == {
        "agentmark.session_id": "sess-1",
        "agentmark.session_name": "Support chat",
        "agentmark.user_id": "user-1",
        "agentmark.trace_name": "handle-message",
        "agentmark.tags": '["prod","beta"]',
        "agentmark.metadata.feature": "support",
        "agentmark.metadata.retries": "2",
    }


def test_span_outside_scope_carries_no_grouping(
    harness: tuple[Tracer, InMemorySpanExporter],
) -> None:
    """A span started with no active grouping carries no agentmark.* attrs."""
    tracer, exporter = harness

    with tracer.start_as_current_span("outside"):
        pass

    attrs = _attrs_of(_only(exporter, "outside"))
    agentmark_keys = {k for k in attrs if k.startswith("agentmark.")}
    assert agentmark_keys == set()


def test_scope_ends_cleanly(
    harness: tuple[Tracer, InMemorySpanExporter],
) -> None:
    """After the with-block exits, later spans are ungrouped again (detach)."""
    tracer, exporter = harness

    with with_agentmark(session_id="sess-1"):
        with tracer.start_as_current_span("during"):
            pass
    with tracer.start_as_current_span("after"):
        pass

    assert _attrs_of(_only(exporter, "during")) == {"agentmark.session_id": "sess-1"}
    after_keys = {
        k for k in _attrs_of(_only(exporter, "after")) if k.startswith("agentmark.")
    }
    assert after_keys == set()


def test_nested_scopes_merge_inner_wins_outer_preserved(
    harness: tuple[Tracer, InMemorySpanExporter],
) -> None:
    """Nesting merges: the inner session_id overrides, the outer user_id rides
    through, and on exiting the inner scope the outer value is restored."""
    tracer, exporter = harness

    with with_agentmark(session_id="outer", user_id="user-1"):
        with tracer.start_as_current_span("outer-span"):
            pass
        with with_agentmark(session_id="inner"):
            with tracer.start_as_current_span("inner-span"):
                pass
        with tracer.start_as_current_span("outer-again"):
            pass

    # Outer scope: outer session + user.
    assert _attrs_of(_only(exporter, "outer-span")) == {
        "agentmark.session_id": "outer",
        "agentmark.user_id": "user-1",
    }
    # Inner scope: inner session wins, outer user preserved.
    assert _attrs_of(_only(exporter, "inner-span")) == {
        "agentmark.session_id": "inner",
        "agentmark.user_id": "user-1",
    }
    # Back in the outer scope: the outer session is restored (no inner bleed).
    assert _attrs_of(_only(exporter, "outer-again")) == {
        "agentmark.session_id": "outer",
        "agentmark.user_id": "user-1",
    }


@pytest.mark.asyncio
async def test_concurrent_scopes_are_isolated(
    harness: tuple[Tracer, InMemorySpanExporter],
) -> None:
    """CRITICAL: interleaved with_agentmark scopes under asyncio.gather must not
    bleed into one another. Each task opens its own grouping, yields the event
    loop (so the tasks interleave mid-scope), then creates a span — and that
    span must carry ONLY its own task's session_id.

    OTel's context is contextvars-backed and asyncio copies the context per
    task, so each task's attach/detach is private. A regression that stashed the
    grouping in shared module state (instead of the OTel context) would show up
    here as cross-bleed.
    """
    tracer, exporter = harness

    async def one(session: str, delay: float) -> None:
        with with_agentmark(session_id=session, user_id=f"user-{session}"):
            # Yield so the scheduler interleaves all tasks while each holds its
            # own active grouping — the contended window.
            await asyncio.sleep(delay)
            with tracer.start_as_current_span(f"span-{session}"):
                await asyncio.sleep(delay)

    sessions = ["a", "b", "c", "d", "e"]
    # Staggered delays force interleaving rather than serial execution.
    await asyncio.gather(
        *(one(s, delay=0.01 * (i % 3)) for i, s in enumerate(sessions))
    )

    for session in sessions:
        attrs = _attrs_of(_only(exporter, f"span-{session}"))
        assert attrs == {
            "agentmark.session_id": session,
            "agentmark.user_id": f"user-{session}",
        }, f"span-{session} saw foreign grouping: {attrs}"
