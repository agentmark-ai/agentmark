"""Tests for AgentmarkSampler."""

from __future__ import annotations

from opentelemetry.sdk.trace.sampling import Decision

from agentmark_sdk import AgentmarkSampler


class TestAgentmarkSampler:
    """Tests for AgentmarkSampler class."""

    def test_sample_normal_span(self) -> None:
        """Test that normal spans are sampled."""
        sampler = AgentmarkSampler()

        result = sampler.should_sample(
            parent_context=None,
            trace_id=123456,
            name="my-span",
            attributes={"key": "value"},
        )

        assert result.decision == Decision.RECORD_AND_SAMPLE

    def test_sample_span_without_attributes(self) -> None:
        """Test that spans without attributes are sampled."""
        sampler = AgentmarkSampler()

        result = sampler.should_sample(
            parent_context=None,
            trace_id=123456,
            name="my-span",
            attributes=None,
        )

        assert result.decision == Decision.RECORD_AND_SAMPLE

    def test_drop_nextjs_span_name(self) -> None:
        """Test that spans with next.span_name are dropped."""
        sampler = AgentmarkSampler()

        result = sampler.should_sample(
            parent_context=None,
            trace_id=123456,
            name="some-span",
            attributes={"next.span_name": "internal-operation"},
        )

        assert result.decision == Decision.DROP

    def test_drop_nextjs_client_component(self) -> None:
        """Test that spans with next.clientComponentLoadCount are dropped."""
        sampler = AgentmarkSampler()

        result = sampler.should_sample(
            parent_context=None,
            trace_id=123456,
            name="some-span",
            attributes={"next.clientComponentLoadCount": 5},
        )

        assert result.decision == Decision.DROP

    def test_sample_with_other_attributes(self) -> None:
        """Test that spans with other attributes are sampled."""
        sampler = AgentmarkSampler()

        result = sampler.should_sample(
            parent_context=None,
            trace_id=123456,
            name="my-span",
            attributes={
                "agentmark.trace_name": "my-trace",
                "agentmark.user_id": "user-1",
                "custom.key": "value",
            },
        )

        assert result.decision == Decision.RECORD_AND_SAMPLE

    def test_get_description(self) -> None:
        """Test sampler description."""
        sampler = AgentmarkSampler()

        assert sampler.get_description() == "AgentmarkSampler"


class TestSamplerAttributePreservation:
    """Regression: the sampler result REPLACES create-time attributes per
    the OTel spec, so the sampler must forward them — a bare decision
    silently strips every attribute passed to start_span(attributes=...),
    including instrumentation-library gen_ai.* attributes."""

    def test_create_time_attributes_survive_sampling(self) -> None:
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import SimpleSpanProcessor
        from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
            InMemorySpanExporter,
        )

        from agentmark_sdk.sampler import AgentmarkSampler

        exporter = InMemorySpanExporter()
        provider = TracerProvider(sampler=AgentmarkSampler())
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        tracer = provider.get_tracer("probe")

        with tracer.start_as_current_span(
            "s", attributes={"gen_ai.request.model": "test-model"}
        ) as span:
            span.set_attribute("post.create", "v")

        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs["gen_ai.request.model"] == "test-model"
        assert attrs["post.create"] == "v"

    def test_filtered_spans_still_dropped(self) -> None:
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import SimpleSpanProcessor
        from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
            InMemorySpanExporter,
        )

        from agentmark_sdk.sampler import AgentmarkSampler

        exporter = InMemorySpanExporter()
        provider = TracerProvider(sampler=AgentmarkSampler())
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        tracer = provider.get_tracer("probe")

        with tracer.start_as_current_span(
            "next-internal", attributes={"next.span_name": "x"}
        ):
            pass

        assert exporter.get_finished_spans() == ()
