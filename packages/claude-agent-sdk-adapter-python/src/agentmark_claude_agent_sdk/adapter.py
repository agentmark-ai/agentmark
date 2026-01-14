"""AgentMark adapter for Claude Agent SDK.

Ported from TypeScript: packages/claude-agent-sdk-adapter/src/adapter.ts
"""

from __future__ import annotations

from typing import Any

from .mcp.agentmark_mcp_bridge import (
    AgentMarkToolDefinition,
    create_agentmark_mcp_server,
    to_claude_agent_mcp_server,
)
from .model_registry import ClaudeAgentModelRegistry
from .tool_registry import ClaudeAgentToolRegistry
from .types import (
    ClaudeAgentAdapterOptions,
    ClaudeAgentObjectParams,
    ClaudeAgentQueryOptions,
    ClaudeAgentQueryParams,
    ClaudeAgentTextParams,
    OutputFormat,
    SystemPromptPreset,
    TracedTelemetryContext,
)


class ClaudeAgentAdapter:
    """AgentMark adapter for Claude Agent SDK.

    This adapter bridges AgentMark's prompt framework with Anthropic's Claude Agent SDK,
    enabling autonomous agent execution with built-in tools.

    Key differences from other adapters:
    - Execution is agentic (autonomous loop) rather than request-response
    - Uses AsyncGenerator streaming instead of ReadableStream
    - Has built-in tools (Read, Write, Bash, etc.)
    - Includes permission system for tool access control

    Example:
        from agentmark_claude_agent_sdk import (
            ClaudeAgentAdapter,
            create_default_model_registry,
        )

        adapter = ClaudeAgentAdapter(
            model_registry=create_default_model_registry(),
            tool_registry=tool_registry,
            adapter_options=ClaudeAgentAdapterOptions(permission_mode='bypassPermissions'),
        )
    """

    name = "claude-agent-sdk"

    def __init__(
        self,
        model_registry: ClaudeAgentModelRegistry,
        tool_registry: ClaudeAgentToolRegistry | None = None,
        adapter_options: ClaudeAgentAdapterOptions | None = None,
    ) -> None:
        """Initialize the adapter.

        Args:
            model_registry: Registry for model configurations.
            tool_registry: Optional registry for tool executors.
            adapter_options: Optional adapter-level options.
        """
        self._model_registry = model_registry
        self._tool_registry = tool_registry
        self._adapter_options = adapter_options

    def _messages_to_prompt(self, messages: list[dict[str, Any]]) -> str:
        """Convert RichChatMessages to a prompt string for Claude Agent SDK.

        Claude Agent SDK expects a prompt string, not message arrays.
        System messages are handled separately via the systemPrompt option.
        """
        result = []
        for m in messages:
            if m.get("role") == "system":
                continue

            content = m.get("content")
            if isinstance(content, str):
                result.append(content)
            elif isinstance(content, list):
                # Handle rich content (array of parts)
                parts = []
                for part in content:
                    if part.get("type") == "text":
                        parts.append(part.get("text", ""))
                    elif part.get("type") in ("file", "image"):
                        parts.append(f"[Attached {part.get('type')}]")
                result.append("\n".join(filter(None, parts)))

        return "\n\n".join(result)

    def _extract_system_prompt(self, messages: list[dict[str, Any]]) -> str | None:
        """Extract system prompt from messages."""
        for m in messages:
            if m.get("role") == "system":
                content = m.get("content")
                if isinstance(content, str):
                    return content
                elif isinstance(content, list):
                    # Handle rich content
                    texts = []
                    for part in content:
                        if part.get("type") == "text":
                            texts.append(part.get("text", ""))
                    return "\n".join(texts) if texts else None
        return None

    def _convert_prompt_tools_to_agentmark_tools(
        self, tools: dict[str, dict[str, Any]]
    ) -> list[AgentMarkToolDefinition]:
        """Convert tools defined in prompt frontmatter to AgentMark tool definitions.

        Only includes tools that have a registered executor in the tool registry.
        """
        if not self._tool_registry:
            return []

        result = []
        for name, tool_def in tools.items():
            if not self._tool_registry.has(name):
                continue

            executor = self._tool_registry.get(name)
            if executor is None:
                continue

            async def execute_wrapper(args: dict[str, Any], _executor: Any = executor) -> Any:
                return await _executor.execute(args, None)

            result.append(
                AgentMarkToolDefinition(
                    name=name,
                    description=tool_def.get("description", ""),
                    parameters=tool_def.get("parameters", {}),
                    execute=execute_wrapper,
                )
            )

        return result

    def _build_query_options(
        self,
        model_config: dict[str, Any],
        system_prompt: str | None,
        settings: dict[str, Any],
        options: dict[str, Any],
        metadata: dict[str, Any],
        prompt_name: str,
    ) -> tuple[ClaudeAgentQueryOptions, TracedTelemetryContext | None]:
        """Build common query options from config and adapter settings.

        Returns both the query options and telemetry context (if telemetry enabled).
        """
        # Build MCP servers for AgentMark tools
        mcp_servers: dict[str, Any] = {}

        # Add tools defined in the prompt's frontmatter
        tools = settings.get("tools")
        if tools and isinstance(tools, dict):
            prompt_tools = self._convert_prompt_tools_to_agentmark_tools(tools)
            if prompt_tools:
                mcp_server = create_agentmark_mcp_server("prompt-tools", prompt_tools)
                mcp_servers["prompt-tools"] = to_claude_agent_mcp_server(mcp_server)

        # Build telemetry context for withTracing() wrapper (only if telemetry enabled)
        telemetry: TracedTelemetryContext | None = None

        telemetry_options = options.get("telemetry", {})
        if telemetry_options.get("isEnabled"):
            telemetry = TracedTelemetryContext(
                is_enabled=True,
                prompt_name=prompt_name,
                system_prompt=system_prompt,
                model=model_config.get("model"),
                props=metadata.get("props"),
                metadata=telemetry_options.get("metadata"),
            )

        # Build system prompt configuration
        system_prompt_config: str | SystemPromptPreset | None = None
        if self._adapter_options and self._adapter_options.system_prompt_preset:
            system_prompt_config = SystemPromptPreset(
                type="preset",
                preset="claude_code",
                append=system_prompt if system_prompt else None,
            )
        elif system_prompt:
            system_prompt_config = system_prompt

        # Build query options
        query_options = ClaudeAgentQueryOptions(
            model=model_config.get("model"),
            max_thinking_tokens=model_config.get("max_thinking_tokens"),
            max_turns=settings.get("max_calls")
            or (self._adapter_options.max_turns if self._adapter_options else None),
            permission_mode=self._adapter_options.permission_mode
            if self._adapter_options
            else None,
            cwd=self._adapter_options.cwd if self._adapter_options else None,
            max_budget_usd=self._adapter_options.max_budget_usd if self._adapter_options else None,
            mcp_servers=mcp_servers if mcp_servers else None,
            system_prompt=system_prompt_config,
            allowed_tools=self._adapter_options.allowed_tools if self._adapter_options else None,
            disallowed_tools=self._adapter_options.disallowed_tools
            if self._adapter_options
            else None,
        )

        return query_options, telemetry

    async def adapt_text(
        self,
        config: dict[str, Any],
        options: dict[str, Any],
        messages: list[dict[str, Any]],
        metadata: dict[str, Any],
    ) -> ClaudeAgentTextParams:
        """Adapt a text configuration for Claude Agent SDK.

        Args:
            config: Text configuration from AgentMark prompt.
            options: Adapt options including telemetry settings.
            messages: Chat messages.
            metadata: Prompt metadata including props.

        Returns:
            Configuration for Claude Agent SDK query() with telemetry context.
        """
        text_config = config.get("text_config", {})
        model_name = text_config.get("model_name", "")
        settings = {k: v for k, v in text_config.items() if k != "model_name"}

        model_config_obj = self._model_registry.get_model_config(model_name, options)
        model_config = {
            "model": model_config_obj.model,
            "max_thinking_tokens": model_config_obj.max_thinking_tokens,
        }

        system_prompt = self._extract_system_prompt(messages)
        user_prompt = self._messages_to_prompt(messages)
        prompt_name = config.get("name", metadata.get("name", ""))

        query_options, telemetry = self._build_query_options(
            model_config, system_prompt, settings, options, metadata, prompt_name
        )

        return ClaudeAgentTextParams(
            query=ClaudeAgentQueryParams(prompt=user_prompt, options=query_options),
            messages=messages,
            telemetry=telemetry,
            prompt_name=prompt_name,
        )

    async def adapt_object(
        self,
        config: dict[str, Any],
        options: dict[str, Any],
        messages: list[dict[str, Any]],
        metadata: dict[str, Any],
    ) -> ClaudeAgentObjectParams[Any]:
        """Adapt an object configuration for Claude Agent SDK with structured output.

        Args:
            config: Object configuration from AgentMark prompt.
            options: Adapt options including telemetry settings.
            messages: Chat messages.
            metadata: Prompt metadata including props.

        Returns:
            Configuration for Claude Agent SDK query() with outputFormat and telemetry context.
        """
        object_config = config.get("object_config", {})
        model_name = object_config.get("model_name", "")
        schema = object_config.get("schema", {})
        settings = {k: v for k, v in object_config.items() if k not in ("model_name", "schema")}

        model_config_obj = self._model_registry.get_model_config(model_name, options)
        model_config = {
            "model": model_config_obj.model,
            "max_thinking_tokens": model_config_obj.max_thinking_tokens,
        }

        system_prompt = self._extract_system_prompt(messages)
        user_prompt = self._messages_to_prompt(messages)
        prompt_name = config.get("name", metadata.get("name", ""))

        query_options, telemetry = self._build_query_options(
            model_config, system_prompt, settings, options, metadata, prompt_name
        )

        # Add structured output format
        query_options.output_format = OutputFormat(type="json_schema", schema=schema)

        return ClaudeAgentObjectParams(
            query=ClaudeAgentQueryParams(prompt=user_prompt, options=query_options),
            messages=messages,
            output_schema=schema,
            telemetry=telemetry,
            prompt_name=prompt_name,
        )

    def adapt_image(self, config: dict[str, Any], options: dict[str, Any]) -> None:
        """Image generation is not supported by Claude Agent SDK.

        Raises:
            NotImplementedError: Always raises with guidance to use a different adapter.
        """
        raise NotImplementedError(
            "Image generation is not supported by Claude Agent SDK. "
            "Consider using a different adapter with an image model like DALL-E or Stable Diffusion."
        )

    def adapt_speech(self, config: dict[str, Any], options: dict[str, Any]) -> None:
        """Speech generation is not supported by Claude Agent SDK.

        Raises:
            NotImplementedError: Always raises with guidance to use a different adapter.
        """
        raise NotImplementedError(
            "Speech generation is not supported by Claude Agent SDK. "
            "Consider using a different adapter with a speech model like OpenAI TTS."
        )
