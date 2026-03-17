"""Tests for ClaudeAgentAdapter.

Ported from TypeScript: packages/claude-agent-sdk-adapter/test/agentmark.test.ts
"""

from __future__ import annotations

from typing import Any

import pytest

from agentmark_claude_agent_sdk.adapter import ClaudeAgentAdapter
from agentmark_claude_agent_sdk.model_registry import (
    ClaudeAgentModelRegistry,
    create_default_model_registry,
)
from agentmark_claude_agent_sdk.types import ClaudeAgentAdapterOptions


class TestClaudeAgentAdapterTextPrompts:
    """Test suite for ClaudeAgentAdapter text prompts."""

    @pytest.fixture
    def model_registry(self) -> ClaudeAgentModelRegistry:
        """Create default model registry."""
        return create_default_model_registry()

    @pytest.fixture
    def adapter(self, model_registry: ClaudeAgentModelRegistry) -> ClaudeAgentAdapter:
        """Create adapter with default registry."""
        return ClaudeAgentAdapter(model_registry=model_registry)

    async def test_adapts_text_prompts_for_claude_agent_sdk(
        self, adapter: ClaudeAgentAdapter
    ) -> None:
        """Should adapt text prompts for Claude Agent SDK."""
        config = {
            "name": "text-prompt",
            "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            "messages": [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "Hello, how are you?"},
            ],
        }
        options: dict[str, Any] = {}
        metadata = {"name": "text-prompt"}

        result = await adapter.adapt_text(config, options, metadata)

        assert result is not None
        assert "Hello, how are you?" in result.query.prompt
        assert result.query.options is not None
        assert result.query.options.model == "anthropic/claude-sonnet-4-20250514"
        assert result.messages is not None
        assert len(result.messages) > 0

    async def test_extracts_system_prompt_from_messages(self, adapter: ClaudeAgentAdapter) -> None:
        """Should extract system prompt from messages."""
        config = {
            "name": "text-prompt",
            "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            "messages": [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "test"},
            ],
        }
        options: dict[str, Any] = {}
        metadata = {"name": "text-prompt"}

        result = await adapter.adapt_text(config, options, metadata)

        # System prompt should be in options, not in the prompt string
        assert result.query.options.system_prompt == "You are a helpful assistant."
        # The prompt should not contain the system message
        assert "You are a helpful assistant." not in result.query.prompt

    async def test_passes_max_calls_as_max_turns(self, adapter: ClaudeAgentAdapter) -> None:
        """Should pass max_calls as maxTurns."""
        config = {
            "name": "agent-task",
            "text_config": {
                "model_name": "anthropic/claude-sonnet-4-20250514",
                "max_calls": 10,
            },
            "messages": [
                {"role": "system", "content": "You are an assistant."},
                {"role": "user", "content": "Write a function"},
            ],
        }
        options: dict[str, Any] = {}
        metadata = {"name": "agent-task"}

        result = await adapter.adapt_text(config, options, metadata)

        assert result.query.options.max_turns == 10


class TestClaudeAgentAdapterObjectPrompts:
    """Test suite for ClaudeAgentAdapter object prompts."""

    @pytest.fixture
    def model_registry(self) -> ClaudeAgentModelRegistry:
        """Create default model registry."""
        return create_default_model_registry()

    @pytest.fixture
    def adapter(self, model_registry: ClaudeAgentModelRegistry) -> ClaudeAgentAdapter:
        """Create adapter with default registry."""
        return ClaudeAgentAdapter(model_registry=model_registry)

    async def test_adapts_object_prompts_with_structured_output(
        self, adapter: ClaudeAgentAdapter
    ) -> None:
        """Should adapt object prompts with structured output."""
        config = {
            "name": "math",
            "object_config": {
                "model_name": "anthropic/claude-sonnet-4-20250514",
                "schema": {
                    "type": "object",
                    "properties": {"answer": {"type": "string"}},
                    "required": ["answer"],
                },
            },
            "messages": [
                {"role": "system", "content": "You are a math tutor."},
                {"role": "user", "content": "What is 2+2?"},
            ],
        }
        options: dict[str, Any] = {}
        metadata = {"name": "math"}

        result = await adapter.adapt_object(config, options, metadata)

        assert result is not None
        assert "What is 2+2?" in result.query.prompt
        assert result.query.options.output_format is not None
        assert result.query.options.output_format.type == "json_schema"
        assert result.query.options.output_format.schema is not None


