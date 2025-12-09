"""AgentMark Pydantic AI Adapter.

This package provides integration between AgentMark prompts and Pydantic AI
for type-safe LLM interactions in Python.

Example:
    from agentmark_pydantic_ai import create_pydantic_ai_client
    from pydantic_ai import Agent

    # Create the client
    client = create_pydantic_ai_client()

    # Load and format a prompt (note: Python uses positional props, not object)
    prompt = await client.load_text_prompt(ast)
    params = await prompt.format(props={"name": "Alice"})

    # Execute with Pydantic AI
    agent = Agent(params.model, system_prompt=params.system_prompt)
    result = await agent.run(params.user_prompt)
    print(result.output)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from agentmark.prompt_core import AgentMark, EvalRegistry

from .adapter import PydanticAIAdapter
from .model_registry import PydanticAIModelRegistry, create_default_model_registry
from .runner import (
    ObjectRunResult,
    TextRunResult,
    run_object_prompt,
    run_text_prompt,
    stream_text_prompt,
)
from .tool_registry import PydanticAIToolRegistry
from .types import (
    AdaptOptions,
    AsyncToolFunction,
    ModelFunctionCreator,
    PydanticAIObjectParams,
    PydanticAITextParams,
    RegisteredTool,
    ToolFunction,
)

if TYPE_CHECKING:
    from agentmark.prompt_core.types import Loader


__all__ = [
    # Main exports
    "create_pydantic_ai_client",
    # Adapter
    "PydanticAIAdapter",
    # Registries
    "PydanticAIModelRegistry",
    "PydanticAIToolRegistry",
    "create_default_model_registry",
    # Types
    "PydanticAITextParams",
    "PydanticAIObjectParams",
    "ModelFunctionCreator",
    "RegisteredTool",
    "AdaptOptions",
    "ToolFunction",
    "AsyncToolFunction",
    # Runner utilities
    "run_text_prompt",
    "run_object_prompt",
    "stream_text_prompt",
    "TextRunResult",
    "ObjectRunResult",
]


def create_pydantic_ai_client(
    model_registry: PydanticAIModelRegistry | None = None,
    tool_registry: PydanticAIToolRegistry | None = None,
    eval_registry: EvalRegistry | None = None,
    loader: Loader | None = None,
) -> AgentMark:
    """Create an AgentMark client configured for Pydantic AI.

    This is the main entry point for using AgentMark with Pydantic AI.
    Mirrors the TypeScript createAgentMarkClient factory function pattern.

    Args:
        model_registry: Registry mapping model names to Pydantic AI models.
            If None, uses create_default_model_registry().
        tool_registry: Optional registry for tool execution functions.
        eval_registry: Optional registry for evaluation functions.
        loader: Optional loader for loading prompts from paths.

    Returns:
        Configured AgentMark client with PydanticAIAdapter.

    Example:
        # Basic usage
        client = create_pydantic_ai_client()

        # With custom model registry
        registry = PydanticAIModelRegistry()
        registry.register_models("my-model", lambda n, _: f"openai:{n}")
        client = create_pydantic_ai_client(model_registry=registry)

        # With tools
        tool_registry = PydanticAIToolRegistry()
        tool_registry.register("search", lambda args, ctx: search_web(args["query"]))
        client = create_pydantic_ai_client(tool_registry=tool_registry)

        # Full example
        client = create_pydantic_ai_client(
            model_registry=create_default_model_registry(),
            tool_registry=tool_registry,
            eval_registry=EvalRegistry(),
        )
    """
    if model_registry is None:
        model_registry = create_default_model_registry()

    adapter = PydanticAIAdapter(
        model_registry=model_registry,
        tool_registry=tool_registry,
    )

    return AgentMark(
        adapter=adapter,
        loader=loader,
        eval_registry=eval_registry,
    )


__version__ = "0.1.0"
