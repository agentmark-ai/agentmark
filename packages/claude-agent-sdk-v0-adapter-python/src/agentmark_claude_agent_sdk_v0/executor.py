"""ClaudeAgentExecutor — translates Claude Agent SDK query messages into AgentEvent.

Mirrors the TypeScript pattern in ai-sdk-v5-adapter's executor: the executor
translates SDK-native events into the canonical AgentEvent shape so the
shared WebhookRunner can emit the byte-stable wire format regardless of
which SDK is underneath.

Claude Agent SDK is autonomous-loop rather than request/response:
  - AssistantMessage with text blocks → text-delta / object-delta events.
  - ResultMessage (success) → final result + combined finish+usage event.
  - ResultMessage (error subtypes) → terminal error event.

Image + speech are declared unsupported via `capabilities()`; the runner
surfaces a canonical error when those kinds are invoked.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import aclosing
from typing import Any

from agentmark.prompt_core import (
    AgentEvent,
    ExecCtx,
    Executor,
    ExecutorCapabilities,
)
from agentmark.prompt_core.executor import (
    ErrorEvent,
    FinishEvent,
    ObjectDeltaEvent,
    ObjectFinalEvent,
    TextDeltaEvent,
    UsageData,
)
from agentmark.prompt_core.executor_helpers import finalize_usage, normalize_error


class ClaudeAgentExecutor:
    """Executor for claude-agent-sdk (Python). Conforms to the `Executor` Protocol."""

    name = "claude-agent-sdk-v0-python"

    def __init__(self, *, default_mcp_servers: dict[str, Any] | None = None) -> None:
        # Matches the existing ClaudeAgentWebhookHandler surface — users can
        # pre-register MCP servers at executor construction time.
        self._default_mcp_servers = default_mcp_servers or None

    def capabilities(self) -> ExecutorCapabilities:
        return ExecutorCapabilities(text=True, object=True, image=False, speech=False)

    def execute_text(
        self, formatted: Any, ctx: ExecCtx
    ) -> AsyncIterator[AgentEvent]:
        return self._execute_query(formatted, "text", ctx.should_stream)

    def execute_object(
        self, formatted: Any, ctx: ExecCtx
    ) -> AsyncIterator[AgentEvent]:
        return self._execute_query(formatted, "object", ctx.should_stream)

    async def _execute_query(
        self, adapted: Any, output_kind: str, should_stream: bool
    ) -> AsyncIterator[AgentEvent]:
        # Import lazily so the executor module stays cheap to import when
        # the SDK isn't installed — e.g. in type-checking contexts.
        from .traced import traced_query

        input_tokens = 0
        output_tokens = 0
        final_text = ""
        structured_output: Any = None
        errored = False

        try:
            # aclosing: when THIS generator is closed mid-stream (the
            # runner's cancellation path — e.g. client disconnect), the
            # GeneratorExit must propagate into the SDK query generator so
            # its cleanup (subprocess/connection teardown) runs NOW, not at
            # GC. A bare `async for` abandons its iterator without closing.
            async with aclosing(
                traced_query(
                    adapted, default_mcp_servers=self._default_mcp_servers
                )
            ) as stream:
                async for message in stream:
                    msg_type = type(message).__name__

                    if msg_type == "AssistantMessage":
                        # AssistantMessage blocks arrive as the agent thinks; for
                        # non-streaming runs we skip them because ResultMessage's
                        # `result` field already carries the final text. Emitting
                        # both double-counts the output in the drained response.
                        if not should_stream:
                            continue
                        content = getattr(message, "content", None) or []
                        for block in content:
                            text = (
                                block.get("text", "")
                                if isinstance(block, dict)
                                else getattr(block, "text", "")
                            )
                            if not text:
                                continue
                            if output_kind == "text":
                                yield TextDeltaEvent(text=text)
                            else:
                                # For object output, Claude streams JSON fragments
                                # of the structured response; surface them as
                                # object-delta events so consumers can render
                                # progress. Final value arrives on ResultMessage.
                                yield ObjectDeltaEvent(partial=text)

                    elif msg_type == "ResultMessage":
                        subtype = getattr(message, "subtype", "")
                        if subtype == "success":
                            final_text = getattr(message, "result", "") or ""
                            structured_output = getattr(
                                message, "structured_output", None
                            )
                            usage = getattr(message, "usage", {}) or {}
                            input_tokens = int(usage.get("input_tokens", 0) or 0)
                            output_tokens = int(usage.get("output_tokens", 0) or 0)
                        else:
                            errors = getattr(message, "errors", None) or []
                            err_msg = (
                                ", ".join(errors) if errors else f"Error: {subtype}"
                            )
                            yield ErrorEvent(error=err_msg)
                            errored = True
                            return
        except Exception as exc:  # noqa: BLE001 — executor errors become events
            yield ErrorEvent(error=normalize_error(exc))
            return

        if errored:
            return

        # Emit the final value so the drained non-streaming response has
        # the resolved output. In streaming mode the AssistantMessage
        # deltas already carry the full text; skip re-emitting to avoid
        # double-counting (seen as an extra "Final" delta after the
        # streamed "Hello" / "World" chunks in tests).
        if output_kind == "text":
            if final_text and not should_stream:
                yield TextDeltaEvent(text=final_text)
        else:
            yield ObjectFinalEvent(value=structured_output)

        yield FinishEvent(
            reason="stop",
            usage=finalize_usage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=None,
            ),
        )
