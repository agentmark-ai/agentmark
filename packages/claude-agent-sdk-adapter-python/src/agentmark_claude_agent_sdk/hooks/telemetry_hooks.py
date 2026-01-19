"""Telemetry hooks for Claude Agent SDK adapter.

Ported from TypeScript: packages/claude-agent-sdk-adapter/src/hooks/telemetry-hooks.ts
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Literal, TypedDict

# Hook event names from Claude Agent SDK
HookEventName = Literal[
    "SessionStart",
    "SessionEnd",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "Stop",
    "UserPromptSubmit",
    "SubagentStart",
    "SubagentStop",
    "PreCompact",
    "PermissionRequest",
    "Notification",
]

# Hook configuration for Claude Agent SDK - dict of event name to list of matchers
HooksConfig = dict[str, list[dict[str, Any]]]


class TelemetryEvent(TypedDict, total=False):
    """Telemetry event data for external consumers."""

    eventName: str
    timestamp: int
    sessionId: str
    promptName: str
    data: dict[str, Any]


# Telemetry event handler type
TelemetryEventHandler = Callable[[TelemetryEvent], None | Awaitable[None]]


@dataclass
class TelemetryConfig:
    """Telemetry configuration for hooks."""

    is_enabled: bool
    prompt_name: str
    props: dict[str, Any]
    function_id: str | None = None
    metadata: dict[str, Any] | None = None


def create_telemetry_hooks(
    config: TelemetryConfig,
    event_handler: TelemetryEventHandler | None = None,
) -> HooksConfig:
    """Create telemetry hooks for Claude Agent SDK that integrate with AgentMark's tracing system.

    The hooks capture key events during agent execution:
    - Session start/end
    - Tool use (before and after)
    - Subagent events
    - Errors

    Args:
        config: Telemetry configuration.
        event_handler: Optional handler for telemetry events.

    Returns:
        Hook configuration for Claude Agent SDK.

    Example:
        hooks = create_telemetry_hooks(TelemetryConfig(
            is_enabled=True,
            prompt_name='my-agent-task',
            props={'userId': '123'},
        ))

        result = await query(
            prompt="Do something",
            options={"hooks": hooks}
        )
    """
    if not config.is_enabled:
        return {}

    async def emit_event(event_name: str, session_id: str, data: dict[str, Any]) -> None:
        if event_handler:
            event: TelemetryEvent = {
                "eventName": event_name,
                "timestamp": int(time.time() * 1000),
                "sessionId": session_id,
                "promptName": config.prompt_name,
                "data": {
                    **data,
                    "functionId": config.function_id,
                    "metadata": config.metadata,
                    "props": config.props,
                },
            }
            result = event_handler(event)
            if result is not None:
                await result

    async def session_start_hook(
        input_data: dict[str, Any],
        _tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        await emit_event(
            "session_start",
            input_data.get("session_id", ""),
            {
                "cwd": input_data.get("cwd"),
                "transcript_path": input_data.get("transcript_path"),
            },
        )
        return {"continue": True}

    async def session_end_hook(
        input_data: dict[str, Any],
        _tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        await emit_event(
            "session_end",
            input_data.get("session_id", ""),
            {"reason": input_data.get("reason")},
        )
        return {"continue": True}

    async def pre_tool_use_hook(
        input_data: dict[str, Any],
        tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        await emit_event(
            "tool_start",
            input_data.get("session_id", ""),
            {
                "tool_name": input_data.get("tool_name"),
                "tool_input": input_data.get("tool_input"),
                "tool_use_id": tool_use_id,
            },
        )
        return {"continue": True}

    async def post_tool_use_hook(
        input_data: dict[str, Any],
        tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        await emit_event(
            "tool_end",
            input_data.get("session_id", ""),
            {
                "tool_name": input_data.get("tool_name"),
                "tool_response": input_data.get("tool_response"),
                "tool_use_id": tool_use_id,
            },
        )
        return {"continue": True}

    async def post_tool_use_failure_hook(
        input_data: dict[str, Any],
        tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        await emit_event(
            "tool_error",
            input_data.get("session_id", ""),
            {
                "tool_name": input_data.get("tool_name"),
                "error": input_data.get("error"),
                "tool_use_id": tool_use_id,
            },
        )
        return {"continue": True}

    async def stop_hook(
        input_data: dict[str, Any],
        _tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        await emit_event(
            "agent_stop",
            input_data.get("session_id", ""),
            {
                "reason": input_data.get("reason"),
                "result": input_data.get("result"),
            },
        )
        return {"continue": True}

    async def subagent_start_hook(
        input_data: dict[str, Any],
        _tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        await emit_event(
            "subagent_start",
            input_data.get("session_id", ""),
            {
                "subagent_type": input_data.get("subagent_type"),
                "subagent_prompt": input_data.get("subagent_prompt"),
            },
        )
        return {"continue": True}

    async def subagent_stop_hook(
        input_data: dict[str, Any],
        _tool_use_id: str | None,
        _options: dict[str, Any],
    ) -> dict[str, Any]:
        await emit_event(
            "subagent_stop",
            input_data.get("session_id", ""),
            {"subagent_result": input_data.get("subagent_result")},
        )
        return {"continue": True}

    return {
        "SessionStart": [{"hooks": [session_start_hook]}],
        "SessionEnd": [{"hooks": [session_end_hook]}],
        "PreToolUse": [{"hooks": [pre_tool_use_hook]}],
        "PostToolUse": [{"hooks": [post_tool_use_hook]}],
        "PostToolUseFailure": [{"hooks": [post_tool_use_failure_hook]}],
        "Stop": [{"hooks": [stop_hook]}],
        "SubagentStart": [{"hooks": [subagent_start_hook]}],
        "SubagentStop": [{"hooks": [subagent_stop_hook]}],
    }


def merge_hooks(*configs: HooksConfig) -> HooksConfig:
    """Merge multiple hook configurations together.

    Each config has arrays of matchers per event - we concatenate the arrays.

    Args:
        *configs: Hook configurations to merge.

    Returns:
        Merged hook configuration.
    """
    merged: HooksConfig = {}

    for config in configs:
        if config is None:
            continue
        for event_name, matchers in config.items():
            if event_name in merged:
                merged[event_name] = [*merged[event_name], *matchers]
            else:
                merged[event_name] = [*matchers]

    return merged
