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
