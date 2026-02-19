"""Tests for ClaudeAgentWebhookHandler.

Ported from TypeScript: packages/claude-agent-sdk-adapter/test/runner.test.ts
"""

from __future__ import annotations

import json
import re
from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agentmark_claude_agent_sdk.webhook import (
    ClaudeAgentWebhookHandler,
)


def create_mock_ast() -> dict[str, Any]:
    """Create a mock AST."""
    return {"type": "root", "children": []}


def create_mock_text_prompt() -> MagicMock:
    """Create a mock text prompt."""
    mock = MagicMock()
    mock.format = AsyncMock(
        return_value=MagicMock(
            query=MagicMock(
                prompt="test prompt", options=MagicMock(model="anthropic/claude-sonnet-4-20250514")
            ),
            messages=[],
            telemetry=MagicMock(is_enabled=False, prompt_name="test"),
        )
    )
    mock.format_with_test_props = AsyncMock(
        return_value=MagicMock(
            query=MagicMock(
                prompt="test prompt from test props",
                options=MagicMock(model="anthropic/claude-sonnet-4-20250514"),
            ),
            messages=[],
            telemetry=MagicMock(is_enabled=False, prompt_name="test"),
        )
    )
    # Use AsyncMock since format_with_dataset is awaited in webhook.py
    mock.format_with_dataset = AsyncMock()
    return mock


def create_mock_object_prompt() -> MagicMock:
    """Create a mock object prompt."""
    mock = MagicMock()
    mock.format = AsyncMock(
        return_value=MagicMock(
            query=MagicMock(
                prompt="object prompt",
                options=MagicMock(
                    model="anthropic/claude-sonnet-4-20250514",
                    output_format=MagicMock(type="json_schema", schema={}),
                ),
            ),
            messages=[],
            telemetry=MagicMock(is_enabled=False, prompt_name="test"),
        )
    )
    mock.format_with_test_props = AsyncMock(
        return_value=MagicMock(
            query=MagicMock(
                prompt="object prompt from test props",
                options=MagicMock(
                    model="anthropic/claude-sonnet-4-20250514",
                    output_format=MagicMock(type="json_schema", schema={}),
                ),
            ),
            messages=[],
            telemetry=MagicMock(is_enabled=False, prompt_name="test"),
        )
    )
    # Use AsyncMock since format_with_dataset is awaited in webhook.py
    mock.format_with_dataset = AsyncMock()
    return mock


def create_mock_client() -> MagicMock:
    """Create a mock AgentMark client."""
    mock_text_prompt = create_mock_text_prompt()
    mock_object_prompt = create_mock_object_prompt()

    client = MagicMock()
    client.load_text_prompt = AsyncMock(return_value=mock_text_prompt)
    client.load_object_prompt = AsyncMock(return_value=mock_object_prompt)
    client.get_eval_registry = MagicMock(return_value=None)
    client._mock_text_prompt = mock_text_prompt
    client._mock_object_prompt = mock_object_prompt

    return client


async def drain_stream(stream: AsyncGenerator[bytes, None]) -> list[str]:
    """Drain an async generator stream and collect chunks."""
    chunks = []
    async for chunk in stream:
        text = chunk.decode() if isinstance(chunk, bytes) else str(chunk)
        # Split by newlines and filter empty
        chunks.extend([s for s in text.split("\n") if s.strip()])
    return chunks


class TestClaudeAgentWebhookHandlerConstructor:
    """Test suite for ClaudeAgentWebhookHandler constructor."""

    def test_initializes_with_client(self) -> None:
        """Should initialize with client."""
        client = create_mock_client()
        handler = ClaudeAgentWebhookHandler(client)
        assert isinstance(handler, ClaudeAgentWebhookHandler)


