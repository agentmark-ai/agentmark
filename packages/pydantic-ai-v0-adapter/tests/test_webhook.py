"""Tests for PydanticAIWebhookHandler."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agentmark_pydantic_ai_v0.webhook import PydanticAIWebhookHandler


class TestWebhookHandlerEvals:
    """Tests for eval functionality in PydanticAIWebhookHandler."""

    @pytest.fixture
    def mock_client(self) -> MagicMock:
        """Create a mock AgentMark client."""
        client = MagicMock()
        client.eval_registry = None
        return client

    @pytest.fixture
    def handler(self, mock_client: MagicMock) -> PydanticAIWebhookHandler:
        """Create a webhook handler with mocked client."""
        return PydanticAIWebhookHandler(mock_client)

    @pytest.mark.asyncio
    async def test_run_eval_sync_function(
        self, handler: PydanticAIWebhookHandler
    ) -> None:
        """Test running a synchronous eval function."""

        def sync_eval(params: dict[str, Any]) -> dict[str, Any]:
            return {
                "passed": params["output"] == params["expectedOutput"],
                "score": 1.0 if params["output"] == params["expectedOutput"] else 0.0,
            }

        result = await handler._run_eval(
            eval_fn=sync_eval,
            eval_name="exact-match",
            input_data="test input",
            output="hello",
            expected_output="hello",
        )

        assert result["name"] == "exact-match"
        assert result["passed"] is True
        assert result["score"] == 1.0

    @pytest.mark.asyncio
    async def test_run_eval_async_function(
        self, handler: PydanticAIWebhookHandler
    ) -> None:
        """Test running an asynchronous eval function."""

        async def async_eval(_params: dict[str, Any]) -> dict[str, Any]:
            return {
                "passed": True,
                "score": 0.95,
                "reason": "Good response",
            }

        result = await handler._run_eval(
            eval_fn=async_eval,
            eval_name="quality-check",
            input_data="test input",
            output="output",
            expected_output=None,
        )

        assert result["name"] == "quality-check"
        assert result["passed"] is True
        assert result["score"] == 0.95
        assert result["reason"] == "Good response"

    @pytest.mark.asyncio
    async def test_execute_evals_no_registry(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Test execute_evals returns empty list when no registry."""
        mock_client.eval_registry = None

        result = await handler._execute_evals(
            eval_names=["eval1", "eval2"],
            input_data="input",
            output="output",
            expected_output="expected",
        )

        assert result == []

    @pytest.mark.asyncio
    async def test_execute_evals_with_registry(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Test execute_evals runs registered evals."""
        mock_registry = MagicMock()

        def exact_match_eval(params: dict[str, Any]) -> dict[str, Any]:
            return {"passed": params["output"] == params["expectedOutput"]}

        def length_check_eval(params: dict[str, Any]) -> dict[str, Any]:
            return {"passed": len(str(params["output"])) > 0}

        def get_eval(name: str):
            if name == "exact-match":
                return exact_match_eval
            if name == "length-check":
                return length_check_eval
            return None

        mock_registry.get.side_effect = get_eval
        mock_client.eval_registry = mock_registry

        result = await handler._execute_evals(
            eval_names=["exact-match", "length-check"],
            input_data="input",
            output="expected",
            expected_output="expected",
        )

        assert len(result) == 2
        assert result[0]["name"] == "exact-match"
        assert result[0]["passed"] is True
        assert result[1]["name"] == "length-check"
        assert result[1]["passed"] is True

    @pytest.mark.asyncio
    async def test_execute_evals_missing_eval(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Test execute_evals skips evals not in registry."""
        mock_registry = MagicMock()
        mock_registry.get.return_value = None
        mock_client.eval_registry = mock_registry

        result = await handler._execute_evals(
            eval_names=["nonexistent-eval"],
            input_data="input",
            output="output",
            expected_output="expected",
        )

        assert result == []

    @pytest.mark.asyncio
    async def test_execute_evals_propagates_error(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Test execute_evals propagates errors (matches TS behavior)."""
        mock_registry = MagicMock()

        def failing_eval(_params: dict[str, Any]) -> dict[str, Any]:
            raise ValueError("Eval failed")

        mock_registry.get.return_value = failing_eval
        mock_client.eval_registry = mock_registry

        # Errors propagate just like in TypeScript Promise.all()
        with pytest.raises(ValueError, match="Eval failed"):
            await handler._execute_evals(
                eval_names=["failing-eval"],
                input_data="input",
                output="output",
                expected_output="expected",
            )

    @pytest.mark.asyncio
    async def test_execute_evals_parallel_execution(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Test execute_evals runs in parallel (matches TS Promise.all())."""
        import asyncio

        mock_registry = MagicMock()
        call_order: list[str] = []

        async def slow_eval(_params: dict[str, Any]) -> dict[str, Any]:
            call_order.append("slow_start")
            await asyncio.sleep(0.05)
            call_order.append("slow_end")
            return {"passed": True, "name": "slow"}

        async def fast_eval(_params: dict[str, Any]) -> dict[str, Any]:
            call_order.append("fast_start")
            call_order.append("fast_end")
            return {"passed": True, "name": "fast"}

        def get_eval(name: str):
            if name == "slow":
                return slow_eval
            if name == "fast":
                return fast_eval
            return None

        mock_registry.get.side_effect = get_eval
        mock_client.eval_registry = mock_registry

        result = await handler._execute_evals(
            eval_names=["slow", "fast"],
            input_data="input",
            output="output",
            expected_output="expected",
        )

        assert len(result) == 2
        # Both evals should complete
        assert result[0]["passed"] is True
        assert result[1]["passed"] is True
        # With parallel execution, fast should start before slow ends
        assert "fast_start" in call_order


@pytest.mark.asyncio
class TestRunExperimentSampling:
    """Tests that sampling options are passed through to format_with_dataset."""

    @pytest.fixture
    def mock_client(self) -> MagicMock:
        """Create a mock AgentMark client."""
        client = MagicMock()
        client.eval_registry = None

        mock_prompt = MagicMock()

        # The pydantic-ai webhook uses get_reader() protocol, not async iteration
        mock_reader = MagicMock()
        mock_reader.read = AsyncMock(return_value={"done": True})
        mock_dataset = MagicMock()
        mock_dataset.get_reader = MagicMock(return_value=mock_reader)

        mock_prompt.format_with_dataset = AsyncMock(return_value=mock_dataset)
        client.load_text_prompt = AsyncMock(return_value=mock_prompt)
        client._mock_prompt = mock_prompt
        return client

    @pytest.fixture
    def handler(self, mock_client: MagicMock) -> PydanticAIWebhookHandler:
        """Create a webhook handler with mocked client."""
        return PydanticAIWebhookHandler(mock_client)

    @pytest.mark.asyncio
    async def test_passes_sampling_options_to_format_with_dataset(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Sampling options passed to run_experiment must reach format_with_dataset."""
        prompt_ast: dict[str, Any] = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": "text_config:\n  model_name: test\ntest_settings:\n  dataset: ./test.jsonl",
                }
            ],
            "data": {},
        }

        result = await handler.run_experiment(
            prompt_ast, "run-sampling", sampling={"rows": [0]}
        )

        # Consume the stream to trigger execution
        async for _ in result["stream"]:
            pass

        mock_client._mock_prompt.format_with_dataset.assert_called_once_with(
            dataset_path="./test.jsonl", sampling={"rows": [0]}
        )


@pytest.mark.asyncio
class TestStreamTextDelta:
    """Regression: _stream_text must yield incremental text deltas, not accumulated."""

    @pytest.fixture
    def mock_client(self) -> MagicMock:
        client = MagicMock()
        client.eval_registry = None
        return client

    @pytest.fixture
    def handler(self, mock_client: MagicMock) -> PydanticAIWebhookHandler:
        return PydanticAIWebhookHandler(mock_client)

    async def test_stream_text_yields_incremental_deltas(
        self, handler: PydanticAIWebhookHandler
    ) -> None:
        """_stream_text must yield individual text deltas via agent.iter(),
        not accumulated text. Each chunk should contain only the new part."""
        from pydantic_ai._agent_graph import CallToolsNode, End, ModelRequestNode
        from pydantic_ai.messages import (
            ModelResponse,
            PartDeltaEvent,
            TextPart,
            TextPartDelta,
        )

        params = MagicMock()
        params.model = "openai:gpt-4o-mini"
        params.system_prompt = "You are helpful"
        params.user_prompt = "Hi"
        params.model_settings = {}
        params.tools = []

        # Build a fake agent.iter() flow: ModelRequestNode → End
        async def fake_stream_events():
            yield PartDeltaEvent(index=0, delta=TextPartDelta(content_delta="Hello"))
            yield PartDeltaEvent(index=0, delta=TextPartDelta(content_delta=" world"))

        mock_stream = MagicMock()
        mock_stream.__aiter__ = lambda self: fake_stream_events()
        mock_stream.response = ModelResponse(parts=[TextPart(content="Hello world")])

        mock_stream_cm = MagicMock()
        mock_stream_cm.__aenter__ = AsyncMock(return_value=mock_stream)
        mock_stream_cm.__aexit__ = AsyncMock(return_value=False)

        mock_model_node = MagicMock(spec=ModelRequestNode)
        mock_model_node.stream = MagicMock(return_value=mock_stream_cm)

        mock_usage = MagicMock()
        mock_usage.request_tokens = 10
        mock_usage.response_tokens = 5
        mock_usage.total_tokens = 15

        # Fake agent run that yields one ModelRequestNode then ends
        async def fake_iter_nodes():
            yield mock_model_node

        mock_run = MagicMock()
        mock_run.__aiter__ = lambda self: fake_iter_nodes()
        mock_run.usage = MagicMock(return_value=mock_usage)

        mock_iter_cm = MagicMock()
        mock_iter_cm.__aenter__ = AsyncMock(return_value=mock_run)
        mock_iter_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("pydantic_ai.Agent") as MockAgent:
            mock_agent = MagicMock()
            mock_agent.iter = MagicMock(return_value=mock_iter_cm)
            MockAgent.return_value = mock_agent

            chunks: list[str] = []
            async for chunk in handler._stream_text(params):
                chunks.append(chunk)

        # Verify chunks are incremental text deltas
        text_chunks = [json.loads(c) for c in chunks if "result" in json.loads(c)]
        assert len(text_chunks) == 2
        assert text_chunks[0]["result"] == "Hello"
        assert text_chunks[1]["result"] == " world"


@pytest.mark.asyncio
class TestEvalsNoneHandling:
    """Regression: evals key with None value must not crash _execute_evals.

    Root cause: dict.get("evals", []) returns None when the key exists
    with value None. The fix uses `item.get("evals") or []`.
    """

    @pytest.fixture
    def mock_client(self) -> MagicMock:
        client = MagicMock()
        client.eval_registry = None
        return client

    @pytest.fixture
    def handler(self, mock_client: MagicMock) -> PydanticAIWebhookHandler:
        return PydanticAIWebhookHandler(mock_client)

    async def test_execute_evals_with_none_eval_names(
        self, handler: PydanticAIWebhookHandler
    ) -> None:
        """_execute_evals must handle None eval_names without TypeError."""
        # This was the crash: for eval_name in eval_names: TypeError: 'NoneType' not iterable
        result = await handler._execute_evals(
            eval_names=None,  # type: ignore[arg-type]
            input_data="input",
            output="output",
            expected_output="expected",
        )
        assert result == []

    async def test_execute_evals_with_empty_list(
        self, handler: PydanticAIWebhookHandler
    ) -> None:
        """_execute_evals with empty list should return empty results."""
        result = await handler._execute_evals(
            eval_names=[],
            input_data="input",
            output="output",
            expected_output="expected",
        )
        assert result == []

    async def test_dict_get_evals_or_pattern(self) -> None:
        """Verify the `or []` pattern handles None correctly.

        dict.get("evals", []) returns None when key exists with None value.
        dict.get("evals") or [] always returns [] for None/missing.
        """
        item_with_none = {"evals": None}
        item_missing = {}

        # The old bug: .get("evals", []) returns None
        assert item_with_none.get("evals", []) is None

        # The fix: .get("evals") or []
        assert (item_with_none.get("evals") or []) == []
        assert (item_missing.get("evals") or []) == []


@pytest.mark.asyncio
class TestNonStreamingToolCalls:
    """Regression: non-streaming text prompt must include toolCalls/toolResults."""

    @pytest.fixture
    def mock_client(self) -> MagicMock:
        client = MagicMock()
        client.eval_registry = None
        return client

    @pytest.fixture
    def handler(self, mock_client: MagicMock) -> PydanticAIWebhookHandler:
        return PydanticAIWebhookHandler(mock_client)

    async def test_run_text_prompt_includes_tool_calls(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Non-streaming response must contain toolCalls and toolResults."""
        from pydantic_ai.messages import (
            ModelRequest,
            ModelResponse,
            SystemPromptPart,
            TextPart,
            ToolCallPart,
            ToolReturnPart,
            UserPromptPart,
        )

        mock_prompt = MagicMock()

        # Build message history with tool call and result
        messages = [
            ModelRequest(parts=[
                SystemPromptPart(content="You are helpful."),
                UserPromptPart(content="How long is shipping?"),
            ]),
            ModelResponse(parts=[
                ToolCallPart(
                    tool_name="search_kb",
                    args='{"query": "shipping"}',
                    tool_call_id="call_123",
                ),
            ]),
            ModelRequest(parts=[
                ToolReturnPart(
                    tool_name="search_kb",
                    content="3-5 business days.",
                    tool_call_id="call_123",
                ),
            ]),
            ModelResponse(parts=[
                TextPart(content="Shipping takes 3-5 business days."),
            ]),
        ]

        mock_usage = MagicMock()
        mock_usage.request_tokens = 100
        mock_usage.response_tokens = 20
        mock_usage.total_tokens = 120

        mock_result = MagicMock()
        mock_result.output = "Shipping takes 3-5 business days."
        mock_result.messages = messages
        mock_result.usage = mock_usage

        # Mock the prompt format and run_text_prompt
        params = MagicMock()
        mock_prompt.format_with_test_props = AsyncMock(return_value=params)
        mock_client.load_text_prompt = AsyncMock(return_value=mock_prompt)

        prompt_ast = {
            "type": "root",
            "children": [{"type": "yaml", "value": "text_config:\n  model_name: test"}],
        }

        with patch(
            "agentmark_pydantic_ai_v0.webhook.run_text_prompt",
            AsyncMock(return_value=mock_result),
        ):
            result = await handler.run_prompt(prompt_ast, {"shouldStream": False})

        assert result["type"] == "text"
        assert result["result"] == "Shipping takes 3-5 business days."

        # Tool calls must be present
        assert len(result["toolCalls"]) == 1
        assert result["toolCalls"][0]["toolName"] == "search_kb"
        assert result["toolCalls"][0]["toolCallId"] == "call_123"
        assert result["toolCalls"][0]["args"] == {"query": "shipping"}

        # Tool results must be present
        assert len(result["toolResults"]) == 1
        assert result["toolResults"][0]["toolName"] == "search_kb"
        assert result["toolResults"][0]["result"] == "3-5 business days."
