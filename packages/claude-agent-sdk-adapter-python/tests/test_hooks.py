"""Tests for Telemetry Hooks.

Ported from TypeScript: packages/claude-agent-sdk-adapter/test/hooks.test.ts
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from agentmark_claude_agent_sdk.hooks.telemetry_hooks import (
    TelemetryConfig,
    TelemetryEvent,
    create_telemetry_hooks,
    merge_hooks,
)
from tests.conftest import FIXED_TIMESTAMP_MS


class TestCreateTelemetryHooks:
    """Test suite for createTelemetryHooks."""

    async def test_not_emitting_events_when_telemetry_disabled(self) -> None:
        """Should not emit any events when telemetry is disabled."""
        event_handler = MagicMock()
        hooks = create_telemetry_hooks(
            TelemetryConfig(
                is_enabled=False,
                prompt_name="test-prompt",
                props={},
            ),
            event_handler,
        )

        # No hooks should be created
        assert len(hooks) == 0

        # Event handler should never be called
        event_handler.assert_not_called()

    async def test_emitting_events_for_each_hook_type(self) -> None:
        """Should emit events for each hook type when triggered."""
        event_handler = AsyncMock()
        hooks = create_telemetry_hooks(
            TelemetryConfig(
                is_enabled=True,
                prompt_name="test-prompt",
                props={},
            ),
            event_handler,
        )

        # Trigger SessionStart
        hook_input = {"hook_event_name": "SessionStart", "session_id": "test"}
        await hooks["SessionStart"][0]["hooks"][0](hook_input, None, {})

        event_handler.assert_called()
        call_args = event_handler.call_args[0][0]
        assert call_args["eventName"] == "session_start"

        # Trigger PreToolUse
        hook_input = {
            "hook_event_name": "PreToolUse",
            "session_id": "test",
            "tool_name": "Read",
        }
        await hooks["PreToolUse"][0]["hooks"][0](hook_input, "tool-1", {})

        # Trigger PostToolUse
        hook_input = {
            "hook_event_name": "PostToolUse",
            "session_id": "test",
            "tool_name": "Read",
        }
        await hooks["PostToolUse"][0]["hooks"][0](hook_input, "tool-1", {})

        # Verify all events were emitted
        assert event_handler.call_count == 3

    async def test_calls_event_handler_with_correct_data_for_session_start(self) -> None:
        """Should call event handler with correct data for SessionStart."""
        event_handler = AsyncMock()
        hooks = create_telemetry_hooks(
            TelemetryConfig(
                is_enabled=True,
                prompt_name="test-prompt",
                function_id="func-123",
                metadata={"userId": "user-1"},
                props={"task": "test"},
            ),
            event_handler,
        )

        hook_input = {
            "hook_event_name": "SessionStart",
            "session_id": "session-123",
            "cwd": "/test/dir",
            "transcript_path": "/test/transcript.json",
        }

        result = await hooks["SessionStart"][0]["hooks"][0](hook_input, None, {})

        assert result == {"continue": True}
        event_handler.assert_called_once()
        event = event_handler.call_args[0][0]
        assert event["eventName"] == "session_start"
        assert event["sessionId"] == "session-123"
        assert event["promptName"] == "test-prompt"
        assert event["data"]["cwd"] == "/test/dir"
        assert event["data"]["transcript_path"] == "/test/transcript.json"
        assert event["data"]["functionId"] == "func-123"
        assert event["data"]["metadata"] == {"userId": "user-1"}
        assert event["data"]["props"] == {"task": "test"}

    async def test_calls_event_handler_for_pre_tool_use(self) -> None:
        """Should call event handler for PreToolUse with tool info."""
        event_handler = AsyncMock()
        hooks = create_telemetry_hooks(
            TelemetryConfig(
                is_enabled=True,
                prompt_name="test-prompt",
                props={},
            ),
            event_handler,
        )

        hook_input = {
            "hook_event_name": "PreToolUse",
            "session_id": "session-123",
            "tool_name": "Read",
            "tool_input": {"file_path": "/test/file.ts"},
        }

        await hooks["PreToolUse"][0]["hooks"][0](hook_input, "tool-use-456", {})

        event_handler.assert_called_once()
        event = event_handler.call_args[0][0]
        assert event["eventName"] == "tool_start"
        assert event["data"]["tool_name"] == "Read"
        assert event["data"]["tool_input"] == {"file_path": "/test/file.ts"}
        assert event["data"]["tool_use_id"] == "tool-use-456"

    async def test_calls_event_handler_for_post_tool_use(self) -> None:
        """Should call event handler for PostToolUse with response."""
        event_handler = AsyncMock()
        hooks = create_telemetry_hooks(
            TelemetryConfig(
                is_enabled=True,
                prompt_name="test-prompt",
                props={},
            ),
            event_handler,
        )

        hook_input = {
            "hook_event_name": "PostToolUse",
            "session_id": "session-123",
            "tool_name": "Read",
            "tool_response": {"content": "file contents"},
        }

        await hooks["PostToolUse"][0]["hooks"][0](hook_input, "tool-use-456", {})

        event_handler.assert_called_once()
        event = event_handler.call_args[0][0]
        assert event["eventName"] == "tool_end"
        assert event["data"]["tool_name"] == "Read"
        assert event["data"]["tool_response"] == {"content": "file contents"}
        assert event["data"]["tool_use_id"] == "tool-use-456"

    async def test_calls_event_handler_for_post_tool_use_failure(self) -> None:
        """Should call event handler for PostToolUseFailure with error."""
        event_handler = AsyncMock()
        hooks = create_telemetry_hooks(
            TelemetryConfig(
                is_enabled=True,
                prompt_name="test-prompt",
                props={},
            ),
            event_handler,
        )

        hook_input = {
            "hook_event_name": "PostToolUseFailure",
            "session_id": "session-123",
            "tool_name": "Bash",
            "error": "Command failed with exit code 1",
        }

        await hooks["PostToolUseFailure"][0]["hooks"][0](hook_input, "tool-use-789", {})

        event_handler.assert_called_once()
        event = event_handler.call_args[0][0]
        assert event["eventName"] == "tool_error"
        assert event["data"]["tool_name"] == "Bash"
        assert event["data"]["error"] == "Command failed with exit code 1"
        assert event["data"]["tool_use_id"] == "tool-use-789"

    async def test_includes_timestamp_in_events(self) -> None:
        """Should include timestamp in events."""
        event_handler = AsyncMock()
        hooks = create_telemetry_hooks(
            TelemetryConfig(
                is_enabled=True,
                prompt_name="test-prompt",
                props={},
            ),
            event_handler,
        )

        with patch("time.time", return_value=FIXED_TIMESTAMP_MS / 1000):
            hook_input = {"hook_event_name": "SessionStart", "session_id": "test"}
            await hooks["SessionStart"][0]["hooks"][0](hook_input, None, {})

        event_handler.assert_called_once()
        event = event_handler.call_args[0][0]
        assert event["timestamp"] == FIXED_TIMESTAMP_MS

    async def test_works_without_event_handler(self) -> None:
        """Should work without event handler (no-op)."""
        hooks = create_telemetry_hooks(
            TelemetryConfig(
                is_enabled=True,
                prompt_name="test-prompt",
                props={},
            ),
        )

        # Should not throw
        hook_input = {"hook_event_name": "SessionStart", "session_id": "test"}
        result = await hooks["SessionStart"][0]["hooks"][0](hook_input, None, {})

        assert result == {"continue": True}

    async def test_awaits_async_event_handlers(self) -> None:
        """Should await async event handlers and maintain execution order."""
        execution_order: list[str] = []

        async def async_event_handler(event: TelemetryEvent) -> None:
            execution_order.append(f"start:{event['eventName']}")
            # Simulate async work
            await asyncio.sleep(0.005)
            execution_order.append(f"end:{event['eventName']}")

        hooks = create_telemetry_hooks(
            TelemetryConfig(
                is_enabled=True,
                prompt_name="test-prompt",
                props={},
            ),
            async_event_handler,
        )

        # Call hook and wait for it to complete
        hook_input = {"hook_event_name": "SessionStart", "session_id": "test"}
        await hooks["SessionStart"][0]["hooks"][0](hook_input, None, {})

        # Verify async handler completed (not just started)
        assert "start:session_start" in execution_order
        assert "end:session_start" in execution_order

        # Verify order: start before end
        start_index = execution_order.index("start:session_start")
        end_index = execution_order.index("end:session_start")
        assert start_index < end_index


class TestMergeHooks:
    """Test suite for mergeHooks."""

    def test_merges_hooks_from_multiple_configurations(self) -> None:
        """Should merge hooks from multiple configurations."""
        hook1 = AsyncMock(return_value={"continue": True})
        hook2 = AsyncMock(return_value={"continue": True})

        config1 = {"SessionStart": [{"hooks": [hook1]}]}
        config2 = {
            "SessionStart": [{"hooks": [hook2]}],
            "SessionEnd": [{"hooks": [hook1]}],
        }

        merged = merge_hooks(config1, config2)

        # mergeHooks concatenates arrays of matchers
        assert len(merged["SessionStart"]) == 2
        assert merged["SessionStart"][0]["hooks"][0] is hook1
        assert merged["SessionStart"][1]["hooks"][0] is hook2
        assert len(merged["SessionEnd"]) == 1

    def test_handles_empty_configurations(self) -> None:
        """Should handle empty configurations."""
        hook = AsyncMock(return_value={"continue": True})

        merged = merge_hooks({}, {"SessionStart": [{"hooks": [hook]}]}, {})

        assert len(merged["SessionStart"]) == 1
        assert merged["SessionStart"][0]["hooks"][0] is hook

    def test_returns_empty_object_for_null_undefined(self) -> None:
        """Should return empty dict and handle None gracefully."""
        # Test with no args
        merged = merge_hooks()
        assert len(merged) == 0

        # Test with empty dicts
        merged_empty = merge_hooks({}, {})
        assert len(merged_empty) == 0

        # Test mixing empty and populated configs
        hook = AsyncMock(return_value={"continue": True})
        merged_mixed = merge_hooks({}, {"SessionStart": [{"hooks": [hook]}]}, {})
        assert len(merged_mixed["SessionStart"]) == 1

    def test_preserves_matcher_order_across_merges(self) -> None:
        """Should preserve matcher order across merges."""
        hook1 = AsyncMock(return_value={"continue": True})
        hook2 = AsyncMock(return_value={"continue": True})
        hook3 = AsyncMock(return_value={"continue": True})

        merged = merge_hooks(
            {"PreToolUse": [{"hooks": [hook1]}]},
            {"PreToolUse": [{"hooks": [hook2]}]},
            {"PreToolUse": [{"hooks": [hook3]}]},
        )

        # Each config contributes one matcher
        assert len(merged["PreToolUse"]) == 3
        assert merged["PreToolUse"][0]["hooks"][0] is hook1
        assert merged["PreToolUse"][1]["hooks"][0] is hook2
        assert merged["PreToolUse"][2]["hooks"][0] is hook3

    def test_not_mutates_original_configurations(self) -> None:
        """Should not mutate original configurations with nested hooks."""
        hook1 = AsyncMock(return_value={"continue": True})
        hook2 = AsyncMock(return_value={"continue": True})
        hook3 = AsyncMock(return_value={"continue": True})

        config1 = {
            "SessionStart": [{"hooks": [hook1]}],
            "PreToolUse": [{"hooks": [hook2]}],
        }
        config2 = {"SessionStart": [{"hooks": [hook3]}]}

        original_config1_length = len(config1["SessionStart"])
        original_config1_pre_tool_length = len(config1["PreToolUse"])
        original_config2_length = len(config2["SessionStart"])

        merged = merge_hooks(config1, config2)

        # Original configs should be unchanged
        assert len(config1["SessionStart"]) == original_config1_length
        assert len(config1["PreToolUse"]) == original_config1_pre_tool_length
        assert len(config2["SessionStart"]) == original_config2_length

        # Merged result should have combined hooks
        assert len(merged["SessionStart"]) == 2
        assert len(merged["PreToolUse"]) == 1

        # Modifying merged should not affect originals
        merged["SessionStart"].append({"hooks": [MagicMock()]})
        assert len(config1["SessionStart"]) == original_config1_length


class TestHookEventCoverage:
    """Test suite for hook event coverage."""

    async def test_emits_events_with_correct_payload_for_all_hook_types(self) -> None:
        """Should emit events with correct payload for all hook types."""
        event_handler = AsyncMock()
        hooks = create_telemetry_hooks(
            TelemetryConfig(
                is_enabled=True,
                prompt_name="test-prompt",
                props={"task": "unit-test"},
            ),
            event_handler,
        )

        # Test SessionStart payload
        hook_input = {
            "hook_event_name": "SessionStart",
            "session_id": "sess-1",
            "cwd": "/test",
        }
        await hooks["SessionStart"][0]["hooks"][0](hook_input, None, {})

        event = event_handler.call_args[0][0]
        assert event["eventName"] == "session_start"
        assert event["sessionId"] == "sess-1"
        assert event["promptName"] == "test-prompt"
        assert event["data"]["cwd"] == "/test"

        # Test Stop payload (includes reason and tokens)
        hook_input = {
            "hook_event_name": "Stop",
            "session_id": "sess-1",
            "reason": "end_turn",
        }
        await hooks["Stop"][0]["hooks"][0](hook_input, None, {})

        event = event_handler.call_args[0][0]
        assert event["eventName"] == "agent_stop"
        assert event["data"]["reason"] == "end_turn"

        # Test SubagentStart payload
        hook_input = {
            "hook_event_name": "SubagentStart",
            "session_id": "sub-1",
            "subagent_type": "explore",
        }
        await hooks["SubagentStart"][0]["hooks"][0](hook_input, None, {})

        event = event_handler.call_args[0][0]
        assert event["eventName"] == "subagent_start"
        assert event["sessionId"] == "sub-1"

    async def test_not_tracking_sensitive_permission_events(self) -> None:
        """Should not track sensitive permission events for security."""
        event_handler = AsyncMock()
        hooks = create_telemetry_hooks(
            TelemetryConfig(
                is_enabled=True,
                prompt_name="test",
                props={},
            ),
            event_handler,
        )

        # Permission-related hooks should not exist (security consideration)
        assert "PreCompact" not in hooks
        assert "PermissionRequest" not in hooks
        assert "Notification" not in hooks

        # UserPromptSubmit is handled by OTEL hooks, not telemetry hooks
        assert "UserPromptSubmit" not in hooks

        # Verify event handler was not called since no hooks were triggered
        event_handler.assert_not_called()
