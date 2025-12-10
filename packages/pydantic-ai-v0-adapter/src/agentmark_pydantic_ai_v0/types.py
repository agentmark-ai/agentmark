"""Type definitions for Pydantic AI adapter."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Generic, Protocol, TypeVar

if TYPE_CHECKING:
    from pydantic_ai import Tool
    from pydantic_ai.models import Model
    from pydantic_ai.settings import ModelSettings

    from agentmark.prompt_core.types import RichChatMessage


# Generic type variable for output type
T = TypeVar("T")


# Type for AdaptOptions - matches prompt-core's TypedDict
AdaptOptions = dict[str, Any]


@dataclass
class PydanticAITextParams:
    """Parameters for text generation via Pydantic AI Agent.

    These are the adapted parameters ready to be used with Pydantic AI's Agent.
    The runner utilities can convert these into actual Agent.run() calls.
    """

    model: Model | str
    system_prompt: str | None
    user_prompt: str
    model_settings: ModelSettings | None = None
    tools: list[Tool[Any]] = field(default_factory=list)
    tool_context: dict[str, Any] = field(default_factory=dict)

    # AgentMark metadata for tracing/telemetry
    prompt_name: str | None = None
    agentmark_meta: dict[str, Any] | None = None

    # Original messages (for advanced use cases like multi-turn)
    _raw_messages: list[RichChatMessage] = field(default_factory=list, repr=False)


@dataclass
class PydanticAIObjectParams(Generic[T]):
    """Parameters for structured output via Pydantic AI Agent.

    The output_type is a dynamically generated Pydantic model class
    that Pydantic AI uses for structured output validation.
    """

    model: Model | str
    system_prompt: str | None
    user_prompt: str
    output_type: type[T]
    model_settings: ModelSettings | None = None
    tool_context: dict[str, Any] = field(default_factory=dict)

    # AgentMark metadata for tracing/telemetry
    prompt_name: str | None = None
    agentmark_meta: dict[str, Any] | None = None

    # Original messages (for advanced use cases like multi-turn)
    _raw_messages: list[RichChatMessage] = field(default_factory=list, repr=False)


class ModelFunctionCreator(Protocol):
    """Protocol for model factory functions.

    Matches the TypeScript pattern where model creators receive
    the model name and adapter options (which may contain API keys,
    base URLs, etc.).
    """

    def __call__(
        self,
        model_name: str,
        options: AdaptOptions | None = None,
    ) -> Model | str:
        """Create or return a model instance for the given name.

        Args:
            model_name: The model name from AgentMark config.
            options: Adapter options (may contain apiKey, baseURL, etc.).

        Returns:
            A Pydantic AI Model instance or model string (e.g., "openai:gpt-4o").
        """
        ...


# Tool function types - matching Python prompt-core patterns
ToolFunction = Callable[[dict[str, Any], dict[str, Any] | None], Any]
AsyncToolFunction = Callable[[dict[str, Any], dict[str, Any] | None], Awaitable[Any]]


@dataclass
class RegisteredTool:
    """A registered tool with its execution function.

    Stored in the tool registry and used to build Pydantic AI Tool instances.
    """

    name: str
    execute: ToolFunction | AsyncToolFunction
    takes_ctx: bool = False
