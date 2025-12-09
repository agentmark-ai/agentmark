"""Tests for AgentMark integration."""

import pytest

from agentmark.prompt_core import AgentMark, DefaultAdapter, create_agentmark


class TestAgentMarkIntegration:
    """Integration tests for AgentMark."""

    @pytest.fixture
    def agentmark(self) -> AgentMark:
        """Create an AgentMark instance with default adapter."""
        return create_agentmark(adapter=DefaultAdapter())

    async def test_load_object_prompt(self, agentmark, math_ast: dict) -> None:
        """Test loading and formatting an object prompt."""
        prompt = await agentmark.load_object_prompt(math_ast)
        result = await prompt.format(props={"userMessage": "What is 2+2?"})

        assert result.name == "math"
        assert len(result.messages) == 3
        assert result.messages[0].role == "system"
        assert result.messages[0].content == "You are a helpful math tutor."
        assert result.messages[1].role == "user"
        assert result.messages[1].content == "What is 2+2?"
        assert result.messages[2].role == "assistant"
        assert result.messages[2].content == "Here's your answer!"

    async def test_load_text_prompt(self, agentmark, text_ast: dict) -> None:
        """Test loading and formatting a text prompt."""
        prompt = await agentmark.load_text_prompt(text_ast)
        result = await prompt.format(props={"userMessage": "Hello!"})

        assert result.name == "math"
        assert len(result.messages) == 3
        assert result.messages[0].role == "system"
        assert result.text_config.model_name == "test-model"

    async def test_load_image_prompt(self, agentmark, image_ast: dict) -> None:
        """Test loading and formatting an image prompt."""
        prompt = await agentmark.load_image_prompt(image_ast)
        result = await prompt.format()

        assert result.name == "image"
        assert result.image_config.prompt == "This is a test for the image prompt to be drawn."
        assert result.image_config.model_name == "test-model"
        assert result.image_config.num_images == 1
        assert result.image_config.size == "1024x1024"
        assert result.image_config.aspect_ratio == "1:1"
        assert result.image_config.seed == 12345

    async def test_load_speech_prompt(self, agentmark, speech_ast: dict) -> None:
        """Test loading and formatting a speech prompt."""
        prompt = await agentmark.load_speech_prompt(speech_ast)
        result = await prompt.format()

        assert result.name == "speech"
        assert (
            result.speech_config.text == "This is a test for the speech prompt to be spoken aloud."
        )
        assert result.speech_config.model_name == "test-model"
        assert result.speech_config.voice == "nova"
        assert result.speech_config.output_format == "mp3"
        assert result.speech_config.speed == 1.0
        assert result.speech_config.instructions == "Please read this text aloud."

    async def test_format_with_test_props(self, agentmark, text_ast: dict) -> None:
        """Test formatting with test props from frontmatter."""
        prompt = await agentmark.load_text_prompt(text_ast)
        result = await prompt.format_with_test_props()

        assert result.name == "math"
        # Test props should be used from frontmatter
        assert result.messages[1].content == "What is 2+2?"

    async def test_attachments_prompt(self, agentmark, attachments_ast: dict) -> None:
        """Test loading a prompt with attachments."""
        prompt = await agentmark.load_object_prompt(attachments_ast)
        result = await prompt.format(
            props={
                "userMessage": "Check this out",
                "imageLink": "https://example.com/image.png",
                "fileMimeType": "application/pdf",
            }
        )

        assert result.name == "attachments"
        assert len(result.messages) == 2

        # User message should have mixed content
        user_message = result.messages[1]
        assert user_message.role == "user"
        content = user_message.content
        assert isinstance(content, list)

        # Should have text, image, and file parts
        text_parts = [p for p in content if p.type == "text"]
        image_parts = [p for p in content if p.type == "image"]
        file_parts = [p for p in content if p.type == "file"]

        assert len(text_parts) == 1
        assert "hello!!!!" in text_parts[0].text
        assert len(image_parts) == 1
        assert image_parts[0].image == "https://example.com/image.png"
        assert len(file_parts) == 1
        assert file_parts[0].data == "https://example.com/document.pdf"
        assert file_parts[0].mimeType == "application/pdf"


class TestAgentMarkProperties:
    """Tests for AgentMark properties."""

    def test_adapter_property(self) -> None:
        """Test adapter property."""
        adapter = DefaultAdapter()
        am = create_agentmark(adapter=adapter)
        assert am.adapter is adapter

    def test_loader_property_none(self) -> None:
        """Test loader property when None."""
        am = create_agentmark(adapter=DefaultAdapter())
        assert am.loader is None

    def test_eval_registry_property(self) -> None:
        """Test eval_registry property."""
        from agentmark.prompt_core import EvalRegistry

        registry = EvalRegistry()
        am = create_agentmark(adapter=DefaultAdapter(), eval_registry=registry)
        assert am.eval_registry is registry
