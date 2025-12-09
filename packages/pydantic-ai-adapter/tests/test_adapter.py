"""Tests for PydanticAIAdapter."""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import BaseModel

from agentmark_pydantic_ai import (
    PydanticAIAdapter,
    PydanticAIModelRegistry,
    PydanticAIToolRegistry,
    PydanticAITextParams,
    PydanticAIObjectParams,
)


class TestPydanticAIAdapter:
    """Tests for the Pydantic AI adapter."""

    @pytest.fixture
    def adapter(
        self, mock_model_registry: PydanticAIModelRegistry
    ) -> PydanticAIAdapter:
        """Create an adapter with mock registry."""
        return PydanticAIAdapter(model_registry=mock_model_registry)

    @pytest.fixture
    def adapter_with_tools(
        self,
        mock_model_registry: PydanticAIModelRegistry,
        tool_registry: PydanticAIToolRegistry,
    ) -> PydanticAIAdapter:
        """Create an adapter with both model and tool registries."""
        return PydanticAIAdapter(
            model_registry=mock_model_registry,
            tool_registry=tool_registry,
        )

    def test_adapter_name(self, adapter: PydanticAIAdapter) -> None:
        """Test adapter name property."""
        assert adapter.name == "pydantic-ai"

    async def test_adapt_text_basic(
        self, adapter: PydanticAIAdapter, text_ast: dict[str, Any]
    ) -> None:
        """Test adapting a basic text prompt."""
        from agentmark.prompt_core import AgentMark

        # Use AgentMark to process the AST
        am = AgentMark(adapter=adapter)
        prompt = await am.load_text_prompt(text_ast)
        result = await prompt.format(props={"userMessage": "What is 2+2?"})

        # Check result type
        assert isinstance(result, PydanticAITextParams)

        # Check model was resolved
        assert result.model == "test:test-model"

        # Check prompts were extracted
        assert result.system_prompt == "You are a helpful math tutor."
        assert result.user_prompt == "What is 2+2?"

        # Check metadata
        assert result.prompt_name == "math"

    async def test_adapt_object_basic(
        self, adapter: PydanticAIAdapter, math_ast: dict[str, Any]
    ) -> None:
        """Test adapting a basic object prompt."""
        from agentmark.prompt_core import AgentMark

        am = AgentMark(adapter=adapter)
        prompt = await am.load_object_prompt(math_ast)
        result = await prompt.format(props={"userMessage": "What is 2+2?"})

        # Check result type
        assert isinstance(result, PydanticAIObjectParams)

        # Check model was resolved
        assert result.model == "test:test-model"

        # Check prompts were extracted
        assert result.system_prompt == "You are a helpful math tutor."
        assert result.user_prompt == "What is 2+2?"

        # Check output_type is a Pydantic model
        assert issubclass(result.output_type, BaseModel)

        # Check model has expected field
        fields = result.output_type.model_fields
        assert "answer" in fields

    async def test_adapt_object_model_settings(
        self, adapter: PydanticAIAdapter, math_ast: dict[str, Any]
    ) -> None:
        """Test that model settings are adapted correctly."""
        from agentmark.prompt_core import AgentMark

        am = AgentMark(adapter=adapter)
        prompt = await am.load_object_prompt(math_ast)
        result = await prompt.format(props={"userMessage": "test"})

        # math_ast has temperature: 0.5 in the fixture
        assert result.model_settings is not None
        assert result.model_settings.get("temperature") == 0.5

    async def test_adapt_text_with_tools(
        self,
        adapter_with_tools: PydanticAIAdapter,
        tools_text_ast: dict[str, Any],
    ) -> None:
        """Test adapting a text prompt with tools."""
        from agentmark.prompt_core import AgentMark

        am = AgentMark(adapter=adapter_with_tools)
        prompt = await am.load_text_prompt(tools_text_ast)
        result = await prompt.format(props={"userMessage": "Add 2 and 3"})

        # Should have tools
        assert len(result.tools) == 1
        assert result.tools[0].name == "add"

    async def test_adapt_text_tool_context(
        self,
        adapter_with_tools: PydanticAIAdapter,
        tools_text_ast: dict[str, Any],
    ) -> None:
        """Test that tool_context is passed through."""
        from agentmark.prompt_core import AgentMark

        am = AgentMark(adapter=adapter_with_tools)
        prompt = await am.load_text_prompt(tools_text_ast)

        tool_context = {"api_key": "test-key", "user_id": 123}
        result = await prompt.format(
            props={"userMessage": "Add 2 and 3"},
            toolContext=tool_context,
        )

        assert result.tool_context == tool_context

    async def test_adapt_image_raises(
        self, adapter: PydanticAIAdapter, image_ast: dict[str, Any]
    ) -> None:
        """Test that adapt_image raises NotImplementedError."""
        from agentmark.prompt_core import AgentMark

        am = AgentMark(adapter=adapter)

        with pytest.raises(NotImplementedError, match="image generation"):
            prompt = await am.load_image_prompt(image_ast)
            await prompt.format()

    async def test_adapt_speech_raises(
        self, adapter: PydanticAIAdapter, speech_ast: dict[str, Any]
    ) -> None:
        """Test that adapt_speech raises NotImplementedError."""
        from agentmark.prompt_core import AgentMark

        am = AgentMark(adapter=adapter)

        with pytest.raises(NotImplementedError, match="speech synthesis"):
            prompt = await am.load_speech_prompt(speech_ast)
            await prompt.format()

    async def test_raw_messages_preserved(
        self, adapter: PydanticAIAdapter, text_ast: dict[str, Any]
    ) -> None:
        """Test that raw messages are preserved in _raw_messages."""
        from agentmark.prompt_core import AgentMark

        am = AgentMark(adapter=adapter)
        prompt = await am.load_text_prompt(text_ast)
        result = await prompt.format(props={"userMessage": "Hello"})

        # Raw messages should be preserved (they are Pydantic models with .role attribute)
        assert len(result._raw_messages) == 3
        assert result._raw_messages[0].role == "system"
        assert result._raw_messages[1].role == "user"
        assert result._raw_messages[2].role == "assistant"

    async def test_multipart_content_extraction(
        self, adapter: PydanticAIAdapter
    ) -> None:
        """Test that multipart content is properly extracted."""
        # Create AST with multipart content
        multipart_ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": "name: multipart\ntext_config:\n  model_name: test-model",
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "System",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [
                                {"type": "text", "value": "System part 1"},
                            ],
                        }
                    ],
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "User",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [
                                {"type": "text", "value": "User message"},
                            ],
                        }
                    ],
                },
            ],
        }

        from agentmark.prompt_core import AgentMark

        am = AgentMark(adapter=adapter)
        prompt = await am.load_text_prompt(multipart_ast)
        result = await prompt.format(props={})

        assert result.system_prompt == "System part 1"
        assert result.user_prompt == "User message"


