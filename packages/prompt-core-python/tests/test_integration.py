"""End-to-end integration tests for prompt-core.

These tests verify the complete pipeline from MDX AST to formatted output.
"""

import pytest

from agentmark.prompt_core import (
    AgentMark,
    DefaultAdapter,
    EvalRegistry,
    create_agentmark,
)


class TestEndToEndPipeline:
    """End-to-end tests for the complete prompt processing pipeline."""

    @pytest.fixture
    def agentmark(self) -> AgentMark:
        """Create a fully configured AgentMark instance."""
        return create_agentmark(
            adapter=DefaultAdapter(),
            eval_registry=EvalRegistry(),
        )

    async def test_text_prompt_full_pipeline(self, agentmark: AgentMark) -> None:
        """Test complete text prompt pipeline from AST to formatted output."""
        # Simulated parsed MDX AST (what would come from @agentmark-ai/parser)
        ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": (
                        "name: greeting\n"
                        "text_config:\n"
                        "  model_name: gpt-4\n"
                        "  temperature: 0.7\n"
                        "test_settings:\n"
                        "  props:\n"
                        "    userName: TestUser\n"
                    ),
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "System",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "text", "value": "You are a friendly assistant."}],
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
                                {"type": "text", "value": "Hello, my name is "},
                                {"type": "mdxTextExpression", "value": "props.userName"},
                                {"type": "text", "value": "!"},
                            ],
                        }
                    ],
                },
            ],
        }

        # Load and format
        prompt = await agentmark.load_text_prompt(ast)
        result = await prompt.format(props={"userName": "Alice"})

        # Verify the complete output
        assert result.name == "greeting"
        assert result.text_config.model_name == "gpt-4"
        assert result.text_config.temperature == 0.7

        assert len(result.messages) == 2
        assert result.messages[0].role == "system"
        assert result.messages[0].content == "You are a friendly assistant."
        assert result.messages[1].role == "user"
        assert "Hello, my name is Alice!" in result.messages[1].content

    async def test_text_prompt_with_test_props(self, agentmark: AgentMark) -> None:
        """Test formatting with test props from frontmatter."""
        ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": (
                        "name: test-props-demo\n"
                        "text_config:\n"
                        "  model_name: gpt-4\n"
                        "test_settings:\n"
                        "  props:\n"
                        "    question: What is 2+2?\n"
                    ),
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "User",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "mdxTextExpression", "value": "props.question"}],
                        }
                    ],
                },
            ],
        }

        prompt = await agentmark.load_text_prompt(ast)
        result = await prompt.format_with_test_props()

        assert result.messages[0].role == "user"
        assert "What is 2+2?" in result.messages[0].content

    async def test_object_prompt_with_schema(self, agentmark: AgentMark) -> None:
        """Test object prompt with structured output schema."""
        ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": (
                        "name: extract-entities\n"
                        "object_config:\n"
                        "  model_name: gpt-4\n"
                        "  schema:\n"
                        "    type: object\n"
                        "    properties:\n"
                        "      entities:\n"
                        "        type: array\n"
                        "        items:\n"
                        "          type: string\n"
                        "    required:\n"
                        "      - entities\n"
                    ),
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "System",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "text", "value": "Extract named entities from the text."}],
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
                            "children": [{"type": "mdxTextExpression", "value": "props.text"}],
                        }
                    ],
                },
            ],
        }

        prompt = await agentmark.load_object_prompt(ast)
        result = await prompt.format(props={"text": "John visited Paris last summer."})

        assert result.name == "extract-entities"
        assert result.object_config.schema_ is not None
        assert result.object_config.schema_["type"] == "object"
        assert "entities" in result.object_config.schema_["properties"]

        assert len(result.messages) == 2
        assert "John visited Paris" in result.messages[1].content

    async def test_image_prompt_pipeline(self, agentmark: AgentMark) -> None:
        """Test image generation prompt pipeline."""
        ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": (
                        "name: generate-art\n"
                        "image_config:\n"
                        "  model_name: dall-e-3\n"
                        "  size: 1024x1024\n"
                    ),
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "ImagePrompt",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [
                                {"type": "text", "value": "A "},
                                {"type": "mdxTextExpression", "value": "props.style"},
                                {"type": "text", "value": " painting of a sunset"},
                            ],
                        }
                    ],
                },
            ],
        }

        prompt = await agentmark.load_image_prompt(ast)
        result = await prompt.format(props={"style": "watercolor"})

        assert result.name == "generate-art"
        assert result.image_config.model_name == "dall-e-3"
        assert result.image_config.size == "1024x1024"
        assert "watercolor painting of a sunset" in result.image_config.prompt

    async def test_speech_prompt_pipeline(self, agentmark: AgentMark) -> None:
        """Test speech synthesis prompt pipeline."""
        ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": (
                        "name: read-aloud\n"
                        "speech_config:\n"
                        "  model_name: tts-1\n"
                        "  voice: nova\n"
                    ),
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "System",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "text", "value": "Read with enthusiasm."}],
                        }
                    ],
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "SpeechPrompt",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "mdxTextExpression", "value": "props.text"}],
                        }
                    ],
                },
            ],
        }

        prompt = await agentmark.load_speech_prompt(ast)
        result = await prompt.format(props={"text": "Welcome to the show!"})

        assert result.name == "read-aloud"
        assert result.speech_config.model_name == "tts-1"
        assert result.speech_config.voice == "nova"
        assert result.speech_config.text == "Welcome to the show!"
        assert result.speech_config.instructions == "Read with enthusiasm."

    async def test_user_message_with_attachments(self, agentmark: AgentMark) -> None:
        """Test user message with image and file attachments."""
        ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": (
                        "name: analyze-document\n"
                        "object_config:\n"
                        "  model_name: gpt-4-vision\n"
                        "  schema:\n"
                        "    type: object\n"
                        "    properties:\n"
                        "      summary:\n"
                        "        type: string\n"
                    ),
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "System",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "text", "value": "Analyze the provided content."}],
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
                            "children": [{"type": "text", "value": "Please analyze this:"}],
                        },
                        {
                            "type": "mdxJsxFlowElement",
                            "name": "ImageAttachment",
                            "attributes": [
                                {
                                    "type": "mdxJsxAttribute",
                                    "name": "image",
                                    "value": {
                                        "type": "mdxJsxAttributeValueExpression",
                                        "value": "props.imageUrl",
                                    },
                                }
                            ],
                            "children": [],
                        },
                    ],
                },
            ],
        }

        prompt = await agentmark.load_object_prompt(ast)
        result = await prompt.format(props={"imageUrl": "https://example.com/doc.png"})

        assert result.name == "analyze-document"
        assert len(result.messages) == 2

        user_msg = result.messages[1]
        assert user_msg.role == "user"
        # Content should be a list with text and image parts
        assert isinstance(user_msg.content, list)

        text_parts = [p for p in user_msg.content if p.type == "text"]
        image_parts = [p for p in user_msg.content if p.type == "image"]

        assert len(text_parts) >= 1
        assert len(image_parts) == 1
        assert image_parts[0].image == "https://example.com/doc.png"


class TestEvalRegistryIntegration:
    """Integration tests for EvalRegistry with AgentMark."""

    def test_eval_registry_with_agentmark(self) -> None:
        """Test that EvalRegistry integrates properly with AgentMark."""
        registry = EvalRegistry()

        # Register a simple eval function
        def length_check(_params: dict) -> dict:
            return {"passed": True, "score": 1.0}

        registry.register("length_check", length_check)

        agentmark = create_agentmark(
            adapter=DefaultAdapter(),
            eval_registry=registry,
        )

        assert agentmark.eval_registry is registry
        assert agentmark.eval_registry.has("length_check")
        assert agentmark.eval_registry.get("length_check") is length_check
