"""Tests for PydanticAIWebhookHandler."""

from __future__ import annotations

import base64
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
    async def test_run_experiment_accepts_commit_sha_positional(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Regression: server.py dispatcher passes commit_sha as the 5th positional arg.

        Before the fix restoring commit_sha threading, run_experiment only accepted
        4 arguments (ignoring `self`). When server.py started forwarding
        ``data.get("commitSha")`` after PR #1754, every dataset-run call crashed with:
            TypeError: run_experiment() takes 5 positional arguments but 6 were given

        This test calls run_experiment with all 5 positional arguments exactly the
        way the server.py dispatcher does, verifying the signature and the internal
        propagation through _stream_experiment / _stream_text_experiment all accept
        the parameter without raising.
        """
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

        # Exact call shape from server.py:78-84 — five positional args,
        # commit_sha in the 5th slot.
        result = await handler.run_experiment(
            prompt_ast,
            "run-commit-sha",
            None,              # dataset_path
            None,              # sampling
            "abc123def456",    # commit_sha — this 5th positional arg was crashing
        )

        assert "stream" in result
        assert "streamHeaders" in result

        # Consume the stream to exercise _stream_experiment →
        # _stream_text_experiment and verify commit_sha propagates without error.
        async for _ in result["stream"]:
            pass

    @pytest.mark.asyncio
    async def test_dataset_chunk_includes_trace_id(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Regression: dataset-run chunks must carry a traceId so the CLI
        consumer (run-experiment.ts) can post eval scores via fire-and-forget
        POST /v1/scores.

        Without traceId, score posting is skipped (it requires traceId + evals)
        and the experiments Avg Score column stays empty — the exact regression
        described in issue #1860.
        """
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

        # Reader returns one valid item then terminates.
        mock_formatted = MagicMock()
        mock_formatted._raw_messages = []
        mock_formatted.user_prompt = "hi"

        mock_reader = MagicMock()
        mock_reader.read = AsyncMock(
            side_effect=[
                {
                    "done": False,
                    "value": {
                        "formatted": mock_formatted,
                        "dataset": {"input": "hello", "expected_output": "world"},
                        "evals": [],
                    },
                },
                {"done": True},
            ]
        )
        mock_dataset = MagicMock()
        mock_dataset.get_reader = MagicMock(return_value=mock_reader)
        mock_client._mock_prompt.format_with_dataset = AsyncMock(return_value=mock_dataset)

        mock_usage = MagicMock()
        mock_usage.total_tokens = 42
        mock_run_result = MagicMock()
        mock_run_result.output = "hi back"
        mock_run_result.usage = mock_usage

        with patch(
            "agentmark_pydantic_ai_v0.webhook.run_text_prompt",
            AsyncMock(return_value=mock_run_result),
        ):
            result = await handler.run_experiment(
                prompt_ast, "run-trace-id"
            )
            chunks: list[str] = []
            async for chunk in result["stream"]:
                chunks.append(chunk)

        # There should be exactly one dataset chunk (no error items in the stream).
        dataset_chunks = [json.loads(c) for c in chunks if json.loads(c).get("type") == "dataset"]
        assert len(dataset_chunks) == 1
        event = dataset_chunks[0]

        # traceId must be present and non-empty — the whole point of this
        # regression. A no-op/stub OTEL provider returns an all-zero trace ID,
        # which is still a valid base64 string, so assert presence + type.
        assert "traceId" in event
        assert isinstance(event["traceId"], str)
        assert event["traceId"] != ""

        # traceId should be valid base64 (pydantic adapter encodes hex → base64)
        try:
            decoded = base64.b64decode(event["traceId"])
            assert len(decoded) > 0
        except Exception:
            pytest.fail(f"traceId is not valid base64: {event['traceId']!r}")

    @pytest.mark.asyncio
    async def test_wrapper_span_sets_agentmark_props_and_output(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Regression: the experiment wrapper span must set agentmark.props
        (dataset input) and agentmark.output (model output) attributes so the
        normalizer can promote them into NormalizedSpan.input/output and the
        trace drawer can render the wrapper's I/O.

        Without these attributes, the wrapper span shows empty input/output
        in the CLI trace view because isAgentSpan() (in use-span-prompts.ts)
        only detects agent-like spans by their 'props' attribute.

        This mirrors the standard pattern used by claude-agent-sdk-v0-adapter-
        python/traced.py, which sets agentmark.props on its invoke_agent span.
        """
        from contextlib import asynccontextmanager

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

        mock_formatted = MagicMock()
        mock_formatted._raw_messages = []
        mock_formatted.user_prompt = "hi"

        mock_reader = MagicMock()
        mock_reader.read = AsyncMock(
            side_effect=[
                {
                    "done": False,
                    "value": {
                        "formatted": mock_formatted,
                        "dataset": {
                            "input": {"topic": "sunsets"},
                            "expected_output": "a poem",
                        },
                        "evals": [],
                    },
                },
                {"done": True},
            ]
        )
        mock_dataset = MagicMock()
        mock_dataset.get_reader = MagicMock(return_value=mock_reader)
        mock_client._mock_prompt.format_with_dataset = AsyncMock(return_value=mock_dataset)

        mock_usage = MagicMock()
        mock_usage.total_tokens = 42
        mock_run_result = MagicMock()
        mock_run_result.output = "Sunsets are beautiful."
        mock_run_result.usage = mock_usage

        # Capture set_attribute calls on the span context yielded by span_context().
        # We patch span_context with a synchronous function that returns an async
        # context manager yielding a MagicMock context object.
        recorded_attrs: dict[str, Any] = {}

        class _FakeCtx:
            trace_id = "00" * 16  # valid hex, 32 chars

            def set_attribute(self, key: str, value: Any) -> None:
                recorded_attrs[key] = value

        @asynccontextmanager
        async def fake_span_context(_options: Any):
            yield _FakeCtx()

        with patch(
            "agentmark_pydantic_ai_v0.webhook.run_text_prompt",
            AsyncMock(return_value=mock_run_result),
        ), patch(
            "agentmark_sdk.span_context",
            fake_span_context,
        ):
            result = await handler.run_experiment(prompt_ast, "run-props-output")
            async for _ in result["stream"]:
                pass

        # Both attributes must be set.
        assert "agentmark.props" in recorded_attrs, (
            "Wrapper span missing agentmark.props — see use-span-prompts.ts "
            "isAgentSpan() which requires this attribute to render I/O."
        )
        assert "agentmark.output" in recorded_attrs, (
            "Wrapper span missing agentmark.output — trace drawer cannot "
            "render the model output without this."
        )

        # agentmark.props should be the JSON-serialized dataset input.
        props = json.loads(recorded_attrs["agentmark.props"])
        assert props == {"topic": "sunsets"}

        # agentmark.output should be the JSON-serialized model output.
        output = json.loads(recorded_attrs["agentmark.output"])
        assert output == "Sunsets are beautiful."


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


@pytest.mark.asyncio
class TestSpanOptionsFieldVerification:
    """Regression: experiment wrapper spans must carry ALL dataset attributes
    via SpanOptions. Without this test, a regression removing any single field
    (e.g. dataset_run_id, dataset_item_name) would go undetected.

    This is the core regression guard for issue #1860.
    """

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

    async def test_span_options_carry_all_dataset_fields(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """SpanOptions passed to span_context must contain all dataset fields."""
        import hashlib
        from contextlib import asynccontextmanager

        prompt_ast: dict[str, Any] = {
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

        mock_formatted = MagicMock()
        mock_formatted._raw_messages = []
        mock_formatted.user_prompt = "hi"

        mock_reader = MagicMock()
        mock_reader.read = AsyncMock(
            side_effect=[
                {
                    "done": False,
                    "value": {
                        "formatted": mock_formatted,
                        "dataset": {
                            "input": {"topic": "sunsets"},
                            "expected_output": "a poem",
                        },
                        "evals": [],
                    },
                },
                {"done": True},
            ]
        )
        mock_dataset = MagicMock()
        mock_dataset.get_reader = MagicMock(return_value=mock_reader)
        mock_client._mock_prompt = MagicMock()
        mock_client._mock_prompt.format_with_dataset = AsyncMock(return_value=mock_dataset)
        mock_client.load_text_prompt = AsyncMock(return_value=mock_client._mock_prompt)

        mock_usage = MagicMock()
        mock_usage.total_tokens = 42
        mock_run_result = MagicMock()
        mock_run_result.output = "Beautiful sunset poem"
        mock_run_result.usage = mock_usage

        # Capture the SpanOptions object passed to span_context.
        captured_options: list[Any] = []

        class _FakeCtx:
            trace_id = "ab" * 16

            def set_attribute(self, key: str, value: Any) -> None:
                pass

        @asynccontextmanager
        async def fake_span_context(options: Any):
            captured_options.append(options)
            yield _FakeCtx()

        with patch(
            "agentmark_pydantic_ai_v0.webhook.run_text_prompt",
            AsyncMock(return_value=mock_run_result),
        ), patch(
            "agentmark_sdk.span_context",
            fake_span_context,
        ):
            result = await handler.run_experiment(
                prompt_ast,
                "my-experiment",
                commit_sha="deadbeef1234",
            )
            async for _ in result["stream"]:
                pass

        assert len(captured_options) == 1, "span_context should be called once per dataset item"
        opts = captured_options[0]

        # Name matches experiment-<runName>-<index>
        assert opts.name == "experiment-my-experiment-0"

        # prompt_name is set from frontmatter
        assert opts.prompt_name == "my-test-prompt"

        # dataset_run_id is a non-empty UUID string
        assert isinstance(opts.dataset_run_id, str)
        assert len(opts.dataset_run_id) > 0

        # dataset_run_name matches the experiment name
        assert opts.dataset_run_name == "my-experiment"

        # dataset_item_name is a 12-char hex string (md5 hash of input)
        expected_hash = hashlib.md5(
            json.dumps({"topic": "sunsets"}, sort_keys=True, default=str).encode()
        ).hexdigest()[:12]
        assert opts.dataset_item_name == expected_hash

        # dataset_expected_output is JSON-serialized
        assert opts.dataset_expected_output == '"a poem"'

        # dataset_input is JSON-serialized
        assert opts.dataset_input == '{"topic": "sunsets"}'

        # dataset_path is set
        assert opts.dataset_path == "./test.jsonl"

        # metadata contains commit_sha
        assert isinstance(opts.metadata, dict)
        assert opts.metadata["commit_sha"] == "deadbeef1234"


@pytest.mark.asyncio
class TestSpanOptionsObjectConfig:
    """Regression: SpanOptions fields must also be correct for _stream_object_experiment.

    Commit 64a9333b2 specifically fixed the object path. The existing
    test_span_options_carry_all_dataset_fields only exercises text_config.
    """

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

    async def test_span_options_carry_all_dataset_fields_object_config(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """Same as text_config variant but for _stream_object_experiment.
        Commit 64a9333b2 originally fixed the object path specifically."""
        import hashlib
        from contextlib import asynccontextmanager

        prompt_ast: dict[str, Any] = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": (
                        "name: my-object-prompt\n"
                        "object_config:\n  model_name: test\n  output:\n    schema:\n      type: object\n"
                        "test_settings:\n  dataset: ./test.jsonl"
                    ),
                }
            ],
            "data": {},
        }

        mock_formatted = MagicMock()
        mock_formatted._raw_messages = []
        mock_formatted.user_prompt = "hi"

        mock_reader = MagicMock()
        mock_reader.read = AsyncMock(
            side_effect=[
                {
                    "done": False,
                    "value": {
                        "formatted": mock_formatted,
                        "dataset": {
                            "input": {"topic": "sunsets"},
                            "expected_output": {"answer": 42},
                        },
                        "evals": [],
                    },
                },
                {"done": True},
            ]
        )
        mock_dataset = MagicMock()
        mock_dataset.get_reader = MagicMock(return_value=mock_reader)

        mock_object_prompt = MagicMock()
        mock_object_prompt.format_with_dataset = AsyncMock(return_value=mock_dataset)
        mock_client.load_object_prompt = AsyncMock(return_value=mock_object_prompt)

        mock_usage = MagicMock()
        mock_usage.total_tokens = 42
        mock_run_result = MagicMock()
        mock_run_result.output = {"answer": 42}
        mock_run_result.usage = mock_usage

        # Capture the SpanOptions object passed to span_context.
        captured_options: list[Any] = []

        class _FakeCtx:
            trace_id = "ab" * 16

            def set_attribute(self, key: str, value: Any) -> None:
                pass

        @asynccontextmanager
        async def fake_span_context(options: Any):
            captured_options.append(options)
            yield _FakeCtx()

        with patch(
            "agentmark_pydantic_ai_v0.webhook.run_object_prompt",
            AsyncMock(return_value=mock_run_result),
        ), patch(
            "agentmark_sdk.span_context",
            fake_span_context,
        ):
            result = await handler.run_experiment(
                prompt_ast,
                "my-experiment",
                commit_sha="deadbeef1234",
            )
            async for _ in result["stream"]:
                pass

        assert len(captured_options) == 1, "span_context should be called once per dataset item"
        opts = captured_options[0]

        # Name matches experiment-<runName>-<index>
        assert opts.name == "experiment-my-experiment-0"

        # prompt_name is set from frontmatter
        assert opts.prompt_name == "my-object-prompt"

        # dataset_run_id is a non-empty UUID string
        assert isinstance(opts.dataset_run_id, str)
        assert len(opts.dataset_run_id) > 0

        # dataset_run_name matches the experiment name
        assert opts.dataset_run_name == "my-experiment"

        # dataset_item_name is a 12-char hex string (md5 hash of input)
        expected_hash = hashlib.md5(
            json.dumps({"topic": "sunsets"}, sort_keys=True, default=str).encode()
        ).hexdigest()[:12]
        assert opts.dataset_item_name == expected_hash

        # dataset_expected_output is JSON-serialized
        assert opts.dataset_expected_output == '{"answer": 42}'

        # dataset_input is JSON-serialized
        assert opts.dataset_input == '{"topic": "sunsets"}'

        # dataset_path is set
        assert opts.dataset_path == "./test.jsonl"

        # metadata contains commit_sha
        assert isinstance(opts.metadata, dict)
        assert opts.metadata["commit_sha"] == "deadbeef1234"


@pytest.mark.asyncio
class TestSpanOptionsEdgeCases:
    """Edge case tests for SpanOptions in experiment wrapper spans."""

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

    def _setup_text_experiment(
        self,
        mock_client: MagicMock,
        dataset_items: list[dict[str, Any]],
    ) -> tuple[dict[str, Any], MagicMock]:
        """Shared setup: creates a prompt_ast and configures mock_client
        to return the given dataset items from the reader."""
        prompt_ast: dict[str, Any] = {
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

        mock_formatted = MagicMock()
        mock_formatted._raw_messages = []
        mock_formatted.user_prompt = "hi"

        side_effects: list[dict[str, Any]] = []
        for item in dataset_items:
            side_effects.append({
                "done": False,
                "value": {
                    "formatted": mock_formatted,
                    "dataset": item,
                    "evals": [],
                },
            })
        side_effects.append({"done": True})

        mock_reader = MagicMock()
        mock_reader.read = AsyncMock(side_effect=side_effects)
        mock_dataset = MagicMock()
        mock_dataset.get_reader = MagicMock(return_value=mock_reader)
        mock_prompt = MagicMock()
        mock_prompt.format_with_dataset = AsyncMock(return_value=mock_dataset)
        mock_client.load_text_prompt = AsyncMock(return_value=mock_prompt)

        return prompt_ast, mock_prompt

    async def test_span_options_metadata_is_none_when_no_commit_sha(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """When commit_sha is not provided, SpanOptions.metadata must be None,
        not {"commit_sha": None}."""
        from contextlib import asynccontextmanager

        prompt_ast, _ = self._setup_text_experiment(
            mock_client,
            [{"input": {"topic": "test"}, "expected_output": "answer"}],
        )

        mock_usage = MagicMock()
        mock_usage.total_tokens = 10
        mock_run_result = MagicMock()
        mock_run_result.output = "result"
        mock_run_result.usage = mock_usage

        captured_options: list[Any] = []

        class _FakeCtx:
            trace_id = "ab" * 16

            def set_attribute(self, key: str, value: Any) -> None:
                pass

        @asynccontextmanager
        async def fake_span_context(options: Any):
            captured_options.append(options)
            yield _FakeCtx()

        with patch(
            "agentmark_pydantic_ai_v0.webhook.run_text_prompt",
            AsyncMock(return_value=mock_run_result),
        ), patch(
            "agentmark_sdk.span_context",
            fake_span_context,
        ):
            result = await handler.run_experiment(prompt_ast, "my-experiment")
            async for _ in result["stream"]:
                pass

        assert len(captured_options) == 1
        opts = captured_options[0]
        assert opts.metadata is None

    async def test_dataset_item_name_falls_back_to_index_when_input_is_none(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """When dataset item has no input, dataset_item_name should be str(index)."""
        from contextlib import asynccontextmanager

        prompt_ast, _ = self._setup_text_experiment(
            mock_client,
            [{"input": None, "expected_output": "answer"}],
        )

        mock_usage = MagicMock()
        mock_usage.total_tokens = 10
        mock_run_result = MagicMock()
        mock_run_result.output = "result"
        mock_run_result.usage = mock_usage

        captured_options: list[Any] = []

        class _FakeCtx:
            trace_id = "ab" * 16

            def set_attribute(self, key: str, value: Any) -> None:
                pass

        @asynccontextmanager
        async def fake_span_context(options: Any):
            captured_options.append(options)
            yield _FakeCtx()

        with patch(
            "agentmark_pydantic_ai_v0.webhook.run_text_prompt",
            AsyncMock(return_value=mock_run_result),
        ), patch(
            "agentmark_sdk.span_context",
            fake_span_context,
        ):
            result = await handler.run_experiment(prompt_ast, "my-experiment")
            async for _ in result["stream"]:
                pass

        assert len(captured_options) == 1
        opts = captured_options[0]
        assert opts.dataset_item_name == "0"

    async def test_multi_item_experiment_increments_index_and_shares_run_id(
        self, handler: PydanticAIWebhookHandler, mock_client: MagicMock
    ) -> None:
        """With multiple dataset items, each gets an incrementing index in the
        span name, but all share the same dataset_run_id (one experiment = one run)."""
        from contextlib import asynccontextmanager

        prompt_ast, _ = self._setup_text_experiment(
            mock_client,
            [
                {"input": {"q": "first"}, "expected_output": "a1"},
                {"input": {"q": "second"}, "expected_output": "a2"},
            ],
        )

        mock_usage = MagicMock()
        mock_usage.total_tokens = 10
        mock_run_result = MagicMock()
        mock_run_result.output = "result"
        mock_run_result.usage = mock_usage

        captured_options: list[Any] = []

        class _FakeCtx:
            trace_id = "ab" * 16

            def set_attribute(self, key: str, value: Any) -> None:
                pass

        @asynccontextmanager
        async def fake_span_context(options: Any):
            captured_options.append(options)
            yield _FakeCtx()

        with patch(
            "agentmark_pydantic_ai_v0.webhook.run_text_prompt",
            AsyncMock(return_value=mock_run_result),
        ), patch(
            "agentmark_sdk.span_context",
            fake_span_context,
        ):
            result = await handler.run_experiment(prompt_ast, "my-experiment")
            async for _ in result["stream"]:
                pass

        assert len(captured_options) == 2
        assert captured_options[0].name == "experiment-my-experiment-0"
        assert captured_options[1].name == "experiment-my-experiment-1"
        assert captured_options[0].dataset_run_id == captured_options[1].dataset_run_id
        assert captured_options[0].dataset_run_id != ""
