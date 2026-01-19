"""Test configuration and fixtures for agentmark-claude-agent-sdk tests."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest

# Fixture file paths
FIXTURES_DIR = Path(__file__).parent / "fixtures"

# Fixed timestamp for deterministic testing (2024-01-01T00:00:00.000Z)
FIXED_TIMESTAMP = datetime(2024, 1, 1, 0, 0, 0, tzinfo=UTC)
FIXED_TIMESTAMP_MS = 1704067200000


@dataclass
class MockSpanData:
    """Mock span data for testing OpenTelemetry integration."""

    name: str
    attributes: dict[str, str | int | bool] = field(default_factory=dict)
    status: dict[str, Any] | None = None
    exceptions: list[Exception] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)
    ended: bool = False


def find_span_by_name(
    spans: list[MockSpanData],
    name_pattern: str | re.Pattern[str],
) -> MockSpanData | None:
    """Find a span by name using exact match or regex pattern.

    Stable alternative to index-based lookup that prevents flaky tests.

    Args:
        spans: Array of mock spans to search
        name_pattern: String for exact match or regex Pattern for pattern match

    Returns:
        The first matching span or None
    """
    for span in spans:
        if isinstance(name_pattern, str):
            if span.name == name_pattern:
                return span
        elif name_pattern.search(span.name):
            return span
    return None


def find_span_by_attribute(
    spans: list[MockSpanData],
    key: str,
    value: Any,
) -> MockSpanData | None:
    """Find a span by an attribute key-value pair.

    Useful for finding specific tool or session spans.

    Args:
        spans: Array of mock spans to search
        key: Attribute key to match
        value: Expected attribute value

    Returns:
        The first matching span or None
    """
    for span in spans:
        if span.attributes.get(key) == value:
            return span
    return None


def find_all_spans_by_name(
    spans: list[MockSpanData],
    name_pattern: str | re.Pattern[str],
) -> list[MockSpanData]:
    """Find all spans matching a name pattern.

    Useful for finding multiple tool spans or chat spans.

    Args:
        spans: Array of mock spans to search
        name_pattern: String for exact match or regex Pattern for pattern match

    Returns:
        List of matching spans
    """
    results = []
    for span in spans:
        if isinstance(name_pattern, str):
            if span.name == name_pattern:
                results.append(span)
        elif name_pattern.search(span.name):
            results.append(span)
    return results


def expect_span_to_have_attribute(
    span: MockSpanData | None,
    key: str,
    value: Any,
) -> None:
    """Assert that a span has a specific attribute value.

    Provides clearer error messages than raw assert.

    Args:
        span: The span to check
        key: Attribute key
        value: Expected value

    Raises:
        AssertionError: If span is None or attribute doesn't match
    """
    assert span is not None, f'Expected span to exist when checking attribute "{key}"'
    actual = span.attributes.get(key)
    assert actual == value, f'Expected span attribute "{key}" to be {value!r}, but got {actual!r}'


def expect_span_status(
    span: MockSpanData | None,
    expected_code: int,
) -> None:
    """Assert that a span has a specific status code.

    Args:
        span: The span to check
        expected_code: Expected status code (1 = OK, 2 = ERROR)

    Raises:
        AssertionError: If span is None or status code doesn't match
    """
    assert span is not None, "Expected span to exist when checking status"
    status_name = "OK" if expected_code == 1 else "ERROR"
    actual_code = span.status.get("code") if span.status else None
    assert actual_code == expected_code, (
        f"Expected span status to be {status_name} ({expected_code}), but got {actual_code}"
    )


# Status codes matching OpenTelemetry conventions
class StatusCode:
    """OpenTelemetry-style status codes."""

    UNSET = 0
    OK = 1
    ERROR = 2


@pytest.fixture
def text_prompt_frontmatter() -> dict[str, Any]:
    """Return frontmatter for text.prompt.mdx fixture."""
    return {
        "name": "text-prompt",
        "text_config": {
            "model_name": "claude-sonnet-4-20250514",
        },
        "test_settings": {
            "dataset": "text.dataset.jsonl",
            "evals": ["exact_match"],
        },
        "input_schema": {
            "type": "object",
            "properties": {
                "userMessage": {"type": "string"},
            },
            "required": ["userMessage"],
        },
    }


@pytest.fixture
def math_prompt_frontmatter() -> dict[str, Any]:
    """Return frontmatter for math.prompt.mdx (object prompt) fixture."""
    return {
        "name": "math",
        "object_config": {
            "model_name": "claude-sonnet-4-20250514",
            "schema": {
                "type": "object",
                "properties": {
                    "answer": {"type": "string"},
                },
                "required": ["answer"],
            },
        },
        "test_settings": {
            "dataset": "object.dataset.jsonl",
        },
        "input_schema": {
            "type": "object",
            "properties": {
                "userMessage": {"type": "string"},
            },
            "required": ["userMessage"],
        },
    }


@pytest.fixture
def text_with_tools_prompt_frontmatter() -> dict[str, Any]:
    """Return frontmatter for text-with-tools.prompt.mdx fixture."""
    return {
        "name": "text-with-tools-prompt",
        "text_config": {
            "model_name": "claude-sonnet-4-20250514",
            "tools": {
                "search": {
                    "description": "Search the web",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Search query",
                            },
                        },
                        "required": ["query"],
                    },
                },
            },
        },
        "input_schema": {
            "type": "object",
            "properties": {
                "userMessage": {"type": "string"},
            },
            "required": ["userMessage"],
        },
    }


@pytest.fixture
def agent_task_prompt_frontmatter() -> dict[str, Any]:
    """Return frontmatter for agent-task.prompt.mdx fixture."""
    return {
        "name": "agent-task",
        "text_config": {
            "model_name": "claude-sonnet-4-20250514",
            "max_calls": 10,
        },
        "input_schema": {
            "type": "object",
            "properties": {
                "task": {"type": "string"},
            },
            "required": ["task"],
        },
    }


@pytest.fixture
def image_prompt_frontmatter() -> dict[str, Any]:
    """Return frontmatter for image.prompt.mdx fixture."""
    return {
        "name": "image-gen",
        "image_config": {
            "model_name": "dall-e-3",
            "size": "1024x1024",
        },
        "input_schema": {
            "type": "object",
            "properties": {
                "description": {"type": "string"},
            },
            "required": ["description"],
        },
    }


@pytest.fixture
def speech_prompt_frontmatter() -> dict[str, Any]:
    """Return frontmatter for speech.prompt.mdx fixture."""
    return {
        "name": "speech-gen",
        "speech_config": {
            "model_name": "tts-1-hd",
            "voice": "alloy",
        },
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
            },
            "required": ["text"],
        },
    }


@pytest.fixture
def mock_tracer() -> MagicMock:
    """Create mock OpenTelemetry tracer that tracks created spans."""
    tracer = MagicMock()
    tracer.spans: list[MockSpanData] = []

    def create_mock_span(
        name: str, attributes: dict[str, Any] | None = None, **kwargs: Any
    ) -> MagicMock:
        """Create a mock span and track it."""
        span_data = MockSpanData(
            name=name,
            attributes=dict(attributes) if attributes else {},
        )
        tracer.spans.append(span_data)

        span = MagicMock()
        span._data = span_data

        def set_attribute(key: str, value: Any) -> None:
            span_data.attributes[key] = value

        def set_status(status: Any) -> None:
            if hasattr(status, "status_code"):
                code = (
                    status.status_code.value
                    if hasattr(status.status_code, "value")
                    else status.status_code
                )
                span_data.status = {"code": code}
            else:
                span_data.status = {"code": status}

        def add_event(name: str, attributes: dict[str, Any] | None = None) -> None:
            span_data.events.append({"name": name, "attributes": attributes or {}})

        def record_exception(exception: Exception) -> None:
            span_data.exceptions.append(exception)

        def end() -> None:
            span_data.ended = True

        span.set_attribute = set_attribute
        span.set_status = set_status
        span.add_event = add_event
        span.record_exception = record_exception
        span.end = end

        return span

    tracer.start_span = create_mock_span
    tracer.start_as_current_span = MagicMock()
    return tracer


@pytest.fixture
def mock_span() -> MagicMock:
    """Create mock OpenTelemetry span."""
    span = MagicMock()
    span.set_attribute = MagicMock()
    span.set_status = MagicMock()
    span.add_event = MagicMock()
    span.record_exception = MagicMock()
    span.end = MagicMock()
    return span


@pytest.fixture
def mock_tracer_provider(mock_tracer: MagicMock) -> MagicMock:
    """Create mock OpenTelemetry tracer provider."""
    provider = MagicMock()
    provider.get_tracer = MagicMock(return_value=mock_tracer)
    # Expose the tracer directly for easy access to spans
    provider.tracer = mock_tracer
    return provider


@pytest.fixture
def sample_messages() -> list[dict[str, Any]]:
    """Return sample chat messages for testing."""
    return [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"},
        {"role": "assistant", "content": "Hi there! How can I help you today?"},
    ]


@pytest.fixture
def sample_tool_definition() -> dict[str, Any]:
    """Return sample tool definition for testing."""
    return {
        "name": "search",
        "description": "Search the web for information",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query",
                },
            },
            "required": ["query"],
        },
    }
