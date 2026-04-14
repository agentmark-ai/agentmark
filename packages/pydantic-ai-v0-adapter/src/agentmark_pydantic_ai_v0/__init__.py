"""AgentMark Pydantic AI Adapter.

This package provides integration between AgentMark prompts and Pydantic AI
for type-safe LLM interactions in Python.

Example:
    from agentmark_pydantic_ai_v0 import create_pydantic_ai_client
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

MCP (Model Context Protocol) Example:
    from agentmark_pydantic_ai_v0 import create_pydantic_ai_client, McpServerRegistry

    # Create MCP registry
    mcp_registry = McpServerRegistry()
    mcp_registry.register("search", {"url": "http://localhost:8000/mcp"})

    # Create client with MCP support
    client = create_pydantic_ai_client(mcp_registry=mcp_registry)
"""

from __future__ import annotations

from importlib.metadata import version as _pkg_version
from typing import TYPE_CHECKING, Any

from agentmark.prompt_core import AgentMark, EvalRegistry
from agentmark.prompt_core.types import ScoreRegistry

from .adapter import PydanticAIAdapter
from .mcp import McpServerRegistry
from .model_registry import PydanticAIModelRegistry
from .runner import (
    ObjectRunResult,
    TextRunResult,
    run_object_prompt,
    run_text_prompt,
    stream_text_prompt,
)
from .server import create_webhook_server
from .types import (
    AdaptOptions,
    ModelFunctionCreator,
    PydanticAIObjectParams,
    PydanticAITextParams,
)
from .webhook import PydanticAIWebhookHandler

if TYPE_CHECKING:
    from collections.abc import Callable

    from pydantic_ai import Tool

    from agentmark.prompt_core.types import Loader


__all__ = [
    # Main exports
    "create_pydantic_ai_client",
    # Adapter
    "PydanticAIAdapter",
    # Registries
    "PydanticAIModelRegistry",
    "McpServerRegistry",
    # Types
    "PydanticAITextParams",
    "PydanticAIObjectParams",
    "ModelFunctionCreator",
    "AdaptOptions",
    # Runner utilities
    "run_text_prompt",
    "run_object_prompt",
    "stream_text_prompt",
    "TextRunResult",
    "ObjectRunResult",
    # Webhook server
    "create_webhook_server",
    "PydanticAIWebhookHandler",
]


def create_pydantic_ai_client(
    model_registry: PydanticAIModelRegistry | None = None,
    tools: list[Tool[Any] | Callable[..., Any]] | None = None,
    mcp_registry: McpServerRegistry | None = None,
    eval_registry: EvalRegistry | None = None,
    scores: ScoreRegistry | None = None,
    loader: Loader | None = None,
) -> AgentMark:
    """Create an AgentMark client configured for Pydantic AI.

    This is the main entry point for using AgentMark with Pydantic AI.
    Mirrors the TypeScript createAgentMarkClient factory function pattern.

    Args:
        model_registry: Optional registry mapping model names to Pydantic AI
            models. When omitted a default empty registry is created.
        tools: Optional list of native pydantic-ai Tool objects or callables.
            These are filtered at adapt time by matching names from the MDX
            config's tools list.
        mcp_registry: Optional MCP server registry for MCP tool resolution.
        eval_registry: Optional registry for evaluation functions
            (deprecated, use scores instead).
        scores: Optional score registry with schema definitions.
            When provided, takes precedence over eval_registry.
        loader: Optional loader for loading prompts from paths.

    Returns:
        Configured AgentMark client with PydanticAIAdapter.

    Example:
        # Register providers explicitly
        registry = PydanticAIModelRegistry()
        registry.register_providers({"openai": "openai", "anthropic": "anthropic"})
        client = create_pydantic_ai_client(model_registry=registry)

        # With additional exact-match overrides
        registry.register_models("my-model", lambda n, _: f"openai:{n}")
        client = create_pydantic_ai_client(model_registry=registry)

        # With native tools
        def search(query: str) -> str:
            return search_web(query)
        client = create_pydantic_ai_client(model_registry=registry, tools=[search])

        # With MCP servers
        mcp_registry = McpServerRegistry()
        mcp_registry.register("search-server", {"url": "http://localhost:8000/mcp"})
        client = create_pydantic_ai_client(model_registry=registry, mcp_registry=mcp_registry)

        # With scores (recommended over eval_registry)
        scores = {
            "accuracy": {
                "schema": {"type": "boolean"},
                "eval": my_accuracy_eval,
            },
        }
        client = create_pydantic_ai_client(model_registry=registry, scores=scores)
    """
    if model_registry is None:
        model_registry = PydanticAIModelRegistry()

    adapter = PydanticAIAdapter(
        model_registry=model_registry,
        tools=tools,
        mcp_registry=mcp_registry,
    )

    return AgentMark(
        adapter=adapter,
        loader=loader,
        eval_registry=eval_registry,
        scores=scores,
    )


# Read the runtime version from installed dist metadata so __version__ can never
# drift against pyproject.toml across releases (the previous hardcoded "0.1.0"
# was one patch behind "0.1.1" shipped in the actual PyPI dist).
__version__ = _pkg_version("agentmark-pydantic-ai-v0")
