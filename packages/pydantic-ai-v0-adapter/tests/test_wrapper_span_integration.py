"""Integration test for the experiment wrapper span.

Goal: catch regressions in the wrapper-span attribute contract by
exercising the real chain — webhook → agentmark_sdk.span_context → real
OTel TracerProvider → exported Span — and asserting on the OTel
attributes that the dashboard normalizer actually reads.

What this replaces in test_webhook.py:
  - test_wrapper_span_sets_agentmark_props_and_output
  - test_span_options_carry_all_dataset_fields (+ object variant)
  - test_span_options_metadata_is_none_when_no_commit_sha
  - test_dataset_item_name_falls_back_to_index_when_input_is_none
  - test_multi_item_experiment_increments_index_and_shares_run_id

Those tests all patched `agentmark_sdk.span_context` with a hand-rolled
async-context-manager mock, then asserted that the mock recorded the
expected calls. That structure made the tests a tautology: the
assertions were checking the mock the tests themselves installed, not
the OTel attribute layer the dashboard normalizer actually consumes.

This file installs a real TracerProvider + InMemorySpanExporter and
asserts on the actual exported span attributes:

  agentmark.props   — set by webhook.py for the dataset row's input.
                      The dataset row IS the template variables for that
                      iteration. The normalizer's agentmark-parser maps
                      it to result.props (Test Prompt button gating);
                      AgentMarkTransformer's input fallback maps it to
                      result.input (drawer Input panel).
  agentmark.output  — set by webhook.py for the model's output.
                      AgentMarkTransformer maps it to result.output.

If anyone changes the wrapper to write `agentmark.input` instead of
`agentmark.props`, this test fails — same failure mode as the trace
drawer's Test Prompt button silently gating off in production.
"""

from __future__ import annotations

import json
from contextlib import contextmanager
from typing import Any, AsyncGenerator, Iterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from opentelemetry import trace as otel_trace
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
    InMemorySpanExporter,
)

from agentmark.prompt_core.webhook_runner import _compute_dataset_item_name
from agentmark_pydantic_ai_v0.webhook import PydanticAIWebhookHandler


# ---------------------------------------------------------------------------
# OTel test harness
# ---------------------------------------------------------------------------
@contextmanager
def in_memory_tracing() -> Iterator[InMemorySpanExporter]:
    """Install a real TracerProvider with an in-memory exporter.

    agentmark_sdk.trace_context calls otel_trace.get_tracer("agentmark"),
    which resolves through the *global* TracerProvider. We install our own
    provider for the duration of the test, then restore the previous one.
    SimpleSpanProcessor (not Batch) ensures spans are flushed synchronously
    on span end — no sleeps, no shutdowns needed.
    """
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))

    # opentelemetry's set_tracer_provider has a one-shot guard — it logs a
    # warning but quietly accepts overrides if we reach into the proxy. The
    # supported way is to set _TRACER_PROVIDER directly.
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
# Test data
# ---------------------------------------------------------------------------
TEXT_PROMPT_AST: dict[str, Any] = {
    "type": "root",
    "children": [
        {
            "type": "yaml",
            "value": (
                "name: my-test-prompt\n"
                "text_config:\n  model_name: test\n"
                "test_settings:\n  dataset: ./test.jsonl"
            ),
        }
    ],
    "data": {},
}

OBJECT_PROMPT_AST: dict[str, Any] = {
    "type": "root",
    "children": [
        {
            "type": "yaml",
            "value": (
                "name: my-object-prompt\n"
                "object_config:\n  model_name: test\n  output:\n"
                "    schema:\n      type: object\n"
                "test_settings:\n  dataset: ./test.jsonl"
            ),
        }
    ],
    "data": {},
}


def _make_dataset_reader(items: list[dict[str, Any]]) -> MagicMock:
    """Build a mock reader that yields the given dataset items then terminates."""
    formatted = MagicMock()
    formatted._raw_messages = []
    formatted.user_prompt = "hi"

    side_effects: list[dict[str, Any]] = [
        {"done": False, "value": {"formatted": formatted, "dataset": item, "evals": []}}
        for item in items
    ]
    side_effects.append({"done": True})

    reader = MagicMock()
    reader.read = AsyncMock(side_effect=side_effects)
    dataset = MagicMock()
    dataset.get_reader = MagicMock(return_value=reader)
    return dataset


