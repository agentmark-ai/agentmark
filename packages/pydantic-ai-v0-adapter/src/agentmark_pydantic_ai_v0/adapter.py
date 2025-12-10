"""Pydantic AI adapter for AgentMark.

Implements the Adapter protocol from prompt-core to transform AgentMark
configs into Pydantic AI Agent parameters.
"""

from __future__ import annotations

from collections.abc import Callable
from enum import Enum, StrEnum
from typing import TYPE_CHECKING, Any, cast

from agentmark.prompt_core.mcp import parse_mcp_uri
from pydantic import BaseModel, create_model
from pydantic_ai import Tool
from pydantic_ai.settings import ModelSettings

from .mcp import McpServerRegistry
from .model_registry import PydanticAIModelRegistry
from .tool_registry import PydanticAIToolRegistry
from .types import PydanticAIObjectParams, PydanticAITextParams, RegisteredTool

if TYPE_CHECKING:
    from agentmark.prompt_core.schemas import (
        ImageConfigSchema,
        ObjectConfigSchema,
        SpeechConfigSchema,
        TextConfigSchema,
    )
    from agentmark.prompt_core.types import (
        AdaptOptions,
        PromptMetadata,
    )


def _convert_messages_to_prompt(
    messages: list[Any],
) -> tuple[str | None, str]:
    """Convert AgentMark messages to Pydantic AI format.

    Pydantic AI uses separate system_prompt and user_prompt parameters,
    rather than a messages array. This function extracts and combines
    messages by role.

    Note: messages can be either Pydantic models (SystemMessageSchema,
    UserMessageSchema, AssistantMessageSchema) or TypedDicts. We handle
    both by using getattr with fallback to dict access.

    Args:
        messages: AgentMark chat messages (Pydantic models or TypedDicts).

    Returns:
        Tuple of (system_prompt, user_prompt).
    """
    system_parts: list[str] = []
    user_parts: list[str] = []

    for msg in messages:
        # Handle both Pydantic models (attribute access) and TypedDicts (dict access)
        if hasattr(msg, "role"):
            role = msg.role
            content = msg.content
        else:
            role = msg["role"]
            content = msg["content"]

        # Handle multipart content (text, images, files)
        if isinstance(content, list):
            text_parts = []
            for part in content:
                # Handle both Pydantic models and dicts for content parts
                if hasattr(part, "type") and part.type == "text":
                    text_parts.append(part.text)
                elif isinstance(part, dict) and part.get("type") == "text":
                    text_parts.append(part["text"])
            content_str = "\n".join(text_parts)
        else:
            content_str = str(content)

        if role == "system":
            system_parts.append(content_str)
        elif role == "user":
            user_parts.append(content_str)
        # Note: assistant messages are skipped for single-turn
        # For multi-turn, use message_history parameter

    system_prompt = "\n\n".join(system_parts) if system_parts else None
    user_prompt = "\n\n".join(user_parts) if user_parts else ""

    return system_prompt, user_prompt


def _build_model_settings(config: dict[str, Any]) -> ModelSettings | None:
    """Build Pydantic AI ModelSettings from AgentMark config.

    Maps AgentMark config keys to Pydantic AI ModelSettings parameters.

    Args:
        config: text_config or object_config as dict.

    Returns:
        ModelSettings or None if no relevant settings specified.
    """
    # Map AgentMark config keys to Pydantic AI ModelSettings keys
    settings_map = {
        "temperature": "temperature",
        "max_tokens": "max_tokens",
        "top_p": "top_p",
    }

    settings_dict: dict[str, Any] = {}
    for am_key, pai_key in settings_map.items():
        if am_key in config and config[am_key] is not None:
            settings_dict[pai_key] = config[am_key]

    if not settings_dict:
        return None

    # ModelSettings is a TypedDict; use cast for dynamic construction from validated keys
    return cast(ModelSettings, settings_dict)