class TestRunPromptTextPrompts:
    """Test suite for runPrompt with text prompts."""

    @pytest.fixture
    def mock_client(self) -> MagicMock:
        """Create mock client."""
        return create_mock_client()

    @pytest.fixture
    def handler(self, mock_client: MagicMock) -> ClaudeAgentWebhookHandler:
        """Create handler with mock client."""
        return ClaudeAgentWebhookHandler(mock_client)

    @pytest.fixture
    def mock_query_results(self) -> list[dict[str, Any]]:
        """Create mock query results."""
        return []

    async def test_executes_text_prompt_and_returns_response(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should execute text prompt and return response."""
        mock_results = [
            {"type": "assistant", "message": {"content": [{"type": "text", "text": "Hello"}]}},
            {
                "type": "result",
                "subtype": "success",
                "result": "Final answer",
                "usage": {"input_tokens": 10, "output_tokens": 5},
            },
        ]

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "test-prompt",
                "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            },
        ), patch.object(handler, "_execute_query", return_value=mock_results):
            result = await handler.run_prompt(create_mock_ast())

        assert result.type == "text"
        assert result.result == "Final answer"
        assert result.usage["promptTokens"] == 10
        assert result.usage["completionTokens"] == 5
        assert result.usage["totalTokens"] == 15

    async def test_uses_format_with_test_props_when_no_custom_props(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should use formatWithTestProps when no custom props."""
        mock_results = [{"type": "result", "subtype": "success", "result": "Done"}]

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "test-prompt",
                "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            },
        ), patch.object(handler, "_execute_query", return_value=mock_results):
            await handler.run_prompt(create_mock_ast())

        mock_client._mock_text_prompt.format_with_test_props.assert_called()
        mock_client._mock_text_prompt.format.assert_not_called()

    async def test_uses_format_when_custom_props_provided(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should use format when custom props provided."""
        mock_results = [{"type": "result", "subtype": "success", "result": "Done"}]

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "test-prompt",
                "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            },
        ), patch.object(handler, "_execute_query", return_value=mock_results):
            await handler.run_prompt(create_mock_ast(), custom_props={"userMessage": "Hello"})

        mock_client._mock_text_prompt.format.assert_called()

    async def test_sets_finish_reason_to_stop_on_success(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should set finishReason to stop on success."""
        mock_results = [{"type": "result", "subtype": "success", "result": "Done"}]

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "test-prompt",
                "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            },
        ), patch.object(handler, "_execute_query", return_value=mock_results):
            result = await handler.run_prompt(create_mock_ast())

        assert result.finish_reason == "stop"

    async def test_sets_finish_reason_to_error_on_failure(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should set finishReason to error on failure."""
        mock_results = [
            {
                "type": "result",
                "subtype": "error_during_execution",
                "errors": ["Something went wrong"],
            }
        ]

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "test-prompt",
                "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            },
        ), patch.object(handler, "_execute_query", return_value=mock_results):
            result = await handler.run_prompt(create_mock_ast())

        assert result.finish_reason == "error"
        assert "Something went wrong" in result.result

    async def test_includes_trace_id_in_result(self, handler: ClaudeAgentWebhookHandler) -> None:
        """Should include traceId in result."""
        mock_results = [{"type": "result", "subtype": "success", "result": "Done"}]

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "test-prompt",
                "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            },
        ), patch.object(handler, "_execute_query", return_value=mock_results):
            result = await handler.run_prompt(create_mock_ast())

        # traceId is now generated by withTracing() wrapper (32-char hex string)
        assert result.trace_id is not None
        assert isinstance(result.trace_id, str)
        assert len(result.trace_id) == 32


class TestRunPromptObjectPrompts:
    """Test suite for runPrompt with object prompts."""

    @pytest.fixture
    def mock_client(self) -> MagicMock:
        """Create mock client."""
        return create_mock_client()

    @pytest.fixture
    def handler(self, mock_client: MagicMock) -> ClaudeAgentWebhookHandler:
        """Create handler with mock client."""
        return ClaudeAgentWebhookHandler(mock_client)

    async def test_executes_object_prompt_with_structured_output(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should execute object prompt with structured output."""
        structured_output = {"answer": 42, "reasoning": "test"}
        mock_results = [
            {
                "type": "result",
                "subtype": "success",
                "result": "",
                "structured_output": structured_output,
                "usage": {"input_tokens": 20, "output_tokens": 10},
            }
        ]

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "object-prompt",
                "object_config": {
                    "model_name": "anthropic/claude-sonnet-4-20250514",
                    "output": {"schema": {"type": "object"}},
                },
            },
        ), patch.object(handler, "_execute_query", return_value=mock_results):
            result = await handler.run_prompt(create_mock_ast())

        assert result.type == "object"
        assert result.result == structured_output

    async def test_uses_format_with_test_props_for_object_prompts_without_custom_props(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should use formatWithTestProps for object prompts without custom props."""
        mock_results = [{"type": "result", "subtype": "success", "structured_output": {}}]

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "object-prompt",
                "object_config": {
                    "model_name": "anthropic/claude-sonnet-4-20250514",
                    "output": {"schema": {"type": "object"}},
                },
            },
        ), patch.object(handler, "_execute_query", return_value=mock_results):
            await handler.run_prompt(create_mock_ast())

        mock_client._mock_object_prompt.format_with_test_props.assert_called()

    async def test_handles_error_result_with_error_subtype(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should handle error result with error subtype."""
        mock_results = [
            {"type": "result", "subtype": "error_during_execution", "errors": ["JSON parse error"]}
        ]

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "object-prompt",
                "object_config": {
                    "model_name": "anthropic/claude-sonnet-4-20250514",
                    "output": {"schema": {"type": "object"}},
                },
            },
        ), patch.object(handler, "_execute_query", return_value=mock_results):
            result = await handler.run_prompt(create_mock_ast())

        assert result.finish_reason == "error"
        assert "JSON parse error" in result.result