def _make_run_result(output: Any, total_tokens: int = 42) -> MagicMock:
    """Build a mock pydantic-ai run result.

    Shaped for PydanticAIExecutor's non-streaming experiment path
    (_run_text / _run_object): `output` is the model output,
    `usage()` returns a usage object, and `all_messages()` returns an
    empty history (no tool calls to drain)."""
    usage = MagicMock()
    usage.total_tokens = total_tokens
    usage.request_tokens = 0
    usage.response_tokens = total_tokens
    result = MagicMock()
    result.output = output
    result.usage = MagicMock(return_value=usage)
    result.all_messages = MagicMock(return_value=[])
    return result


def _patch_agent(run_result: MagicMock) -> Any:
    """Patch the Agent the executor constructs so agent.run() returns the
    given mock result. The shared WebhookRunner drives the real
    PydanticAIExecutor, which builds an Agent and awaits agent.run() on the
    non-streaming experiment path — so injecting output happens here, not
    via the removed webhook.run_text_prompt helper."""
    mock_agent = MagicMock()
    mock_agent.run = AsyncMock(return_value=run_result)
    return patch(
        "agentmark_pydantic_ai_v0.executor.Agent",
        MagicMock(return_value=mock_agent),
    )


def _wrapper_spans(exporter: InMemorySpanExporter) -> list[ReadableSpan]:
    """Filter exported spans to the experiment wrapper(s)."""
    return [
        s for s in exporter.get_finished_spans()
        if s.name.startswith("experiment-")
    ]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def mock_client() -> MagicMock:
    client = MagicMock()
    client.eval_registry = None
    return client


@pytest.fixture
def handler(mock_client: MagicMock) -> PydanticAIWebhookHandler:
    return PydanticAIWebhookHandler(mock_client)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