class TestSchemaConversion:
    """Tests for JSON Schema to Pydantic model conversion."""

    @pytest.fixture
    def adapter(
        self, mock_model_registry: PydanticAIModelRegistry
    ) -> PydanticAIAdapter:
        """Create an adapter for schema conversion tests."""
        return PydanticAIAdapter(model_registry=mock_model_registry)

    def test_simple_string_field(self, adapter: PydanticAIAdapter) -> None:
        """Test converting a simple string field."""
        schema = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        }

        model = adapter._schema_to_pydantic_model(schema, "TestModel")

        assert issubclass(model, BaseModel)
        fields = model.model_fields
        assert "name" in fields
        # Required field should not be optional
        assert fields["name"].is_required()

    def test_optional_field(self, adapter: PydanticAIAdapter) -> None:
        """Test converting an optional field."""
        schema = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": [],  # Not required
        }

        model = adapter._schema_to_pydantic_model(schema, "TestModel")
        fields = model.model_fields

        assert "name" in fields
        assert not fields["name"].is_required()

    def test_integer_field(self, adapter: PydanticAIAdapter) -> None:
        """Test converting an integer field."""
        schema = {
            "type": "object",
            "properties": {"count": {"type": "integer"}},
            "required": ["count"],
        }

        model = adapter._schema_to_pydantic_model(schema, "TestModel")

        # Create instance to verify type
        instance = model(count=42)
        assert instance.count == 42

    def test_number_field(self, adapter: PydanticAIAdapter) -> None:
        """Test converting a number field to float."""
        schema = {
            "type": "object",
            "properties": {"score": {"type": "number"}},
            "required": ["score"],
        }

        model = adapter._schema_to_pydantic_model(schema, "TestModel")
        instance = model(score=3.14)
        assert instance.score == 3.14

    def test_boolean_field(self, adapter: PydanticAIAdapter) -> None:
        """Test converting a boolean field."""
        schema = {
            "type": "object",
            "properties": {"active": {"type": "boolean"}},
            "required": ["active"],
        }

        model = adapter._schema_to_pydantic_model(schema, "TestModel")
        instance = model(active=True)
        assert instance.active is True

    def test_array_field(self, adapter: PydanticAIAdapter) -> None:
        """Test converting an array field."""
        schema = {
            "type": "object",
            "properties": {
                "tags": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["tags"],
        }

        model = adapter._schema_to_pydantic_model(schema, "TestModel")
        instance = model(tags=["a", "b", "c"])
        assert instance.tags == ["a", "b", "c"]

    def test_nested_object(self, adapter: PydanticAIAdapter) -> None:
        """Test converting a nested object field."""
        schema = {
            "type": "object",
            "properties": {
                "address": {
                    "type": "object",
                    "properties": {
                        "street": {"type": "string"},
                        "city": {"type": "string"},
                    },
                    "required": ["street", "city"],
                }
            },
            "required": ["address"],
        }

        model = adapter._schema_to_pydantic_model(schema, "TestModel")
        instance = model(address={"street": "123 Main St", "city": "NYC"})
        assert instance.address.street == "123 Main St"
        assert instance.address.city == "NYC"

    def test_enum_field(self, adapter: PydanticAIAdapter) -> None:
        """Test converting an enum field."""
        schema = {
            "type": "object",
            "properties": {
                "status": {"enum": ["pending", "active", "completed"]}
            },
            "required": ["status"],
        }

        model = adapter._schema_to_pydantic_model(schema, "TestModel")

        # Enum values should be valid
        instance = model(status="active")
        assert instance.status.value == "active"