class TestRunPromptUnsupportedTypes:
    """Test suite for runPrompt with unsupported prompt types."""

    @pytest.fixture
    def mock_client(self) -> MagicMock:
        """Create mock client."""
        return create_mock_client()

    @pytest.fixture
    def handler(self, mock_client: MagicMock) -> ClaudeAgentWebhookHandler:
        """Create handler with mock client."""
        return ClaudeAgentWebhookHandler(mock_client)

    async def test_returns_error_for_image_config_prompts(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should return error for image_config prompts."""
        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={"name": "image-prompt", "image_config": {"model_name": "openai/dall-e-3"}},
        ):
            result = await handler.run_prompt(create_mock_ast())

        assert result.type == "text"
        assert "Image generation is not supported" in result.result
        assert result.finish_reason == "error"
        assert result.usage["totalTokens"] == 0

    async def test_returns_error_for_speech_config_prompts(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should return error for speech_config prompts."""
        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "speech-prompt",
                "speech_config": {"model_name": "openai/tts-1", "voice": "alloy"},
            },
        ):
            result = await handler.run_prompt(create_mock_ast())

        assert result.type == "text"
        assert "Speech generation is not supported" in result.result
        assert result.finish_reason == "error"

    async def test_throws_for_unrecognized_config_types(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should throw for unrecognized config types."""
        with (
            patch.object(handler, "_get_frontmatter", return_value={"name": "unknown-prompt"}),
            pytest.raises(ValueError, match=r"Invalid prompt: No recognized config type"),
        ):
            await handler.run_prompt(create_mock_ast())


class TestRunPromptErrorHandling:
    """Test suite for runPrompt error handling."""

    @pytest.fixture
    def mock_client(self) -> MagicMock:
        """Create mock client."""
        return create_mock_client()

    @pytest.fixture
    def handler(self, mock_client: MagicMock) -> ClaudeAgentWebhookHandler:
        """Create handler with mock client."""
        return ClaudeAgentWebhookHandler(mock_client)

    async def test_handles_query_errors_gracefully(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should handle query errors gracefully."""
        with patch.object(
            handler, "_get_frontmatter", return_value={"name": "test", "text_config": {}}
        ), patch.object(handler, "_execute_query", side_effect=Exception("Network error")):
            result = await handler.run_prompt(create_mock_ast())

        assert result.finish_reason == "error"
        assert "Network error" in result.result

    async def test_handles_error_max_turns_subtype(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should handle error_max_turns subtype."""
        mock_results = [
            {"type": "result", "subtype": "error_max_turns", "errors": ["Max turns exceeded"]}
        ]

        with patch.object(
            handler, "_get_frontmatter", return_value={"name": "test", "text_config": {}}
        ), patch.object(handler, "_execute_query", return_value=mock_results):
            result = await handler.run_prompt(create_mock_ast())

        assert result.finish_reason == "error"
        assert "Max turns exceeded" in result.result

    async def test_includes_trace_id_even_when_prompt_name_missing(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should include traceId even when prompt name is missing."""
        mock_results = [{"type": "result", "subtype": "success", "result": "Done"}]

        with (
            patch.object(handler, "_get_frontmatter", return_value={"text_config": {}}),
            patch.object(handler, "_execute_query", return_value=mock_results),
        ):
            result = await handler.run_prompt(create_mock_ast())

        # traceId is now generated by withTracing() wrapper (32-char hex string)
        assert result.trace_id is not None
        assert isinstance(result.trace_id, str)
        assert len(result.trace_id) == 32


class TestStreamingResponses:
    """Test suite for streaming responses."""

    @pytest.fixture
    def mock_client(self) -> MagicMock:
        """Create mock client."""
        return create_mock_client()

    @pytest.fixture
    def handler(self, mock_client: MagicMock) -> ClaudeAgentWebhookHandler:
        """Create handler with mock client."""
        return ClaudeAgentWebhookHandler(mock_client)

    async def test_creates_async_iterator_when_should_stream_true(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should create async iterator when shouldStream=true."""

        async def mock_stream() -> AsyncGenerator[dict[str, Any], None]:
            yield {"type": "result", "subtype": "success", "result": "Done"}

        with patch.object(
            handler, "_get_frontmatter", return_value={"name": "stream-test", "text_config": {}}
        ), patch.object(handler, "_stream_query", return_value=mock_stream()):
            result = await handler.run_prompt(create_mock_ast(), should_stream=True)

        assert result.type == "stream"
        assert result.stream is not None

    async def test_yields_assistant_messages_with_content(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should yield assistant messages with content."""

        async def mock_stream() -> AsyncGenerator[dict[str, Any], None]:
            yield {
                "type": "assistant",
                "message": {"content": [{"type": "text", "text": "Hello "}]},
            }
            yield {"type": "assistant", "message": {"content": [{"type": "text", "text": "World"}]}}
            yield {"type": "result", "subtype": "success", "result": "Final"}

        with patch.object(
            handler, "_get_frontmatter", return_value={"name": "stream-test", "text_config": {}}
        ), patch.object(handler, "_stream_query", return_value=mock_stream()):
            result = await handler.run_prompt(create_mock_ast(), should_stream=True)
            # Must drain stream inside patch context
            chunks = await drain_stream(result.stream)

        parsed = [json.loads(c) for c in chunks]

        # Should have delta chunks for assistant messages plus final result
        deltas = [p for p in parsed if "delta" in p]
        assert len(deltas) == 2
        assert deltas[0]["delta"] == "Hello "
        assert deltas[1]["delta"] == "World"

    async def test_accumulates_token_usage_across_messages(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should accumulate token usage across messages."""

        async def mock_stream() -> AsyncGenerator[dict[str, Any], None]:
            yield {"type": "assistant", "message": {"content": [{"type": "text", "text": "Test"}]}}
            yield {
                "type": "result",
                "subtype": "success",
                "result": "Done",
                "usage": {"input_tokens": 100, "output_tokens": 50},
            }

        with patch.object(
            handler, "_get_frontmatter", return_value={"name": "stream-test", "text_config": {}}
        ), patch.object(handler, "_stream_query", return_value=mock_stream()):
            result = await handler.run_prompt(create_mock_ast(), should_stream=True)
            chunks = await drain_stream(result.stream)

        parsed = [json.loads(c) for c in chunks]
        final = next((p for p in parsed if "finishReason" in p), None)

        assert final["usage"]["promptTokens"] == 100
        assert final["usage"]["completionTokens"] == 50

    async def test_captures_structured_output_from_result(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should capture structured output from result."""
        structured_output = {"key": "value"}

        async def mock_stream() -> AsyncGenerator[dict[str, Any], None]:
            yield {"type": "result", "subtype": "success", "structured_output": structured_output}

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "object-stream",
                "object_config": {"model_name": "anthropic/claude-sonnet"},
            },
        ), patch.object(handler, "_stream_query", return_value=mock_stream()):
            result = await handler.run_prompt(create_mock_ast(), should_stream=True)
            chunks = await drain_stream(result.stream)

        parsed = [json.loads(c) for c in chunks]
        final = next((p for p in parsed if "finishReason" in p), None)

        assert final["result"] == structured_output

    async def test_handles_result_with_error_subtype_in_stream(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should handle result with error subtype."""

        async def mock_stream() -> AsyncGenerator[dict[str, Any], None]:
            yield {
                "type": "result",
                "subtype": "error_during_execution",
                "errors": ["Execution failed"],
            }

        with patch.object(
            handler, "_get_frontmatter", return_value={"name": "stream-test", "text_config": {}}
        ), patch.object(handler, "_stream_query", return_value=mock_stream()):
            result = await handler.run_prompt(create_mock_ast(), should_stream=True)
            chunks = await drain_stream(result.stream)

        parsed = [json.loads(c) for c in chunks]
        error_chunk = next((p for p in parsed if p.get("type") == "error"), None)

        assert error_chunk is not None
        assert "Execution failed" in error_chunk["error"]

    async def test_handles_missing_message_content(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should handle missing message.content."""

        async def mock_stream() -> AsyncGenerator[dict[str, Any], None]:
            yield {"type": "assistant", "message": {}}  # No content
            yield {"type": "result", "subtype": "success", "result": "Done"}

        with patch.object(
            handler, "_get_frontmatter", return_value={"name": "stream-test", "text_config": {}}
        ), patch.object(handler, "_stream_query", return_value=mock_stream()):
            result = await handler.run_prompt(create_mock_ast(), should_stream=True)
            # Should not throw
            chunks = await drain_stream(result.stream)

        assert len(chunks) > 0

    async def test_closes_stream_on_completion(self, handler: ClaudeAgentWebhookHandler) -> None:
        """Should close stream on completion."""

        async def mock_stream() -> AsyncGenerator[dict[str, Any], None]:
            yield {"type": "result", "subtype": "success", "result": "Done"}

        with patch.object(
            handler, "_get_frontmatter", return_value={"name": "stream-test", "text_config": {}}
        ), patch.object(handler, "_stream_query", return_value=mock_stream()):
            result = await handler.run_prompt(create_mock_ast(), should_stream=True)
            # Draining should complete without hanging
            await drain_stream(result.stream)

    async def test_handles_errors_during_streaming(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should handle errors during streaming."""

        async def mock_stream() -> AsyncGenerator[dict[str, Any], None]:
            yield {"type": "assistant", "message": {"content": [{"type": "text", "text": "Start"}]}}
            raise Exception("Stream interrupted")

        with patch.object(
            handler, "_get_frontmatter", return_value={"name": "stream-test", "text_config": {}}
        ), patch.object(handler, "_stream_query", return_value=mock_stream()):
            result = await handler.run_prompt(create_mock_ast(), should_stream=True)
            chunks = await drain_stream(result.stream)

        parsed = [json.loads(c) for c in chunks]
        error_chunk = next((p for p in parsed if p.get("type") == "error"), None)

        assert error_chunk is not None
        assert "Stream interrupted" in error_chunk["error"]

    async def test_includes_stream_header(self, handler: ClaudeAgentWebhookHandler) -> None:
        """Should include stream header."""

        async def mock_stream() -> AsyncGenerator[dict[str, Any], None]:
            yield {"type": "result", "subtype": "success", "result": "Done"}

        with patch.object(
            handler, "_get_frontmatter", return_value={"name": "stream-test", "text_config": {}}
        ), patch.object(handler, "_stream_query", return_value=mock_stream()):
            result = await handler.run_prompt(create_mock_ast(), should_stream=True)

        assert result.stream_header == {"AgentMark-Streaming": "true"}


class TestRunExperiment:
    """Test suite for runExperiment."""

    @pytest.fixture
    def mock_client(self) -> MagicMock:
        """Create mock client."""
        return create_mock_client()

    @pytest.fixture
    def handler(self, mock_client: MagicMock) -> ClaudeAgentWebhookHandler:
        """Create handler with mock client."""
        return ClaudeAgentWebhookHandler(mock_client)

    async def test_emits_error_when_no_dataset_configured(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should emit error when no dataset configured."""
        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={"name": "no-dataset-prompt", "text_config": {}},
        ):
            result = await handler.run_experiment(create_mock_ast(), "run-1")

        chunks = await drain_stream(result.stream)
        parsed = [json.loads(c) for c in chunks]

        assert parsed[0]["type"] == "error"
        assert "No dataset path provided" in parsed[0]["error"]

    async def test_uses_provided_dataset_path_over_frontmatter(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should use provided dataset path over frontmatter."""

        async def empty_dataset() -> AsyncGenerator[dict[str, Any], None]:
            return
            yield  # Make it a generator

        mock_client._mock_text_prompt.format_with_dataset.return_value = empty_dataset()

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ):
            result = await handler.run_experiment(create_mock_ast(), "run-1", "./override.jsonl")

        chunks = await drain_stream(result.stream)
        parsed = [json.loads(c) for c in chunks]
        start_event = next((p for p in parsed if p.get("type") == "experiment_start"), None)

        assert start_event["datasetPath"] == "./override.jsonl"

    async def test_emits_experiment_metadata_at_start(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should emit experiment metadata at start."""

        async def empty_dataset() -> AsyncGenerator[dict[str, Any], None]:
            return
            yield  # Make it a generator

        mock_client._mock_text_prompt.format_with_dataset.return_value = empty_dataset()

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ):
            result = await handler.run_experiment(create_mock_ast(), "my-run")

        chunks = await drain_stream(result.stream)
        parsed = [json.loads(c) for c in chunks]

        assert parsed[0]["type"] == "experiment_start"
        assert "runId" in parsed[0]
        assert parsed[0]["runName"] == "my-run"
        assert parsed[0]["datasetPath"] == "./test.jsonl"
        assert parsed[0]["promptName"] == "experiment-prompt"

        # Verify runId is a UUID format
        uuid_pattern = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
        assert re.match(uuid_pattern, parsed[0]["runId"], re.IGNORECASE)

    async def test_iterates_through_all_dataset_items(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should iterate through all dataset items."""

        async def mock_dataset() -> AsyncGenerator[dict[str, Any], None]:
            yield {
                "formatted": MagicMock(
                    query=MagicMock(prompt="p1", options=MagicMock()),
                    telemetry=MagicMock(is_enabled=True, prompt_name="test"),
                ),
                "dataset": {"input": {"q": "a"}, "expected_output": "A"},
            }
            yield {
                "formatted": MagicMock(
                    query=MagicMock(prompt="p2", options=MagicMock()),
                    telemetry=MagicMock(is_enabled=True, prompt_name="test"),
                ),
                "dataset": {"input": {"q": "b"}, "expected_output": "B"},
            }

        mock_client._mock_text_prompt.format_with_dataset.return_value = mock_dataset()

        async def mock_query_results() -> AsyncGenerator[dict[str, Any], None]:
            yield {"type": "result", "subtype": "success", "result": "Response"}

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ), patch.object(
            handler, "_stream_query", side_effect=[mock_query_results(), mock_query_results()]
        ):
            result = await handler.run_experiment(create_mock_ast(), "run-1")
            chunks = await drain_stream(result.stream)

        parsed = [json.loads(c) for c in chunks]
        item_events = [p for p in parsed if p.get("type") == "dataset"]

        assert len(item_events) == 2

    async def test_emits_result_for_each_item_with_input_output_expected(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should emit result for each item with input/output/expected."""

        async def mock_dataset() -> AsyncGenerator[dict[str, Any], None]:
            yield {
                "formatted": MagicMock(
                    query=MagicMock(prompt="test", options=MagicMock()),
                    telemetry=MagicMock(is_enabled=True, prompt_name="test"),
                ),
                "dataset": {"input": {"question": "What is 2+2?"}, "expected_output": "4"},
            }

        mock_client._mock_text_prompt.format_with_dataset.return_value = mock_dataset()

        async def mock_query_results() -> AsyncGenerator[dict[str, Any], None]:
            yield {
                "type": "result",
                "subtype": "success",
                "result": "4",
                "usage": {"input_tokens": 10, "output_tokens": 1},
            }

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ), patch.object(handler, "_stream_query", return_value=mock_query_results()):
            result = await handler.run_experiment(create_mock_ast(), "run-1")
            chunks = await drain_stream(result.stream)

        parsed = [json.loads(c) for c in chunks]
        item_event = next((p for p in parsed if p.get("type") == "dataset"), None)

        assert item_event["result"]["input"] == {"question": "What is 2+2?"}
        assert item_event["result"]["expectedOutput"] == "4"
        assert item_event["result"]["actualOutput"] == "4"
        assert item_event["result"]["tokens"] == 11
        assert "traceId" in item_event
        assert "runId" in item_event
        assert item_event["runName"] == "run-1"

        # Verify runId is a UUID format
        uuid_pattern = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
        assert re.match(uuid_pattern, item_event["runId"], re.IGNORECASE)

    async def test_includes_tokens_in_item_results(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should include tokens in item results."""

        async def mock_dataset() -> AsyncGenerator[dict[str, Any], None]:
            yield {
                "formatted": MagicMock(
                    query=MagicMock(prompt="test", options=MagicMock()),
                    telemetry=MagicMock(is_enabled=True, prompt_name="test"),
                ),
                "dataset": {"input": {}, "expected_output": ""},
            }

        mock_client._mock_text_prompt.format_with_dataset.return_value = mock_dataset()

        async def mock_query_results() -> AsyncGenerator[dict[str, Any], None]:
            yield {
                "type": "result",
                "subtype": "success",
                "result": "result",
                "usage": {"input_tokens": 50, "output_tokens": 25},
            }

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ), patch.object(handler, "_stream_query", return_value=mock_query_results()):
            result = await handler.run_experiment(create_mock_ast(), "run-1")
            chunks = await drain_stream(result.stream)

        parsed = [json.loads(c) for c in chunks]
        item_event = next((p for p in parsed if p.get("type") == "dataset"), None)

        assert item_event["result"]["tokens"] == 75

    async def test_handles_item_execution_errors_gracefully(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should handle item execution errors gracefully."""

        async def mock_dataset() -> AsyncGenerator[dict[str, Any], None]:
            yield {
                "formatted": MagicMock(
                    query=MagicMock(prompt="test", options=MagicMock()),
                    telemetry=MagicMock(is_enabled=True, prompt_name="test"),
                ),
                "dataset": {"input": {"q": "test"}, "expected_output": ""},
            }

        mock_client._mock_text_prompt.format_with_dataset.return_value = mock_dataset()

        async def mock_query_error() -> AsyncGenerator[dict[str, Any], None]:
            raise Exception("Item execution failed")
            yield  # Make it a generator

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ), patch.object(handler, "_stream_query", return_value=mock_query_error()):
            result = await handler.run_experiment(create_mock_ast(), "run-1")
            chunks = await drain_stream(result.stream)

        parsed = [json.loads(c) for c in chunks]
        error_event = next((p for p in parsed if p.get("type") == "experiment_item_error"), None)

        assert error_event is not None
        assert "Item execution failed" in error_event["error"]
        assert error_event["input"] == {"q": "test"}

    async def test_continues_after_item_errors(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should continue after item errors."""
        call_count = 0

        async def mock_dataset() -> AsyncGenerator[dict[str, Any], None]:
            yield {
                "formatted": MagicMock(
                    query=MagicMock(prompt="p1", options=MagicMock()),
                    telemetry=MagicMock(is_enabled=True, prompt_name="test"),
                ),
                "dataset": {"input": {"i": 1}, "expected_output": "1"},
            }
            yield {
                "formatted": MagicMock(
                    query=MagicMock(prompt="p2", options=MagicMock()),
                    telemetry=MagicMock(is_enabled=True, prompt_name="test"),
                ),
                "dataset": {"input": {"i": 2}, "expected_output": "2"},
            }

        mock_client._mock_text_prompt.format_with_dataset.return_value = mock_dataset()

        async def mock_query_conditional() -> AsyncGenerator[dict[str, Any], None]:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise Exception("First item failed")
            yield {"type": "result", "subtype": "success", "result": "Second item succeeded"}

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ), patch.object(
            handler,
            "_stream_query",
            side_effect=[mock_query_conditional(), mock_query_conditional()],
        ):
            result = await handler.run_experiment(create_mock_ast(), "run-1")
            chunks = await drain_stream(result.stream)

        parsed = [json.loads(c) for c in chunks]

        error_event = next((p for p in parsed if p.get("type") == "experiment_item_error"), None)
        success_event = next((p for p in parsed if p.get("type") == "dataset"), None)
        end_event = next((p for p in parsed if p.get("type") == "experiment_end"), None)

        assert error_event is not None
        assert success_event is not None
        assert end_event["totalItems"] == 2

    async def test_emits_completion_event(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should emit completion event."""

        async def mock_dataset() -> AsyncGenerator[dict[str, Any], None]:
            yield {
                "formatted": MagicMock(
                    query=MagicMock(prompt="test", options=MagicMock()),
                    telemetry=MagicMock(is_enabled=True, prompt_name="test"),
                ),
                "dataset": {"input": {}, "expected_output": ""},
            }

        mock_client._mock_text_prompt.format_with_dataset.return_value = mock_dataset()

        async def mock_query_results() -> AsyncGenerator[dict[str, Any], None]:
            yield {"type": "result", "subtype": "success", "result": "Done"}

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ), patch.object(handler, "_stream_query", return_value=mock_query_results()):
            result = await handler.run_experiment(create_mock_ast(), "run-1")
            chunks = await drain_stream(result.stream)

        parsed = [json.loads(c) for c in chunks]
        end_event = next((p for p in parsed if p.get("type") == "experiment_end"), None)

        assert end_event["type"] == "experiment_end"
        assert end_event["totalItems"] == 1

    async def test_rejects_image_prompts_in_experiments(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should reject image prompts in experiments."""
        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={"name": "image-experiment", "image_config": {"model_name": "openai/dall-e-3"}},
        ):
            result = await handler.run_experiment(create_mock_ast(), "run-1")

        chunks = await drain_stream(result.stream)
        parsed = [json.loads(c) for c in chunks]

        assert parsed[0]["type"] == "error"
        assert "not supported" in parsed[0]["error"]

    async def test_rejects_speech_prompts_in_experiments(
        self, handler: ClaudeAgentWebhookHandler
    ) -> None:
        """Should reject speech prompts in experiments."""
        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={"name": "speech-experiment", "speech_config": {"model_name": "openai/tts-1"}},
        ):
            result = await handler.run_experiment(create_mock_ast(), "run-1")

        chunks = await drain_stream(result.stream)
        parsed = [json.loads(c) for c in chunks]

        assert parsed[0]["type"] == "error"
        assert "not supported" in parsed[0]["error"]

    async def test_handles_dataset_error_chunks(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should handle dataset error chunks."""

        async def mock_dataset() -> AsyncGenerator[dict[str, Any], None]:
            yield {"error": "Invalid JSON at line 3"}
            yield {
                "formatted": MagicMock(
                    query=MagicMock(prompt="valid", options=MagicMock()),
                    telemetry=MagicMock(is_enabled=True, prompt_name="test"),
                ),
                "dataset": {"input": {}, "expected_output": ""},
            }

        mock_client._mock_text_prompt.format_with_dataset.return_value = mock_dataset()

        async def mock_query_results() -> AsyncGenerator[dict[str, Any], None]:
            yield {"type": "result", "subtype": "success", "result": "Done"}

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ), patch.object(handler, "_stream_query", return_value=mock_query_results()):
            result = await handler.run_experiment(create_mock_ast(), "run-1")
            chunks = await drain_stream(result.stream)

        parsed = [json.loads(c) for c in chunks]
        error_events = [p for p in parsed if p.get("type") == "experiment_item_error"]
        success_events = [p for p in parsed if p.get("type") == "dataset"]

        assert len(error_events) == 1
        assert error_events[0]["error"] == "Invalid JSON at line 3"
        assert len(success_events) == 1

    async def test_uses_object_prompt_for_object_config(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should use object prompt for object_config."""

        async def mock_dataset() -> AsyncGenerator[dict[str, Any], None]:
            yield {
                "formatted": MagicMock(
                    query=MagicMock(prompt="test", options=MagicMock()),
                    telemetry=MagicMock(is_enabled=True, prompt_name="test"),
                ),
                "dataset": {"input": {}, "expected_output": {"result": True}},
            }

        mock_client._mock_object_prompt.format_with_dataset.return_value = mock_dataset()

        async def mock_query_results() -> AsyncGenerator[dict[str, Any], None]:
            yield {"type": "result", "subtype": "success", "structured_output": {"result": True}}

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "object-experiment",
                "object_config": {"model_name": "anthropic/claude-sonnet", "output": {}},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ), patch.object(handler, "_stream_query", return_value=mock_query_results()):
            result = await handler.run_experiment(create_mock_ast(), "run-1")
            chunks = await drain_stream(result.stream)

        parsed = [json.loads(c) for c in chunks]
        item_event = next((p for p in parsed if p.get("type") == "dataset"), None)

        mock_client.load_object_prompt.assert_called()
        assert item_event["result"]["actualOutput"] == {"result": True}

    async def test_includes_streaming_headers_in_response(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should include streaming headers in response."""

        async def empty_dataset() -> AsyncGenerator[dict[str, Any], None]:
            return
            yield  # Make it a generator

        mock_client._mock_text_prompt.format_with_dataset.return_value = empty_dataset()

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ):
            result = await handler.run_experiment(create_mock_ast(), "run-1")

        assert result.stream_headers == {"AgentMark-Streaming": "true"}

    async def test_uses_consistent_run_id_across_all_events(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should use consistent runId (UUID) across all events in a single experiment."""

        async def mock_dataset() -> AsyncGenerator[dict[str, Any], None]:
            yield {
                "formatted": MagicMock(
                    query=MagicMock(prompt="p1", options=MagicMock()),
                    telemetry=MagicMock(is_enabled=True, prompt_name="test"),
                ),
                "dataset": {"input": {"q": "a"}, "expected_output": "A"},
            }
            yield {
                "formatted": MagicMock(
                    query=MagicMock(prompt="p2", options=MagicMock()),
                    telemetry=MagicMock(is_enabled=True, prompt_name="test"),
                ),
                "dataset": {"input": {"q": "b"}, "expected_output": "B"},
            }

        mock_client._mock_text_prompt.format_with_dataset.return_value = mock_dataset()

        call_count = 0

        async def mock_query_results() -> AsyncGenerator[dict[str, Any], None]:
            nonlocal call_count
            call_count += 1
            yield {"type": "result", "subtype": "success", "result": f"R{call_count}"}

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ), patch.object(
            handler, "_stream_query", side_effect=[mock_query_results(), mock_query_results()]
        ):
            result = await handler.run_experiment(create_mock_ast(), "my-experiment")

        chunks = await drain_stream(result.stream)
        parsed = [json.loads(c) for c in chunks]

        start_event = next((p for p in parsed if p.get("type") == "experiment_start"), None)
        dataset_events = [p for p in parsed if p.get("type") == "dataset"]

        # All events should have the same runId (UUID)
        run_id = start_event["runId"]
        uuid_pattern = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
        assert re.match(uuid_pattern, run_id, re.IGNORECASE)

        for event in dataset_events:
            assert event["runId"] == run_id

        # runName should be the user-provided name, not the UUID
        assert start_event["runName"] == "my-experiment"
        for event in dataset_events:
            assert event["runName"] == "my-experiment"

    async def test_generates_different_run_id_for_each_experiment_execution(
        self, handler: ClaudeAgentWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Should generate different runId for each experiment execution."""

        async def mock_dataset() -> AsyncGenerator[dict[str, Any], None]:
            yield {
                "formatted": MagicMock(
                    query=MagicMock(prompt="test", options=MagicMock()),
                    telemetry=MagicMock(is_enabled=True, prompt_name="test"),
                ),
                "dataset": {"input": {}, "expected_output": ""},
            }

        async def mock_query_results() -> AsyncGenerator[dict[str, Any], None]:
            yield {"type": "result", "subtype": "success", "result": "R1"}

        with patch.object(
            handler,
            "_get_frontmatter",
            return_value={
                "name": "experiment-prompt",
                "text_config": {},
                "test_settings": {"dataset": "./test.jsonl"},
            },
        ):
            # Run experiment first time
            mock_client._mock_text_prompt.format_with_dataset.return_value = mock_dataset()
            with patch.object(handler, "_stream_query", return_value=mock_query_results()):
                result1 = await handler.run_experiment(create_mock_ast(), "same-name")
            chunks1 = await drain_stream(result1.stream)
            parsed1 = [json.loads(c) for c in chunks1]
            run_id_1 = next((p for p in parsed1 if p.get("type") == "experiment_start"), {}).get(
                "runId"
            )

            # Run experiment second time
            mock_client._mock_text_prompt.format_with_dataset.return_value = mock_dataset()
            with patch.object(handler, "_stream_query", return_value=mock_query_results()):
                result2 = await handler.run_experiment(create_mock_ast(), "same-name")
            chunks2 = await drain_stream(result2.stream)
            parsed2 = [json.loads(c) for c in chunks2]
            run_id_2 = next((p for p in parsed2 if p.get("type") == "experiment_start"), {}).get(
                "runId"
            )

        # Both should be valid UUIDs
        uuid_pattern = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
        assert re.match(uuid_pattern, run_id_1, re.IGNORECASE)
        assert re.match(uuid_pattern, run_id_2, re.IGNORECASE)

        # But they should be different from each other
        assert run_id_1 != run_id_2
