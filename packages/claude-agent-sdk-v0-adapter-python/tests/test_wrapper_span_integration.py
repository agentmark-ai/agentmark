"""Integration test for the experiment wrapper span (Claude Agent SDK adapter).

Same shape as the pydantic-ai-v0-adapter integration test — exercises
the real chain: webhook → agentmark_sdk.span_context → real OTel
TracerProvider → exported Span. Asserts on the OTel attributes the
dashboard normalizer (agentmark-parser + AgentMarkTransformer) reads.

What this replaces in test_webhook.py:
  - TestRunExperimentSampling::test_wrapper_span_sets_agentmark_props_and_output
  - TestRunExperimentSampling::test_span_options_carry_all_dataset_fields
  - TestSpanOptionsObjectConfig::test_span_options_carry_all_dataset_fields_object_config
  - TestSpanOptionsEdgeCases::test_span_options_metadata_is_none_when_no_commit_sha
  - TestSpanOptionsEdgeCases::test_dataset_item_name_falls_back_to_index_when_input_is_none

Those tests all patched `agentmark_sdk.span_context` with a hand-rolled
fake context manager and asserted on the mock the test itself installed
— a tautology, not a contract test. This file installs a real OTel
TracerProvider with an InMemorySpanExporter and asserts on actual
exported span attributes. The contract: wrapper spans write
`agentmark.props` (template vars from the dataset row) and
`agentmark.output` (the model's output) — the parser maps props to
result.props (Test Prompt button), the transformer's input fallback
maps it to result.input (drawer Input panel).
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import AsyncGenerator
from contextlib import contextmanager
from typing import Any, Iterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from opentelemetry import trace as otel_trace
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
    InMemorySpanExporter,
)

from agentmark_claude_agent_sdk_v0.webhook import ClaudeAgentWebhookHandler

from tests.test_webhook import (  # noqa: E402 — re-using existing fixtures
    TRACED_QUERY_PATH,
    create_mock_ast,
    create_mock_client,
    make_mock_traced_query_from_gen,
)


# ---------------------------------------------------------------------------
# OTel test harness (same pattern as pydantic-ai-v0-adapter integration test)
# ---------------------------------------------------------------------------
@contextmanager
def in_memory_tracing() -> Iterator[InMemorySpanExporter]:
    """Install a real TracerProvider with an in-memory exporter.

    agentmark_sdk.trace_context calls otel_trace.get_tracer("agentmark"),
    which resolves through the global TracerProvider. We swap in our own
    provider for the test, then restore. SimpleSpanProcessor flushes
    spans synchronously on span end.
    """
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))

    previous = otel_trace._TRACER_PROVIDER  # type: ignore[attr-defined]
    otel_trace._TRACER_PROVIDER_SET_ONCE._done = False  # type: ignore[attr-defined]
    otel_trace.set_tracer_provider(provider)

    try:
        yield exporter
    finally:
        otel_trace._TRACER_PROVIDER_SET_ONCE._done = False  # type: ignore[attr-defined]
        if previous is not None:
            otel_trace.set_tracer_provider(previous)
        provider.shutdown()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _wrapper_spans(exporter: InMemorySpanExporter) -> list[ReadableSpan]:
    """Filter exported spans to the experiment wrapper(s).

    The traced_query() inside the wrapper creates an `invoke_agent` child
    span; we want only the outer experiment-* span here.
    """
    return [
        s for s in exporter.get_finished_spans()
        if s.name.startswith("experiment-")
    ]


class _DatasetReader:
    """Reader draining an async generator one item at a time.

    Mirrors prompt-core's ``SimpleDatasetReader.read()`` contract
    (``{"done": bool, "value": item}``) so it can drive ``run_dataset_pool``.
    """

    def __init__(self, agen: AsyncGenerator[dict[str, Any], None]) -> None:
        self._agen = agen

    async def read(self) -> dict[str, Any]:
        try:
            value = await self._agen.__anext__()
        except StopAsyncIteration:
            return {"done": True}
        return {"done": False, "value": value}


class _DatasetStream:
    """Stream exposing ``get_reader()`` — matches the real ``format_with_dataset``
    return type (``SimpleDatasetStream`` / ``FileDatasetStream``) now that the
    experiment runner drives the dataset through ``get_reader()``."""

    def __init__(self, agen: AsyncGenerator[dict[str, Any], None]) -> None:
        self._agen = agen

    def get_reader(self) -> _DatasetReader:
        return _DatasetReader(self._agen)


def _make_dataset(items: list[dict[str, Any]]):
    """Build a dataset stream matching the format_with_dataset
    return shape expected by webhook.py."""
    async def _gen() -> AsyncGenerator[dict[str, Any], None]:
        for item in items:
            yield {
                "formatted": MagicMock(
                    query=MagicMock(prompt="test", options=MagicMock()),
                    telemetry=MagicMock(is_enabled=True, prompt_name="test"),
                ),
                "dataset": item,
                "evals": [],
            }
    return _DatasetStream(_gen())


def _query_result(text: str = "hello", structured: Any = None) -> Any:
    """Build a single-result async-generator factory for traced_query mock."""
    async def _gen() -> AsyncGenerator[dict[str, Any], None]:
        yield {
            "type": "result",
            "subtype": "success",
            "result": text,
            **({"structured_output": structured} if structured is not None else {}),
            "usage": {"input_tokens": 10, "output_tokens": 5},
        }
    return _gen


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def mock_client() -> MagicMock:
    return create_mock_client()


@pytest.fixture
def handler(mock_client: MagicMock) -> ClaudeAgentWebhookHandler:
    return ClaudeAgentWebhookHandler(mock_client)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
class TestExperimentWrapperSpan:
    """Verify the wrapper span carries the attributes the dashboard reads.

    Contract:
      - agentmark.props  → result.props  (parser; Test Prompt button)
      - agentmark.props  → result.input  (transformer fallback; drawer
                                          Input panel)
      - agentmark.output → result.output (transformer)

    Wrapper spans emit under the "agentmark" tracer scope so they route
    through AgentMarkTransformer + agentmark-parser. Both depend on
    `agentmark.props` carrying the dataset row's template variables.
    """

    async def test_text_experiment_wrapper_carries_input_and_output(
        self,
        handler: ClaudeAgentWebhookHandler,
        mock_client: MagicMock,
    ) -> None:
        dataset_input = {"q": "hi"}
        model_output = "hello world"

        mock_client._mock_text_prompt.format_with_dataset.return_value = _make_dataset([
            {"input": dataset_input, "expected_output": "ok"},
        ])

        with in_memory_tracing() as exporter, patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ), patch(TRACED_QUERY_PATH, make_mock_traced_query_from_gen(
            _query_result(text=model_output),
        )):
            result = await handler.run_experiment(
                create_mock_ast(), "my-experiment", commit_sha="deadbeef1234",
            )
            async for _ in result.stream:
                pass

        spans = _wrapper_spans(exporter)
        assert len(spans) == 1, (
            f"Expected one experiment wrapper span, got {len(spans)}: "
            f"{[s.name for s in spans]}"
        )
        wrapper = spans[0]

        # Tracer scope must be "agentmark" — determines which transformer
        # the dashboard normalizer routes through. If the scope changes
        # the I/O-key contract changes too. Pin it explicitly.
        assert wrapper.instrumentation_scope.name == "agentmark"
        assert wrapper.name == "experiment-my-experiment-0"

        attrs = dict(wrapper.attributes or {})

        # Core regression: agentmark.input / agentmark.output must be
        # present AND JSON-encoded (serialize_value returns JSON).
        assert "agentmark.props" in attrs
        assert "agentmark.output" in attrs
        assert json.loads(attrs["agentmark.props"]) == dataset_input
        assert json.loads(attrs["agentmark.output"]) == model_output

        # Dataset metadata fields — set_agentmark_attributes copies these
        # off the SpanOptions. A regression dropping any field shows up
        # here as a missing key.
        assert attrs["agentmark.prompt_name"] == "experiment-prompt"
        assert attrs["agentmark.dataset_run_name"] == "my-experiment"
        assert attrs["agentmark.dataset_input"] == json.dumps(dataset_input)
        assert attrs["agentmark.dataset_expected_output"] == json.dumps("ok")
        assert attrs["agentmark.dataset_path"] == "./test.jsonl"
        assert isinstance(attrs.get("agentmark.dataset_run_id"), str)
        assert len(attrs["agentmark.dataset_run_id"]) > 0

        expected_hash = hashlib.md5(
            json.dumps(dataset_input, sort_keys=True, default=str).encode()
        ).hexdigest()[:12]
        assert attrs["agentmark.dataset_item_name"] == expected_hash

    async def test_object_experiment_wrapper_carries_input_and_output(
        self,
        handler: ClaudeAgentWebhookHandler,
        mock_client: MagicMock,
    ) -> None:
        """Object-prompt path is a separate code branch (load_object_prompt
        + structured_output unwrap). Cover it explicitly — a previous
        regression fixed only the text path while leaving object broken.
        """
        dataset_input = {"q": "what's 6*7?"}
        structured = {"answer": 42}

        mock_client._mock_object_prompt.format_with_dataset.return_value = _make_dataset([
            {"input": dataset_input, "expected_output": structured},
        ])

        with in_memory_tracing() as exporter, patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                # webhook.py routes via `bool(frontmatter.get("object_config"))`
                # — an empty dict is falsy and would silently take the text
                # path. Use a non-empty payload to keep the object route.
                "object_config": {"output": {}},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ), patch(TRACED_QUERY_PATH, make_mock_traced_query_from_gen(
            _query_result(text="", structured=structured),
        )):
            result = await handler.run_experiment(
                create_mock_ast(), "my-experiment",
            )
            async for _ in result.stream:
                pass

        spans = _wrapper_spans(exporter)
        assert len(spans) == 1
        attrs = dict(spans[0].attributes or {})

        assert json.loads(attrs["agentmark.props"]) == dataset_input
        assert json.loads(attrs["agentmark.output"]) == structured

    async def test_multi_item_dataset_emits_one_wrapper_per_item(
        self,
        handler: ClaudeAgentWebhookHandler,
        mock_client: MagicMock,
    ) -> None:
        """Each dataset item gets its own wrapper span with its own I/O,
        all sharing one dataset_run_id. A regression that aliases run_id
        per-item or skips per-item set_input/set_output fails here.
        """
        items = [
            {"input": {"q": "first"}, "expected_output": "a1"},
            {"input": {"q": "second"}, "expected_output": "a2"},
        ]
        outputs = ["answer one", "answer two"]

        mock_client._mock_text_prompt.format_with_dataset.return_value = _make_dataset(items)

        # traced_query is invoked once per item; each call yields a fresh
        # generator with that item's output. Since traced_query is patched
        # globally with a single async-generator-factory, we route the
        # iteration index through a counter.
        output_iter = iter(outputs)

        async def _query_each(adapted: Any, *, default_mcp_servers: Any = None):
            text = next(output_iter)
            yield {
                "type": "result",
                "subtype": "success",
                "result": text,
                "usage": {"input_tokens": 1, "output_tokens": 1},
            }
        # Wrap into a typed-message converter, same as TRACED_QUERY_PATH normally
        from tests.test_webhook import _to_sdk_message

        async def _query_each_typed(adapted: Any, *, default_mcp_servers: Any = None):
            async for d in _query_each(adapted, default_mcp_servers=default_mcp_servers):
                yield _to_sdk_message(d)

        with in_memory_tracing() as exporter, patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ), patch(TRACED_QUERY_PATH, _query_each_typed):
            result = await handler.run_experiment(create_mock_ast(), "multi-run")
            async for _ in result.stream:
                pass

        spans = sorted(_wrapper_spans(exporter), key=lambda s: s.name)
        assert [s.name for s in spans] == [
            "experiment-multi-run-0",
            "experiment-multi-run-1",
        ]

        per_attrs = [dict(s.attributes or {}) for s in spans]
        assert json.loads(per_attrs[0]["agentmark.props"]) == {"q": "first"}
        assert json.loads(per_attrs[0]["agentmark.output"]) == "answer one"
        assert json.loads(per_attrs[1]["agentmark.props"]) == {"q": "second"}
        assert json.loads(per_attrs[1]["agentmark.output"]) == "answer two"

        run_ids = {a["agentmark.dataset_run_id"] for a in per_attrs}
        assert len(run_ids) == 1, (
            f"Expected one shared dataset_run_id across iterations, got {run_ids}"
        )

    async def test_no_commit_sha_omits_metadata_attribute(
        self,
        handler: ClaudeAgentWebhookHandler,
        mock_client: MagicMock,
    ) -> None:
        """When commit_sha is not provided, no commit_sha attribute is
        emitted. Pre-fix this path produced a {"commit_sha": None} dict
        rendered as a "commit: null" badge in the trace drawer.
        """
        mock_client._mock_text_prompt.format_with_dataset.return_value = _make_dataset([
            {"input": {"x": 1}, "expected_output": "ok"},
        ])

        with in_memory_tracing() as exporter, patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ), patch(TRACED_QUERY_PATH, make_mock_traced_query_from_gen(
            _query_result(text="done"),
        )):
            result = await handler.run_experiment(create_mock_ast(), "no-commit")
            async for _ in result.stream:
                pass

        attrs = dict(_wrapper_spans(exporter)[0].attributes or {})
        commit_attrs = [k for k in attrs if "commit" in k]
        assert commit_attrs == [], (
            f"No commit_sha was passed but found commit-related attrs: {commit_attrs}"
        )

    async def test_dataset_item_name_falls_back_to_index_for_null_input(
        self,
        handler: ClaudeAgentWebhookHandler,
        mock_client: MagicMock,
    ) -> None:
        """When a dataset item has input=None, dataset_item_name falls
        back to the iteration index (no md5 of None)."""
        mock_client._mock_text_prompt.format_with_dataset.return_value = _make_dataset([
            {"input": None, "expected_output": "ok"},
        ])

        with in_memory_tracing() as exporter, patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ), patch(TRACED_QUERY_PATH, make_mock_traced_query_from_gen(
            _query_result(text="done"),
        )):
            result = await handler.run_experiment(create_mock_ast(), "null-input")
            async for _ in result.stream:
                pass

        attrs = dict(_wrapper_spans(exporter)[0].attributes or {})
        assert attrs["agentmark.dataset_item_name"] == "0"
