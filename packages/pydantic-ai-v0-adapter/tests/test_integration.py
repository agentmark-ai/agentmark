"""Integration tests for PydanticAI adapter with AgentMark."""

from __future__ import annotations

from typing import Any

import pytest

from agentmark_pydantic_ai_v0 import (
    create_pydantic_ai_client,
    PydanticAIAdapter,
    PydanticAIModelRegistry,
    PydanticAIToolRegistry,
    PydanticAITextParams,
    PydanticAIObjectParams,
)


class TestCreatePydanticAIClient:
    """Tests for the create_pydantic_ai_client factory function."""

    def test_creates_agentmark_instance(self) -> None:
        """Test that factory creates an AgentMark instance."""
        from agentmark.prompt_core import AgentMark

        client = create_pydantic_ai_client()
        assert isinstance(client, AgentMark)

    def test_uses_pydantic_ai_adapter(self) -> None:
        """Test that the client uses PydanticAIAdapter."""
        client = create_pydantic_ai_client()
        assert isinstance(client.adapter, PydanticAIAdapter)
        assert client.adapter.name == "pydantic-ai"

    def test_uses_default_model_registry(self) -> None:
        """Test that default model registry is used when not provided."""
        client = create_pydantic_ai_client()

        # The adapter should have a model registry that handles common models
        adapter = client.adapter
        assert isinstance(adapter, PydanticAIAdapter)

    def test_custom_model_registry(self) -> None:
        """Test using a custom model registry."""
        custom_registry = PydanticAIModelRegistry()
        custom_registry.register_models(
            "custom-model",
            lambda name, _: f"custom:{name}",
        )

        client = create_pydantic_ai_client(model_registry=custom_registry)
        assert client.adapter is not None

    def test_custom_tool_registry(self) -> None:
        """Test using a custom tool registry."""
        tool_registry = PydanticAIToolRegistry()
        tool_registry.register("test_tool", lambda args, ctx: "result")

        client = create_pydantic_ai_client(tool_registry=tool_registry)
        assert client.adapter is not None

    def test_custom_eval_registry(self) -> None:
        """Test using a custom eval registry."""
        from agentmark.prompt_core import EvalRegistry

        eval_registry = EvalRegistry()
        eval_registry.register(
            "custom_eval",
            lambda params: {"score": 1.0},
        )

        client = create_pydantic_ai_client(eval_registry=eval_registry)
        assert client.eval_registry is eval_registry


class TestFullIntegration:
    """Full integration tests with AgentMark workflow."""

    @pytest.fixture
    def client(self, mock_model_registry: PydanticAIModelRegistry) -> Any:
        """Create a client with mock model registry."""
        return create_pydantic_ai_client(model_registry=mock_model_registry)

    async def test_text_prompt_workflow(
        self, client: Any, text_ast: dict[str, Any]
    ) -> None:
        """Test complete text prompt workflow."""
        # Load prompt
        prompt = await client.load_text_prompt(text_ast)

        # Format with props
        result = await prompt.format(props={"userMessage": "Hello, world!"})

        # Verify result is PydanticAITextParams
        assert isinstance(result, PydanticAITextParams)
        assert result.model == "test:test-model"
        assert result.system_prompt == "You are a helpful math tutor."
        assert result.user_prompt == "Hello, world!"
        assert result.prompt_name == "math"

    async def test_object_prompt_workflow(
        self, client: Any, math_ast: dict[str, Any]
    ) -> None:
        """Test complete object prompt workflow."""
        # Load prompt
        prompt = await client.load_object_prompt(math_ast)

        # Format with props
        result = await prompt.format(props={"userMessage": "Calculate 5+3"})

        # Verify result is PydanticAIObjectParams
        assert isinstance(result, PydanticAIObjectParams)
        assert result.model == "test:test-model"
        assert result.system_prompt == "You are a helpful math tutor."
        assert result.user_prompt == "Calculate 5+3"

        # Verify output_type is a valid Pydantic model
        from pydantic import BaseModel

        assert issubclass(result.output_type, BaseModel)

    async def test_runtime_options_passthrough(
        self, client: Any, text_ast: dict[str, Any]
    ) -> None:
        """Test that runtime options are passed through."""
        prompt = await client.load_text_prompt(text_ast)

        result = await prompt.format(
            props={"userMessage": "Test"},
            apiKey="test-api-key",
            toolContext={"custom": "context"},
        )

        # Tool context should be passed through
        assert result.tool_context == {"custom": "context"}

    async def test_format_with_test_props(
        self, client: Any, text_ast: dict[str, Any]
    ) -> None:
        """Test formatting with test props from frontmatter."""
        prompt = await client.load_text_prompt(text_ast)

        # format_with_test_props uses props from test_settings
        result = await prompt.format_with_test_props()

        # The text_ast fixture has test_settings.props.userMessage = "What is 2+2?"
        assert result.user_prompt == "What is 2+2?"


class TestToolIntegration:
    """Integration tests for tool handling."""

    @pytest.fixture
    def client_with_tools(
        self,
        mock_model_registry: PydanticAIModelRegistry,
        tool_registry: PydanticAIToolRegistry,
    ) -> Any:
        """Create a client with tool registry."""
        return create_pydantic_ai_client(
            model_registry=mock_model_registry,
            tool_registry=tool_registry,
        )

    async def test_tool_execution(
        self,
        client_with_tools: Any,
        tools_text_ast: dict[str, Any],
    ) -> None:
        """Test that tools are properly adapted and executable."""
        prompt = await client_with_tools.load_text_prompt(tools_text_ast)
        result = await prompt.format(props={"userMessage": "Add 5 and 3"})

        # Should have one tool
        assert len(result.tools) == 1
        tool = result.tools[0]
        assert tool.name == "add"

        # Tool should be executable
        # Note: The tool function expects kwargs, not positional args
        tool_result = tool.function(a=5, b=3)
        assert tool_result == 8

    async def test_unregistered_tool_raises_on_execution(
        self,
        mock_model_registry: PydanticAIModelRegistry,
    ) -> None:
        """Test that unregistered tools raise RuntimeError when executed."""
        # Create client without registering the 'add' tool
        client = create_pydantic_ai_client(model_registry=mock_model_registry)

        tools_ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": """name: tools
text_config:
  model_name: test-model
  tools:
    unregistered_tool:
      description: This tool is not registered""",
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "User",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "text", "value": "Use the tool"}],
                        }
                    ],
                },
            ],
        }

        prompt = await client.load_text_prompt(tools_ast)
        result = await prompt.format(props={})

        # Tool should be present but raise when executed
        assert len(result.tools) == 1
        with pytest.raises(RuntimeError, match="not registered"):
            result.tools[0].function()


class TestModelRegistryIntegration:
    """Tests for model registry integration patterns."""

    async def test_custom_model_creator_receives_options(
        self, text_ast: dict[str, Any]
    ) -> None:
        """Test that model creator receives runtime options."""
        received_options: list[dict[str, Any] | None] = []

        def capturing_creator(
            name: str, options: dict[str, Any] | None
        ) -> str:
            received_options.append(options)
            return f"captured:{name}"

        registry = PydanticAIModelRegistry(default_creator=capturing_creator)
        client = create_pydantic_ai_client(model_registry=registry)

        prompt = await client.load_text_prompt(text_ast)
        await prompt.format(
            props={"userMessage": "Test"},
            apiKey="secret-key",
            baseURL="https://custom.api.com",
        )

        assert len(received_options) == 1
        assert received_options[0] is not None
        assert received_options[0].get("apiKey") == "secret-key"
        assert received_options[0].get("baseURL") == "https://custom.api.com"
