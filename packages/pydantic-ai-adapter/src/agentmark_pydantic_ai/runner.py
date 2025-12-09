"""Convenience utilities for running AgentMark prompts with Pydantic AI.

These utilities provide a simple interface for executing adapted prompts
without manually creating Agent instances.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import TYPE_CHECKING, Generic, TypeVar

from pydantic_ai import Agent
from pydantic_ai.usage import RunUsage

from .types import PydanticAIObjectParams, PydanticAITextParams

if TYPE_CHECKING:
    from pydantic_ai.messages import ModelMessage


T = TypeVar("T")


@dataclass
class TextRunResult:
    """Result from running a text prompt."""

    output: str
    messages: list[ModelMessage]
    usage: RunUsage


@dataclass
class ObjectRunResult(Generic[T]):
    """Result from running an object prompt."""

    output: T
    messages: list[ModelMessage]
    usage: RunUsage


async def run_text_prompt(
    params: PydanticAITextParams,
    message_history: list[ModelMessage] | None = None,
) -> TextRunResult:
    """Run a text prompt with Pydantic AI.

    Convenience function that creates an Agent and runs it.

    Args:
        params: Adapted parameters from PydanticAIAdapter.adapt_text().
        message_history: Optional conversation history for multi-turn.

    Returns:
        TextRunResult with output, messages, and usage stats.

    Example:
        params = adapter.adapt_text(config, options, metadata)
        result = await run_text_prompt(params)
        print(result.output)
    """
    # Create agent with pre-converted prompts
    # Handle None system_prompt by using empty string
    system_prompt = params.system_prompt if params.system_prompt else ""
    agent: Agent[None, str] = Agent(
        model=params.model,
        system_prompt=system_prompt,
        model_settings=params.model_settings,
        tools=params.tools,
    )

    # Run
    result = await agent.run(
        params.user_prompt,
        message_history=message_history,
    )

    return TextRunResult(
        output=result.output,
        messages=result.all_messages(),
        usage=result.usage(),
    )


async def run_object_prompt(
    params: PydanticAIObjectParams[T],
    message_history: list[ModelMessage] | None = None,
) -> ObjectRunResult[T]:
    """Run an object prompt with Pydantic AI.

    Args:
        params: Adapted parameters from PydanticAIAdapter.adapt_object().
        message_history: Optional conversation history.

    Returns:
        ObjectRunResult with typed output.

    Example:
        params = adapter.adapt_object(config, options, metadata)
        result = await run_object_prompt(params)
        print(result.output.name)  # Typed access to output fields
    """
    # Create agent with output_type for structured response
    # Handle None system_prompt by using empty string
    system_prompt = params.system_prompt if params.system_prompt else ""
    agent: Agent[None, T] = Agent(
        model=params.model,
        system_prompt=system_prompt,
        model_settings=params.model_settings,
        output_type=params.output_type,
    )

    # Run
    result = await agent.run(
        params.user_prompt,
        message_history=message_history,
    )

    return ObjectRunResult(
        output=result.output,
        messages=result.all_messages(),
        usage=result.usage(),
    )


async def stream_text_prompt(
    params: PydanticAITextParams,
    message_history: list[ModelMessage] | None = None,
) -> AsyncIterator[str]:
    """Stream a text prompt response.

    Args:
        params: Adapted parameters from PydanticAIAdapter.adapt_text().
        message_history: Optional conversation history.

    Yields:
        Text chunks as they arrive.

    Example:
        params = adapter.adapt_text(config, options, metadata)
        async for chunk in stream_text_prompt(params):
            print(chunk, end="", flush=True)
    """
    # Handle None system_prompt by using empty string
    system_prompt = params.system_prompt if params.system_prompt else ""
    agent: Agent[None, str] = Agent(
        model=params.model,
        system_prompt=system_prompt,
        model_settings=params.model_settings,
        tools=params.tools,
    )

    async with agent.run_stream(
        params.user_prompt,
        message_history=message_history,
    ) as result:
        async for text in result.stream_text():
            yield text