class TestClaudeAgentAdapterUnsupportedTypes:
    """Test suite for ClaudeAgentAdapter unsupported prompt types."""

    @pytest.fixture
    def adapter(self) -> ClaudeAgentAdapter:
        """Create adapter with default registry."""
        return ClaudeAgentAdapter(model_registry=create_default_model_registry())

    def test_throws_error_for_image_prompts(self, adapter: ClaudeAgentAdapter) -> None:
        """Should throw error for image prompts."""
        config = {
            "name": "test-image",
            "image_config": {
                "model_name": "openai/dall-e-3",
                "size": "1024x1024",
            },
        }

        with pytest.raises(NotImplementedError, match=r"Image generation is not supported"):
            adapter.adapt_image(config, {})

    def test_throws_error_for_speech_prompts(self, adapter: ClaudeAgentAdapter) -> None:
        """Should throw error for speech prompts."""
        config = {
            "name": "test-speech",
            "speech_config": {
                "model_name": "openai/tts-1-hd",
                "voice": "alloy",
            },
        }

        with pytest.raises(NotImplementedError, match=r"Speech generation is not supported"):
            adapter.adapt_speech(config, {})


class TestClaudeAgentAdapterOptions:
    """Test suite for ClaudeAgentAdapter with adapter options."""

    @pytest.fixture
    def model_registry(self) -> ClaudeAgentModelRegistry:
        """Create default model registry."""
        return create_default_model_registry()

    async def test_applies_permission_mode_from_adapter_options(
        self, model_registry: ClaudeAgentModelRegistry
    ) -> None:
        """Should apply permission mode from adapter options."""
        adapter = ClaudeAgentAdapter(
            model_registry=model_registry,
            adapter_options=ClaudeAgentAdapterOptions(permission_mode="bypassPermissions"),
        )

        config = {
            "name": "text-prompt",
            "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            "messages": [{"role": "user", "content": "test"}],
        }

        result = await adapter.adapt_text(config, {}, {"name": "text-prompt"})

        assert result.query.options.permission_mode == "bypassPermissions"

    async def test_applies_max_turns_from_adapter_options(
        self, model_registry: ClaudeAgentModelRegistry
    ) -> None:
        """Should apply maxTurns from adapter options."""
        adapter = ClaudeAgentAdapter(
            model_registry=model_registry,
            adapter_options=ClaudeAgentAdapterOptions(max_turns=50),
        )

        config = {
            "name": "text-prompt",
            "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            "messages": [{"role": "user", "content": "test"}],
        }

        result = await adapter.adapt_text(config, {}, {"name": "text-prompt"})

        assert result.query.options.max_turns == 50

    async def test_applies_cwd_from_adapter_options(
        self, model_registry: ClaudeAgentModelRegistry
    ) -> None:
        """Should apply cwd from adapter options."""
        adapter = ClaudeAgentAdapter(
            model_registry=model_registry,
            adapter_options=ClaudeAgentAdapterOptions(cwd="/custom/path"),
        )

        config = {
            "name": "text-prompt",
            "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            "messages": [{"role": "user", "content": "test"}],
        }

        result = await adapter.adapt_text(config, {}, {"name": "text-prompt"})

        assert result.query.options.cwd == "/custom/path"

    async def test_applies_allowed_and_disallowed_tools(
        self, model_registry: ClaudeAgentModelRegistry
    ) -> None:
        """Should apply allowedTools and disallowedTools."""
        adapter = ClaudeAgentAdapter(
            model_registry=model_registry,
            adapter_options=ClaudeAgentAdapterOptions(
                allowed_tools=["Read", "Write"],
                disallowed_tools=["Bash"],
            ),
        )

        config = {
            "name": "text-prompt",
            "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            "messages": [{"role": "user", "content": "test"}],
        }

        result = await adapter.adapt_text(config, {}, {"name": "text-prompt"})

        assert result.query.options.allowed_tools == ["Read", "Write"]
        assert result.query.options.disallowed_tools == ["Bash"]

    async def test_includes_telemetry_context_when_enabled(
        self, model_registry: ClaudeAgentModelRegistry
    ) -> None:
        """Should include telemetry context when enabled."""
        adapter = ClaudeAgentAdapter(model_registry=model_registry)

        config = {
            "name": "text-prompt",
            "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            "messages": [{"role": "user", "content": "test"}],
        }
        options = {
            "telemetry": {
                "isEnabled": True,
                "functionId": "test-function",
                "metadata": {"userId": "user-123"},
            }
        }

        result = await adapter.adapt_text(config, options, {"name": "text-prompt"})

        # Telemetry context is now returned for withTracing() wrapper to use
        assert result.telemetry is not None
        assert result.telemetry.is_enabled is True
        assert result.telemetry.prompt_name == "text-prompt"
        assert result.telemetry.metadata is not None
        assert result.telemetry.metadata.get("userId") == "user-123"


