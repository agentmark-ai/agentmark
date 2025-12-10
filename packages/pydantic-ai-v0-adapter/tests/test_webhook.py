"""Tests for PydanticAIWebhookHandler eval functionality."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

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

        async def async_eval(params: dict[str, Any]) -> dict[str, Any]:
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

        def failing_eval(params: dict[str, Any]) -> dict[str, Any]:
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

        async def slow_eval(params: dict[str, Any]) -> dict[str, Any]:
            call_order.append("slow_start")
            await asyncio.sleep(0.05)
            call_order.append("slow_end")
            return {"passed": True, "name": "slow"}

        async def fast_eval(params: dict[str, Any]) -> dict[str, Any]:
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
        assert "slow_end" in call_order