class TestExperimentWrapperSpan:
    """Verify the wrapper span carries the attributes the dashboard reads.

    Wrapper spans emit under the "agentmark" tracer scope, so they route
    through AgentMarkTransformer + agentmark-parser in shared-utils. The
    contract here:
      - agentmark.props → result.props (parser; Test Prompt button)
      - agentmark.props → result.input  (transformer fallback; drawer
                                         Input panel)
      - agentmark.output → result.output (transformer)

    Pre-fix, AgentMarkTransformer didn't have the props→input fallback,
    so wrapper spans rendered with empty Input panels. We over-corrected
    by sed-flipping every adapter to write `agentmark.input` instead;
    that erased `result.props` (parser only reads `agentmark.props`),
    silently disabling the Test Prompt button on every span. Final state:
    adapters write `agentmark.props` (semantic key for template vars);
    the transformer fallback covers the input side. This test pins that
    contract on the real OTel attribute layer.
    """

    async def test_text_experiment_wrapper_carries_input_and_output(
        self,
        handler: PydanticAIWebhookHandler,
        mock_client: MagicMock,
    ) -> None:
        dataset_input = {"topic": "sunsets"}
        model_output = "Sunsets are beautiful."

        mock_dataset = _make_dataset_reader([
            {"input": dataset_input, "expected_output": "a poem"},
        ])
        mock_prompt = MagicMock()
        mock_prompt.format_with_dataset = AsyncMock(return_value=mock_dataset)
        mock_client.load_text_prompt = AsyncMock(return_value=mock_prompt)

        run_result = _make_run_result(model_output)

        with in_memory_tracing() as exporter, _patch_agent(run_result):
            stream_result = await handler.run_experiment(
                TEXT_PROMPT_AST, "my-experiment", commit_sha="deadbeef1234",
            )
            async for _ in stream_result["stream"]:
                pass

        spans = _wrapper_spans(exporter)
        assert len(spans) == 1, (
            f"Expected one experiment wrapper span, got {len(spans)}: "
            f"{[s.name for s in spans]}"
        )
        wrapper = spans[0]

        # Tracer scope must be "agentmark" — this is what determines which
        # normalizer transformer the span routes through. If the scope changes
        # the I/O-key contract changes too. Pin it explicitly.
        assert wrapper.instrumentation_scope.name == "agentmark"

        # Span name carries the iteration index — used in trace drawer headers.
        assert wrapper.name == "experiment-my-experiment-0"

        attrs = dict(wrapper.attributes or {})

        # Core regression: agentmark.input / agentmark.output must be present
        # AND they must be JSON-encoded payloads (serialize_value returns
        # JSON, not raw repr). Decoding back must yield the original values.
        assert "agentmark.props" in attrs
        assert "agentmark.output" in attrs
        assert json.loads(attrs["agentmark.props"]) == dataset_input
        assert json.loads(attrs["agentmark.output"]) == model_output

        # Dataset metadata — the experiments table reads these via the
        # SpanOptions → set_agentmark_attributes path. A regression that
        # drops one field shows up here as a missing key.
        assert attrs["agentmark.prompt_name"] == "my-test-prompt"
        assert attrs["agentmark.dataset_run_name"] == "my-experiment"
        assert attrs["agentmark.dataset_input"] == json.dumps(dataset_input)
        assert attrs["agentmark.dataset_expected_output"] == json.dumps("a poem")
        assert attrs["agentmark.dataset_path"] == "./test.jsonl"
        assert isinstance(attrs.get("agentmark.dataset_run_id"), str)
        assert len(attrs["agentmark.dataset_run_id"]) > 0

        # dataset_item_name is the 12-char md5 of the canonical-JSON input.
        # Use the runner's own function — it stringifies with compact
        # separators (matching TS stableStringify), so a hand-rolled
        # json.dumps with default separators produces a different digest.
        expected_hash = _compute_dataset_item_name(dataset_input, 0)
        assert attrs["agentmark.dataset_item_name"] == expected_hash

    async def test_object_experiment_wrapper_carries_input_and_output(
        self,
        handler: PydanticAIWebhookHandler,
        mock_client: MagicMock,
    ) -> None:
        """Object-prompt path is a separate code branch in webhook.py
        (_stream_object_experiment vs _stream_text_experiment); it has its
        own `async with span_context(...)` block. A previous regression
        (commit 64a9333b2) fixed the object path specifically. Cover both.
        """
        dataset_input = {"topic": "sunsets"}
        model_output = {"answer": 42}

        mock_dataset = _make_dataset_reader([
            {"input": dataset_input, "expected_output": {"answer": 42}},
        ])
        mock_object_prompt = MagicMock()
        mock_object_prompt.format_with_dataset = AsyncMock(return_value=mock_dataset)
        mock_client.load_object_prompt = AsyncMock(return_value=mock_object_prompt)

        run_result = _make_run_result(model_output)

        with in_memory_tracing() as exporter, _patch_agent(run_result):
            stream_result = await handler.run_experiment(
                OBJECT_PROMPT_AST, "my-experiment",
            )
            async for _ in stream_result["stream"]:
                pass

        spans = _wrapper_spans(exporter)
        assert len(spans) == 1
        attrs = dict(spans[0].attributes or {})

        assert json.loads(attrs["agentmark.props"]) == dataset_input
        assert json.loads(attrs["agentmark.output"]) == model_output
        assert attrs["agentmark.prompt_name"] == "my-object-prompt"

    async def test_multi_item_dataset_emits_one_wrapper_per_item(
        self,
        handler: PydanticAIWebhookHandler,
        mock_client: MagicMock,
    ) -> None:
        """Each dataset item gets its own wrapper span with its own I/O,
        all sharing one dataset_run_id. A regression that aliases run_id
        per-item (or skips per-item set_input/set_output) fails here.
        """
        items = [
            {"input": {"q": "first"}, "expected_output": "a1"},
            {"input": {"q": "second"}, "expected_output": "a2"},
        ]
        outputs = ["answer one", "answer two"]

        mock_dataset = _make_dataset_reader(items)
        mock_prompt = MagicMock()
        mock_prompt.format_with_dataset = AsyncMock(return_value=mock_dataset)
        mock_client.load_text_prompt = AsyncMock(return_value=mock_prompt)

        # The executor builds a fresh Agent per item and calls agent.run()
        # once each. A shared mock Agent with a side_effect list serves a
        # distinct result per call. Each result maps to the item the
        # executor is currently running; we recover input→output pairing
        # from the span attributes below (parallel completion order makes
        # call order non-deterministic, so we don't rely on it).
        mock_agent = MagicMock()
        mock_agent.run = AsyncMock(
            side_effect=[_make_run_result(o) for o in outputs]
        )

        # concurrency=1 makes per-item agent.run() calls execute in dataset
        # order, so the side_effect list maps result[i] → item[i]. This test
        # pins the input↔output pairing per row, which requires deterministic
        # sequencing; the parallel default would let outputs race across rows.
        with in_memory_tracing() as exporter, patch(
            "agentmark_pydantic_ai_v0.executor.Agent",
            MagicMock(return_value=mock_agent),
        ):
            stream_result = await handler.run_experiment(
                TEXT_PROMPT_AST, "multi-run", concurrency=1,
            )
            async for _ in stream_result["stream"]:
                pass

        spans = sorted(_wrapper_spans(exporter), key=lambda s: s.name)
        assert [s.name for s in spans] == [
            "experiment-multi-run-0",
            "experiment-multi-run-1",
        ]

        per_attrs = [dict(s.attributes or {}) for s in spans]

        # Each wrapper carries its OWN input/output.
        assert json.loads(per_attrs[0]["agentmark.props"]) == {"q": "first"}
        assert json.loads(per_attrs[0]["agentmark.output"]) == "answer one"
        assert json.loads(per_attrs[1]["agentmark.props"]) == {"q": "second"}
        assert json.loads(per_attrs[1]["agentmark.output"]) == "answer two"

        # Run ID is shared across iterations — one experiment, one run.
        run_ids = {a["agentmark.dataset_run_id"] for a in per_attrs}
        assert len(run_ids) == 1, (
            f"Expected one shared dataset_run_id across iterations, got {run_ids}"
        )

    async def test_no_commit_sha_omits_metadata_attribute(
        self,
        handler: PydanticAIWebhookHandler,
        mock_client: MagicMock,
    ) -> None:
        """When commit_sha is not provided, no metadata attribute is emitted.
        Pre-fix this path produced a {"commit_sha": None} dict, which the
        normalizer rendered as a "commit: null" badge in the trace drawer.
        """
        mock_dataset = _make_dataset_reader([
            {"input": {"x": 1}, "expected_output": "ok"},
        ])
        mock_prompt = MagicMock()
        mock_prompt.format_with_dataset = AsyncMock(return_value=mock_dataset)
        mock_client.load_text_prompt = AsyncMock(return_value=mock_prompt)

        with in_memory_tracing() as exporter, _patch_agent(
            _make_run_result("done")
        ):
            stream_result = await handler.run_experiment(
                TEXT_PROMPT_AST, "no-commit",
            )
            async for _ in stream_result["stream"]:
                pass

        attrs = dict(_wrapper_spans(exporter)[0].attributes or {})
        # Either the key is absent, or it carries no commit_sha — never
        # the string "null" or a sentinel.
        commit_attrs = [k for k in attrs if "commit" in k]
        assert commit_attrs == [], (
            f"No commit_sha was passed but found commit-related attrs: {commit_attrs}"
        )

    async def test_dataset_item_name_falls_back_to_index_for_null_input(
        self,
        handler: PydanticAIWebhookHandler,
        mock_client: MagicMock,
    ) -> None:
        """When a dataset item has input=None, dataset_item_name falls back
        to the iteration index (no md5 of None). This is what the experiments
        table renders as the row label.
        """
        mock_dataset = _make_dataset_reader([
            {"input": None, "expected_output": "ok"},
        ])
        mock_prompt = MagicMock()
        mock_prompt.format_with_dataset = AsyncMock(return_value=mock_dataset)
        mock_client.load_text_prompt = AsyncMock(return_value=mock_prompt)

        with in_memory_tracing() as exporter, _patch_agent(
            _make_run_result("done")
        ):
            stream_result = await handler.run_experiment(
                TEXT_PROMPT_AST, "null-input",
            )
            async for _ in stream_result["stream"]:
                pass

        attrs = dict(_wrapper_spans(exporter)[0].attributes or {})
        assert attrs["agentmark.dataset_item_name"] == "0"
