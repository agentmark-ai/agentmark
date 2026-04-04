"""Internal runner utilities for the webhook server.

These are NOT part of the public API. Users should call their
framework (Pydantic AI) directly with the adapted params.

Used internally by PydanticAIWebhookHandler for prompt-run and
dataset-run events.
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
    """Run a text prompt. Internal use only."""
    system_prompt = params.system_prompt if params.system_prompt else ""
    agent: Agent[None, str] = Agent(
        model=params.model,
        system_prompt=system_prompt,
        model_settings=params.model_settings,
        tools=params.tools,
    )

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
    """Run an object prompt. Internal use only."""
    system_prompt = params.system_prompt if params.system_prompt else ""
    agent: Agent[None, T] = Agent(
        model=params.model,
        system_prompt=system_prompt,
        model_settings=params.model_settings,
        output_type=params.output_type,
        tools=params.tools,
    )

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
    """Stream a text prompt response. Internal use only."""
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
