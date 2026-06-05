"""PydanticAIExecutor — translates pydantic-ai Agent runs into AgentEvent.

Mirrors TypeScript's VercelAIExecutor for the shared WebhookRunner
protocol in `agentmark.prompt_core`. Pydantic models are yielded as
`ObjectFinalEvent.value` directly — the runner serializes via
`model_dump()` when emitting the wire response, so no pre-serialization
is required inside the executor.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from pydantic_ai import Agent
from pydantic_ai._agent_graph import CallToolsNode, ModelRequestNode
from pydantic_ai.messages import (
    FunctionToolResultEvent,
    PartDeltaEvent,
    TextPartDelta,
    ToolCallPart,
    ToolReturnPart,
)

from agentmark.prompt_core import (
    ExecCtx,
    Executor,
    ExecutorCapabilities,
    ObjectStreamEvent,
    TextStreamEvent,
)
from agentmark.prompt_core.executor import (
    ErrorEvent,
    FinishEvent,
    ObjectDeltaEvent,
    ObjectFinalEvent,
    TextDeltaEvent,
    ToolCallEvent,
    ToolResultEvent,
    UsageData,
)
from agentmark.prompt_core.executor_helpers import finalize_usage, normalize_error

from .types import PydanticAIObjectParams, PydanticAITextParams


def _extract_usage(run_usage: Any) -> UsageData | None:
    """Normalize pydantic-ai's RunUsage to the canonical UsageData via the
    shared ``finalize_usage`` helper. The adapter handles field-name
    aliasing (RunUsage uses ``request_tokens`` / ``response_tokens``); the
    ``total_tokens`` fallback logic lives in the shared helper so it can't
    drift between adapters.
    """
    if run_usage is None:
        return None
    return finalize_usage(
        input_tokens=getattr(run_usage, "request_tokens", None)
        or getattr(run_usage, "input_tokens", None)
        or 0,
        output_tokens=getattr(run_usage, "response_tokens", None)
        or getattr(run_usage, "output_tokens", None)
        or 0,
        total_tokens=getattr(run_usage, "total_tokens", None),
    )


class PydanticAIExecutor:
    """Executor for pydantic-ai. Compatible with the `Executor` Protocol."""

    name = "pydantic-ai-v0"

    def capabilities(self) -> ExecutorCapabilities:
        return ExecutorCapabilities(text=True, object=True, image=False, speech=False)

    def execute_text(
        self, formatted: Any, ctx: ExecCtx
    ) -> AsyncIterator[TextStreamEvent]:
        params: PydanticAITextParams = formatted
        if ctx.should_stream:
            return self._stream_text(params)
        return self._run_text(params)

    def execute_object(
        self, formatted: Any, ctx: ExecCtx
    ) -> AsyncIterator[ObjectStreamEvent]:
        params: PydanticAIObjectParams[Any] = formatted
        # pydantic-ai's structured output streaming is less mature; prefer
        # one-shot for byte-stable dashboards. Users who want partial
        # streaming on object prompts can override the executor.
        return self._run_object(params)

    async def _run_text(
        self, params: PydanticAITextParams
    ) -> AsyncIterator[TextStreamEvent]:
        try:
            agent: Agent[None, str] = Agent(
                model=params.model,
                system_prompt=params.system_prompt or "",
                model_settings=params.model_settings,
                tools=params.tools,
            )
            result = await agent.run(params.user_prompt)
        except Exception as exc:  # noqa: BLE001 — executor errors become events
            yield ErrorEvent(error=normalize_error(exc))
            return

        # Drain tool calls / results from message history for parity with
        # TypeScript's non-streaming text path.
        for msg in result.all_messages():
            for part in msg.parts:
                if isinstance(part, ToolCallPart):
                    args = part.args
                    if isinstance(args, str) and args:
                        try:
                            args = json.loads(args)
                        except json.JSONDecodeError:
                            pass
                    yield ToolCallEvent(
                        id=part.tool_call_id, name=part.tool_name, args=args
                    )
                elif isinstance(part, ToolReturnPart):
                    yield ToolResultEvent(
                        id=part.tool_call_id,
                        name=part.tool_name,
                        result=part.content,
                    )

        if result.output:
            yield TextDeltaEvent(text=result.output)
        yield FinishEvent(reason="stop", usage=_extract_usage(result.usage()))

    async def _stream_text(
        self, params: PydanticAITextParams
    ) -> AsyncIterator[TextStreamEvent]:
        try:
            agent: Agent[None, str] = Agent(
                model=params.model,
                system_prompt=params.system_prompt or "",
                model_settings=params.model_settings,
                tools=params.tools,
            )
            async with agent.iter(params.user_prompt) as run:
                final_usage: UsageData | None = None
                async for node in run:
                    if isinstance(node, ModelRequestNode):
                        async with node.stream(run.ctx) as stream:
                            async for event in stream:
                                if isinstance(event, PartDeltaEvent) and isinstance(
                                    event.delta, TextPartDelta
                                ):
                                    yield TextDeltaEvent(
                                        text=event.delta.content_delta
                                    )
                            for part in stream.response.parts:
                                if isinstance(part, ToolCallPart):
                                    args = part.args
                                    if isinstance(args, str) and args:
                                        try:
                                            args = json.loads(args)
                                        except json.JSONDecodeError:
                                            pass
                                    yield ToolCallEvent(
                                        id=part.tool_call_id,
                                        name=part.tool_name,
                                        args=args or {},
                                    )
                    elif isinstance(node, CallToolsNode):
                        async with node.stream(run.ctx) as stream:
                            async for event in stream:
                                if isinstance(event, FunctionToolResultEvent):
                                    part = event.result
                                    if isinstance(part, ToolReturnPart):
                                        yield ToolResultEvent(
                                            id=part.tool_call_id,
                                            name=part.tool_name,
                                            result=part.content,
                                        )
                # After the run completes, emit a combined finish+usage event
                # so the wire chunk matches the legacy adapter's shape.
                try:
                    final_usage = _extract_usage(run.usage())
                except Exception:  # noqa: BLE001
                    final_usage = None
            yield FinishEvent(reason="stop", usage=final_usage)
        except Exception as exc:  # noqa: BLE001
            yield ErrorEvent(error=normalize_error(exc))

    async def _run_object(
        self, params: PydanticAIObjectParams[Any]
    ) -> AsyncIterator[ObjectStreamEvent]:
        try:
            agent: Agent[None, Any] = Agent(
                model=params.model,
                system_prompt=params.system_prompt or "",
                model_settings=params.model_settings,
                output_type=params.output_type,
                tools=params.tools,
            )
            result = await agent.run(params.user_prompt)
        except Exception as exc:  # noqa: BLE001
            yield ErrorEvent(error=normalize_error(exc))
            return

        # Pydantic model or plain value — runner serializes via model_dump()
        # when emitting the wire response.
        yield ObjectFinalEvent(value=result.output)
        yield FinishEvent(reason="stop", usage=_extract_usage(result.usage()))
