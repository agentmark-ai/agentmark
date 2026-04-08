"""AgentMark adapter for Claude Agent SDK.

Ported from TypeScript: packages/claude-agent-sdk-v0-adapter/src/adapter.ts
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .model_registry import ClaudeAgentModelRegistry
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

# Config options supported by Claude Agent SDK adapter for text prompts.
# Other options will trigger a warning when present.
SUPPORTED_TEXT_OPTIONS = frozenset([
    "model_name",  # Used via model registry
    "max_calls",   # Mapped to maxTurns
    "tools",       # Tool name strings and MCP URIs
])

# Config options supported by Claude Agent SDK adapter for object prompts.
# Includes all text options plus schema-related options.
SUPPORTED_OBJECT_OPTIONS = frozenset([
    *SUPPORTED_TEXT_OPTIONS,
    "schema",              # Used for outputFormat
    "schema_name",         # Passed through for schema naming (optional)
    "schema_description",  # Passed through for schema description (optional)
])


def _warn_unsupported_options(
    settings: dict[str, Any],
    supported_options: frozenset[str],
    prompt_name: str,
    config_type: str,
    on_warning: Callable[[str], None] | None,
) -> None:
    """Check for unsupported config options and emit warnings via the provided handler.

    Args:
        settings: The settings object from the prompt config.
        supported_options: Set of supported option names.
        prompt_name: Name of the prompt for the warning message.
        config_type: Type of config (text_config or object_config) for the warning message.
        on_warning: Optional warning handler; if not provided, warnings are silently ignored.
    """
    if on_warning is None:
        return

    unsupported = [key for key in settings if key not in supported_options]

    if unsupported:
        on_warning(
            f"[claude-agent-sdk-adapter] Warning: The following {config_type} options "
            f'in prompt "{prompt_name}" are not supported by Claude Agent SDK and will '
            f"be ignored: {', '.join(unsupported)}"
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
            ClaudeAgentModelRegistry,
        )

        model_registry = ClaudeAgentModelRegistry()
        model_registry.register_providers({"anthropic": "anthropic"})
        adapter = ClaudeAgentAdapter(
            model_registry=model_registry,
            adapter_options=ClaudeAgentAdapterOptions(permission_mode='bypassPermissions'),
        )
    """

    name = "claude-agent-sdk"

    def __init__(
        self,
        model_registry: ClaudeAgentModelRegistry,
        mcp_servers: dict[str, Any] | None = None,
        adapter_options: ClaudeAgentAdapterOptions | None = None,
    ) -> None:
        """Initialize the adapter.

        Args:
            model_registry: Registry for model configurations.
            mcp_servers: Optional MCP servers configuration (native SDK format).
            adapter_options: Optional adapter-level options.
        """
        self._model_registry = model_registry
        self._mcp_servers = mcp_servers
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
        # Start with MCP servers passed to the adapter constructor
        mcp_servers: dict[str, Any] = dict(self._mcp_servers) if self._mcp_servers else {}

        # Process tools list from prompt frontmatter (now list of strings)
        # Tool names and MCP URIs are added to allowedTools
        prompt_allowed_tools: list[str] = []
        tools = settings.get("tools")
        if isinstance(tools, list):
            for tool_entry in tools:
                if not isinstance(tool_entry, str):
                    raise TypeError(
                        f"[claude-agent-sdk-adapter] Tool entries must be string references "
                        f"(tool names or mcp:// URIs), got {type(tool_entry).__name__}: {tool_entry!r}"
                    )
                prompt_allowed_tools.append(tool_entry)

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

        # Merge allowedTools from adapter options and prompt tools
        merged_allowed_tools = [
            *(self._adapter_options.allowed_tools or [] if self._adapter_options else []),
            *prompt_allowed_tools,
        ]

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
            allowed_tools=merged_allowed_tools if (merged_allowed_tools or tools is not None) else None,
            disallowed_tools=self._adapter_options.disallowed_tools
            if self._adapter_options
            else None,
        )

        return query_options, telemetry

    async def adapt_text(
        self,
        config: dict[str, Any],
        options: dict[str, Any],
        metadata: dict[str, Any],
    ) -> ClaudeAgentTextParams:
        """Adapt a text configuration for Claude Agent SDK.

        Args:
            config: Text configuration from AgentMark prompt (Pydantic model or dict).
            options: Adapt options including telemetry settings.
            metadata: Prompt metadata including props.

        Returns:
            Configuration for Claude Agent SDK query() with telemetry context.
        """
        config = config.model_dump(by_alias=True) if hasattr(config, "model_dump") else config
        messages = config.get("messages", [])
        text_config = config.get("text_config", {})
        model_name = text_config.get("model_name", "")
        settings = {k: v for k, v in text_config.items() if k != "model_name"}
        prompt_name = config.get("name", metadata.get("name", ""))

        # Warn about unsupported config options (only if on_warning handler is provided)
        _warn_unsupported_options(
            settings,
            SUPPORTED_TEXT_OPTIONS,
            prompt_name,
            "text_config",
            self._adapter_options.on_warning if self._adapter_options else None,
        )

        model_config_obj = self._model_registry.get_model_config(model_name, options)
        model_config = {
            "model": model_config_obj.model,
            "max_thinking_tokens": model_config_obj.max_thinking_tokens,
        }

        system_prompt = self._extract_system_prompt(messages)
        user_prompt = self._messages_to_prompt(messages)

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
        metadata: dict[str, Any],
    ) -> ClaudeAgentObjectParams[Any]:
        """Adapt an object configuration for Claude Agent SDK with structured output.

        Args:
            config: Object configuration from AgentMark prompt (Pydantic model or dict).
            options: Adapt options including telemetry settings.
            metadata: Prompt metadata including props.

        Returns:
            Configuration for Claude Agent SDK query() with outputFormat and telemetry context.
        """
        config = config.model_dump(by_alias=True) if hasattr(config, "model_dump") else config
        messages = config.get("messages", [])
        object_config = config.get("object_config", {})
        model_name = object_config.get("model_name", "")
        schema = object_config.get("schema", {})
        settings = {k: v for k, v in object_config.items() if k not in ("model_name", "schema")}
        prompt_name = config.get("name", metadata.get("name", ""))

        # Warn about unsupported config options (only if on_warning handler is provided)
        _warn_unsupported_options(
            settings,
            SUPPORTED_OBJECT_OPTIONS,
            prompt_name,
            "object_config",
            self._adapter_options.on_warning if self._adapter_options else None,
        )

        model_config_obj = self._model_registry.get_model_config(model_name, options)
        model_config = {
            "model": model_config_obj.model,
            "max_thinking_tokens": model_config_obj.max_thinking_tokens,
        }

        system_prompt = self._extract_system_prompt(messages)
        user_prompt = self._messages_to_prompt(messages)

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