class TestClaudeAgentAdapterToolsAsStringArray:
    """Test suite for ClaudeAgentAdapter with tools as string array."""

    @pytest.fixture
    def model_registry(self) -> ClaudeAgentModelRegistry:
        """Create default model registry."""
        return create_default_model_registry()

    async def test_adds_tools_from_prompt_to_allowed_tools(
        self, model_registry: ClaudeAgentModelRegistry
    ) -> None:
        """Should add tools from prompt to allowedTools when tools are string array."""
        adapter = ClaudeAgentAdapter(model_registry=model_registry)

        config = {
            "name": "text-with-tools-prompt",
            "text_config": {
                "model_name": "anthropic/claude-sonnet-4-20250514",
                "tools": ["search", "mcp://my-server/tool"],
            },
            "messages": [{"role": "user", "content": "test"}],
        }

        result = await adapter.adapt_text(config, {}, {"name": "text-with-tools-prompt"})

        assert result.query.options.allowed_tools is not None
        assert "search" in result.query.options.allowed_tools
        assert "mcp://my-server/tool" in result.query.options.allowed_tools

    async def test_merges_prompt_tools_with_adapter_allowed_tools(
        self, model_registry: ClaudeAgentModelRegistry
    ) -> None:
        """Should merge prompt tools with adapter allowedTools."""
        adapter = ClaudeAgentAdapter(
            model_registry=model_registry,
            adapter_options=ClaudeAgentAdapterOptions(allowed_tools=["Read", "Write"]),
        )

        config = {
            "name": "text-prompt",
            "text_config": {
                "model_name": "anthropic/claude-sonnet-4-20250514",
                "tools": ["search", "mcp://server/tool"],
            },
            "messages": [{"role": "user", "content": "test"}],
        }

        result = await adapter.adapt_text(config, {}, {"name": "text-prompt"})

        assert result.query.options.allowed_tools == [
            "Read", "Write", "search", "mcp://server/tool"
        ]

    async def test_not_includes_allowed_tools_when_no_tools_defined(
        self, model_registry: ClaudeAgentModelRegistry
    ) -> None:
        """Should not include allowedTools when no tools are defined."""
        adapter = ClaudeAgentAdapter(model_registry=model_registry)

        config = {
            "name": "text-prompt",
            "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            "messages": [{"role": "user", "content": "test"}],
        }

        result = await adapter.adapt_text(config, {}, {"name": "text-prompt"})

        assert result.query.options.allowed_tools is None

    async def test_passes_mcp_servers_from_constructor(
        self, model_registry: ClaudeAgentModelRegistry
    ) -> None:
        """Should pass mcpServers from constructor to query options."""
        mcp_servers = {
            "my-server": {"type": "url", "url": "http://localhost:3000"},
        }

        adapter = ClaudeAgentAdapter(
            model_registry=model_registry,
            mcp_servers=mcp_servers,
        )

        config = {
            "name": "text-prompt",
            "text_config": {"model_name": "anthropic/claude-sonnet-4-20250514"},
            "messages": [{"role": "user", "content": "test"}],
        }

        result = await adapter.adapt_text(config, {}, {"name": "text-prompt"})

        assert result.query.options.mcp_servers is not None
        assert "my-server" in result.query.options.mcp_servers


class TestClaudeAgentAdapterNonStringTools:
    """Test that non-string tool entries raise a clear error."""

    @pytest.fixture
    def adapter(self) -> ClaudeAgentAdapter:
        return ClaudeAgentAdapter(model_registry=create_default_model_registry())

    async def test_raises_type_error_for_dict_tool_entry(
        self, adapter: ClaudeAgentAdapter
    ) -> None:
        """Should raise TypeError when a tool entry is a dict (inline schema), not a string."""
        config = {
            "name": "text-prompt",
            "text_config": {
                "model_name": "anthropic/claude-sonnet-4-20250514",
                "tools": [{"type": "function", "name": "my_tool"}],  # non-string entry
            },
            "messages": [{"role": "user", "content": "test"}],
        }
        with pytest.raises(TypeError, match=r"Tool entries must be string references"):
            await adapter.adapt_text(config, {}, {"name": "text-prompt"})

    async def test_raises_type_error_for_integer_tool_entry(
        self, adapter: ClaudeAgentAdapter
    ) -> None:
        """Should raise TypeError when a tool entry is an integer."""
        config = {
            "name": "text-prompt",
            "text_config": {
                "model_name": "anthropic/claude-sonnet-4-20250514",
                "tools": [42],
            },
            "messages": [{"role": "user", "content": "test"}],
        }
        with pytest.raises(TypeError, match=r"Tool entries must be string references"):
            await adapter.adapt_text(config, {}, {"name": "text-prompt"})
