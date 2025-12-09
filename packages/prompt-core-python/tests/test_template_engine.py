"""Tests for template engine."""

import pytest

from agentmark.prompt_core.template_engines import (
    TemplateDXTemplateEngine,
    determine_prompt_type,
    get_front_matter,
)


class TestGetFrontMatter:
    """Tests for get_front_matter."""

    def test_extracts_yaml(self) -> None:
        """Test extracting YAML frontmatter."""
        ast = {
            "type": "root",
            "children": [
                {"type": "yaml", "value": "name: test\nmodel: gpt-4"},
                {"type": "paragraph", "children": []},
            ],
        }
        result = get_front_matter(ast)
        assert result == {"name": "test", "model": "gpt-4"}

    def test_empty_yaml(self) -> None:
        """Test with empty YAML."""
        ast = {"type": "root", "children": [{"type": "yaml", "value": ""}]}
        result = get_front_matter(ast)
        assert result == {}

    def test_no_yaml_node(self) -> None:
        """Test with no YAML node."""
        ast = {"type": "root", "children": [{"type": "paragraph", "children": []}]}
        result = get_front_matter(ast)
        assert result == {}

    def test_empty_children(self) -> None:
        """Test with empty children."""
        ast = {"type": "root", "children": []}
        result = get_front_matter(ast)
        assert result == {}


class TestDeterminePromptType:
    """Tests for determine_prompt_type."""

    def test_image_config(self) -> None:
        """Test detecting image config."""
        assert determine_prompt_type({"image_config": {}}) == "image"

    def test_speech_config(self) -> None:
        """Test detecting speech config."""
        assert determine_prompt_type({"speech_config": {}}) == "speech"

    def test_text_config(self) -> None:
        """Test detecting text config."""
        assert determine_prompt_type({"text_config": {}}) == "language"

    def test_object_config(self) -> None:
        """Test detecting object config."""
        assert determine_prompt_type({"object_config": {}}) == "language"

    def test_no_config(self) -> None:
        """Test with no valid config."""
        with pytest.raises(ValueError, match="No valid config found"):
            determine_prompt_type({})


class TestTemplateDXTemplateEngine:
    """Tests for TemplateDXTemplateEngine."""

    async def test_compile_text_prompt(self, text_ast: dict) -> None:
        """Test compiling a text prompt."""
        engine = TemplateDXTemplateEngine()
        result = await engine.compile(text_ast, props={"userMessage": "Hello"})

        assert result.name == "math"
        assert len(result.messages) == 3
        assert result.text_config.model_name == "test-model"

    async def test_compile_object_prompt(self, math_ast: dict) -> None:
        """Test compiling an object prompt."""
        engine = TemplateDXTemplateEngine()
        result = await engine.compile(math_ast, props={"userMessage": "What is 2+2?"})

        assert result.name == "math"
        assert result.object_config.model_name == "test-model"
        assert result.object_config.temperature == 0.5

    async def test_compile_image_prompt(self, image_ast: dict) -> None:
        """Test compiling an image prompt."""
        engine = TemplateDXTemplateEngine()
        result = await engine.compile(image_ast)

        assert result.name == "image"
        assert result.image_config.model_name == "test-model"
        assert result.image_config.prompt == "This is a test for the image prompt to be drawn."

    async def test_compile_speech_prompt(self, speech_ast: dict) -> None:
        """Test compiling a speech prompt."""
        engine = TemplateDXTemplateEngine()
        result = await engine.compile(speech_ast)

        assert result.name == "speech"
        assert result.speech_config.model_name == "test-model"
        assert (
            result.speech_config.text == "This is a test for the speech prompt to be spoken aloud."
        )
        assert result.speech_config.instructions == "Please read this text aloud."