class PydanticAIAdapter:
    """Adapter transforming AgentMark configs to Pydantic AI parameters.

    Implements the Adapter protocol from prompt-core. This adapter follows
    the same patterns as the TypeScript VercelAIAdapter:
    - Model registry for model name → instance mapping
    - Tool registry for type-safe tool execution
    - MCP registry for Model Context Protocol server integration
    - adapt_* methods for each prompt type

    Note: Pydantic AI focuses on language models, so adapt_image and
    adapt_speech raise NotImplementedError.

    Example:
        # Create registries
        model_registry = create_default_model_registry()
        tool_registry = PydanticAIToolRegistry()
        mcp_registry = McpServerRegistry()
        mcp_registry.register("search", {"url": "http://localhost:8000/mcp"})

        # Create adapter
        adapter = PydanticAIAdapter(
            model_registry=model_registry,
            tool_registry=tool_registry,
            mcp_registry=mcp_registry,
        )

        # Adapt a text config (async for MCP support)
        params = await adapter.adapt_text(config, options, metadata)

        # Execute with Pydantic AI
        from pydantic_ai import Agent
        agent = Agent(params.model, system_prompt=params.system_prompt)
        result = await agent.run(params.user_prompt)
    """

    def __init__(
        self,
        model_registry: PydanticAIModelRegistry,
        tool_registry: PydanticAIToolRegistry | None = None,
        mcp_registry: McpServerRegistry | None = None,
    ) -> None:
        """Initialize the adapter.

        Args:
            model_registry: Registry for model name resolution.
            tool_registry: Optional tool registry for tool execution.
            mcp_registry: Optional MCP server registry for MCP tool resolution.
        """
        self._model_registry = model_registry
        self._tool_registry = tool_registry
        self._mcp_registry = mcp_registry

    @property
    def name(self) -> str:
        """Adapter name identifier - required by Adapter protocol."""
        return "pydantic-ai"

    async def adapt_text(
        self,
        config: TextConfigSchema,
        options: AdaptOptions,
        _metadata: PromptMetadata,  # Required by Adapter protocol, reserved for future use
    ) -> PydanticAITextParams:
        """Adapt a text prompt config for Pydantic AI.

        This method is async to support MCP tool resolution.

        Args:
            config: Text prompt configuration.
            options: Adapter options (telemetry, API keys, etc.).
            _metadata: Prompt metadata (required by protocol, reserved for future use).

        Returns:
            PydanticAITextParams ready for Agent.run().
        """
        text_config = config.text_config
        model = self._model_registry.get_model(text_config.model_name, dict(options))
        model_settings = _build_model_settings(text_config.model_dump())

        # Convert messages to Pydantic AI format
        system_prompt, user_prompt = _convert_messages_to_prompt(
            list(config.messages)
        )

        # Build tools if specified (async for MCP support)
        tool_context: dict[str, Any] = options.get("toolContext", {})
        tools = (
            await self._build_tools(text_config.tools, tool_context)
            if text_config.tools
            else []
        )

        return PydanticAITextParams(
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model_settings=model_settings,
            tools=tools,
            tool_context=tool_context,
            prompt_name=config.name,
            agentmark_meta=config.agentmark_meta,
            _raw_messages=list(config.messages),  # type: ignore[arg-type]
        )

    def adapt_object(
        self,
        config: ObjectConfigSchema,
        options: AdaptOptions,
        _metadata: PromptMetadata,  # Required by Adapter protocol, reserved for future use
    ) -> PydanticAIObjectParams[Any]:
        """Adapt an object prompt config for Pydantic AI structured output.

        Args:
            config: Object prompt configuration.
            options: Adapter options.
            _metadata: Prompt metadata (required by protocol, reserved for future use).

        Returns:
            PydanticAIObjectParams with dynamically generated output_type.
        """
        object_config = config.object_config
        model = self._model_registry.get_model(object_config.model_name, dict(options))
        model_settings = _build_model_settings(object_config.model_dump())

        # Convert messages to Pydantic AI format
        system_prompt, user_prompt = _convert_messages_to_prompt(
            list(config.messages)
        )

        # Convert JSON Schema to Pydantic model for output_type
        output_type = self._schema_to_pydantic_model(
            object_config.schema_,
            object_config.schema_name or "OutputModel",
        )

        tool_context: dict[str, Any] = options.get("toolContext", {})

        return PydanticAIObjectParams(
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            output_type=output_type,
            model_settings=model_settings,
            tool_context=tool_context,
            prompt_name=config.name,
            agentmark_meta=config.agentmark_meta,
            _raw_messages=list(config.messages),  # type: ignore[arg-type]
        )

    def adapt_image(
        self,
        config: ImageConfigSchema,
        options: AdaptOptions,
    ) -> Any:
        """Adapt an image prompt config.

        Pydantic AI focuses on language models and does not support
        image generation. Use a dedicated image generation library
        (e.g., OpenAI's SDK directly) for image prompts.

        Raises:
            NotImplementedError: Pydantic AI does not support image generation.
        """
        raise NotImplementedError(
            "Pydantic AI does not support image generation. "
            "Use OpenAI SDK or another image generation library directly."
        )

    def adapt_speech(
        self,
        config: SpeechConfigSchema,
        options: AdaptOptions,
    ) -> Any:
        """Adapt a speech prompt config.

        Pydantic AI focuses on language models and does not support
        speech synthesis. Use a dedicated TTS library for speech prompts.

        Raises:
            NotImplementedError: Pydantic AI does not support speech synthesis.
        """
        raise NotImplementedError(
            "Pydantic AI does not support speech synthesis. "
            "Use OpenAI SDK or another TTS library directly."
        )

    async def _build_tools(
        self,
        tools_config: dict[str, str | dict[str, Any]],
        tool_context: dict[str, Any],
    ) -> list[Tool[Any]]:
        """Build Pydantic AI Tool instances from config.

        Supports both inline tool definitions and MCP URIs.

        Args:
            tools_config: Tool definitions from AgentMark config.
            tool_context: Context dict passed to tool execution functions.

        Returns:
            List of Pydantic AI Tool instances.
        """
        tools: list[Tool[Any]] = []

        for name, definition in tools_config.items():
            # Handle MCP URIs (e.g., "mcp://server/tool" or "mcp://server/*")
            if isinstance(definition, str):
                if definition.startswith("mcp://"):
                    mcp_tools = await self._resolve_mcp_tools(name, definition)
                    tools.extend(mcp_tools)
                    continue
                raise ValueError(f"Invalid tool definition for '{name}': {definition}")

            # Inline tool definition from AgentMark config
            description = definition.get("description", "")

            # Get execution function from registry
            if self._tool_registry and self._tool_registry.has(name):
                registered = self._tool_registry.get(name)
                if registered:
                    # Create closure to capture the correct tool and context
                    def make_executor(
                        reg_tool: RegisteredTool, ctx: dict[str, Any]
                    ) -> Callable[..., Any]:
                        def executor(**kwargs: Any) -> Any:
                            return reg_tool.execute(kwargs, ctx)

                        return executor

                    tool = Tool(
                        function=make_executor(registered, tool_context),
                        name=name,
                        description=description,
                        takes_ctx=registered.takes_ctx,
                    )
                    tools.append(tool)
            else:
                # No registered executor - create placeholder that raises
                tool_name = name  # Capture in closure

                def make_placeholder(captured_name: str) -> Callable[..., Any]:
                    def placeholder(**_kwargs: Any) -> Any:
                        raise RuntimeError(
                            f"Tool '{captured_name}' not registered in tool registry"
                        )

                    return placeholder

                tool = Tool(
                    function=make_placeholder(tool_name),
                    name=name,
                    description=description,
                )
                tools.append(tool)

        return tools

    async def _resolve_mcp_tools(
        self,
        alias: str,
        mcp_uri: str,
    ) -> list[Tool[Any]]:
        """Resolve MCP URI to Pydantic AI Tool instances.

        Args:
            alias: The tool alias from config (used as key).
            mcp_uri: MCP URI (e.g., "mcp://server/tool" or "mcp://server/*").

        Returns:
            List of resolved Tool instances.

        Raises:
            ValueError: If MCP registry not configured or server not found.
        """
        if not self._mcp_registry:
            raise ValueError(
                f"MCP URI '{mcp_uri}' found but no MCP registry configured. "
                "Pass mcp_registry to PydanticAIAdapter constructor."
            )

        parsed = parse_mcp_uri(mcp_uri)
        server_name = parsed["server"]
        tool_name = parsed["tool"]

        if not self._mcp_registry.has(server_name):
            available = ", ".join(self._mcp_registry.list_servers()) or "(none)"
            raise ValueError(
                f"MCP server '{server_name}' not registered. "
                f"Available servers: {available}"
            )

        # Handle wildcard: mcp://server/* returns all tools
        if tool_name == "*":
            all_tools = await self._mcp_registry.get_all_tools(server_name)
            return list(all_tools.values())

        # Single tool lookup
        tool = await self._mcp_registry.get_tool(server_name, tool_name)
        # The alias might differ from the actual tool name
        # Create a new tool with the alias as name if different
        if alias != tool_name:
            tool = Tool(
                function=tool.function,
                name=alias,
                description=tool.description,
            )
        return [tool]

    def _schema_to_pydantic_model(
        self,
        schema: dict[str, Any],
        name: str,
    ) -> type[BaseModel]:
        """Convert JSON Schema to a Pydantic model class.

        Dynamically creates a Pydantic model from JSON Schema definition.
        Handles nested objects, arrays, and common JSON Schema types.

        Args:
            schema: JSON Schema dict.
            name: Model class name.

        Returns:
            Dynamically created Pydantic model class.
        """
        properties = schema.get("properties", {})
        required = set(schema.get("required", []))

        field_definitions: dict[str, Any] = {}

        for prop_name, prop_schema in properties.items():
            python_type = self._json_type_to_python(prop_schema, f"{name}_{prop_name}")
            is_required = prop_name in required

            if is_required:
                field_definitions[prop_name] = (python_type, ...)
            else:
                field_definitions[prop_name] = (python_type | None, None)

        return create_model(name, **field_definitions)

    def _json_type_to_python(
        self, prop_schema: dict[str, Any], nested_name: str = ""
    ) -> type[Any]:
        """Convert JSON Schema type to Python type.

        Handles nested objects, arrays with items, and enums.

        Args:
            prop_schema: JSON Schema property definition.
            nested_name: Name prefix for nested model generation.

        Returns:
            Python type annotation.
        """
        json_type = prop_schema.get("type", "string")

        # Handle enum
        if "enum" in prop_schema:
            enum_values = prop_schema["enum"]
            # Use StrEnum for string values (better Pydantic compatibility)
            if all(isinstance(v, str) for v in enum_values):
                return StrEnum(  # type: ignore[return-value]
                    nested_name or "EnumType", {v: v for v in enum_values}
                )
            # Fall back to regular Enum for mixed/non-string values
            return Enum(  # type: ignore[return-value]
                nested_name or "EnumType", {str(v): v for v in enum_values}
            )

        # Handle array with items
        if json_type == "array" and "items" in prop_schema:
            item_type = self._json_type_to_python(
                prop_schema["items"], f"{nested_name}_item"
            )
            return list[item_type]  # type: ignore[valid-type]

        # Handle nested object
        if json_type == "object" and "properties" in prop_schema:
            return self._schema_to_pydantic_model(prop_schema, nested_name or "Nested")

        # Simple type mapping
        type_map: dict[str, type[Any]] = {
            "string": str,
            "integer": int,
            "number": float,
            "boolean": bool,
            "array": list,
            "object": dict,
            "null": type(None),
        }

        return type_map.get(json_type, str)
