"""Tests for PydanticAIModelRegistry."""

from __future__ import annotations

import re
from typing import Any

import pytest

from agentmark_pydantic_ai import (
    PydanticAIModelRegistry,
    create_default_model_registry,
)


class TestPydanticAIModelRegistry:
    """Tests for the model registry."""

    def test_exact_match(self) -> None:
        """Test exact string match takes priority."""
        registry = PydanticAIModelRegistry()

        registry.register_models("gpt-4o", lambda name, _: f"openai:{name}")
        registry.register_models("claude-3-opus", lambda name, _: f"anthropic:{name}")

        assert registry.get_model("gpt-4o") == "openai:gpt-4o"
        assert registry.get_model("claude-3-opus") == "anthropic:claude-3-opus"

    def test_exact_match_list(self) -> None:
        """Test registering multiple exact matches at once."""
        registry = PydanticAIModelRegistry()

        registry.register_models(
            ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
            lambda name, _: f"openai:{name}",
        )

        assert registry.get_model("gpt-4o") == "openai:gpt-4o"
        assert registry.get_model("gpt-4o-mini") == "openai:gpt-4o-mini"
        assert registry.get_model("gpt-3.5-turbo") == "openai:gpt-3.5-turbo"

    def test_pattern_match(self) -> None:
        """Test regex pattern matching."""
        registry = PydanticAIModelRegistry()

        registry.register_models(
            re.compile(r"^gpt-"),
            lambda name, _: f"openai:{name}",
        )
        registry.register_models(
            re.compile(r"^claude-"),
            lambda name, _: f"anthropic:{name}",
        )

        assert registry.get_model("gpt-4o") == "openai:gpt-4o"
        assert registry.get_model("gpt-3.5-turbo") == "openai:gpt-3.5-turbo"
        assert registry.get_model("claude-3-opus") == "anthropic:claude-3-opus"
        assert registry.get_model("claude-3-5-sonnet") == "anthropic:claude-3-5-sonnet"

    def test_exact_match_priority_over_pattern(self) -> None:
        """Test that exact matches take priority over pattern matches."""
        registry = PydanticAIModelRegistry()

        # Register pattern first
        registry.register_models(
            re.compile(r"^gpt-"),
            lambda name, _: f"pattern:{name}",
        )
        # Register exact match second
        registry.register_models("gpt-4o", lambda name, _: f"exact:{name}")

        # Exact match should win
        assert registry.get_model("gpt-4o") == "exact:gpt-4o"
        # Other gpt- models use pattern
        assert registry.get_model("gpt-3.5-turbo") == "pattern:gpt-3.5-turbo"

    def test_default_creator(self) -> None:
        """Test default creator fallback."""
        registry = PydanticAIModelRegistry(
            default_creator=lambda name, _: f"default:{name}"
        )

        # No exact or pattern matches registered
        assert registry.get_model("unknown-model") == "default:unknown-model"

    def test_set_default(self) -> None:
        """Test setting default creator after construction."""
        registry = PydanticAIModelRegistry()
        registry.set_default(lambda name, _: f"late-default:{name}")

        assert registry.get_model("any-model") == "late-default:any-model"

    def test_no_match_raises(self) -> None:
        """Test that ValueError is raised when no match is found."""
        registry = PydanticAIModelRegistry()

        with pytest.raises(ValueError, match="No model creator found for"):
            registry.get_model("unknown-model")

    def test_options_passed_to_creator(self) -> None:
        """Test that options are passed through to the creator."""
        captured_options: list[dict[str, Any] | None] = []

        def capturing_creator(
            name: str, options: dict[str, Any] | None
        ) -> str:
            captured_options.append(options)
            return f"test:{name}"

        registry = PydanticAIModelRegistry(default_creator=capturing_creator)

        # Call with options
        options = {"apiKey": "test-key", "baseUrl": "https://example.com"}
        registry.get_model("test-model", options)

        assert len(captured_options) == 1
        assert captured_options[0] == options

    def test_method_chaining(self) -> None:
        """Test that register_models and set_default support chaining."""
        registry = (
            PydanticAIModelRegistry()
            .register_models("gpt-4o", lambda name, _: f"openai:{name}")
            .register_models(
                re.compile(r"^claude-"),
                lambda name, _: f"anthropic:{name}",
            )
            .set_default(lambda name, _: f"default:{name}")
        )

        assert registry.get_model("gpt-4o") == "openai:gpt-4o"
        assert registry.get_model("claude-3-opus") == "anthropic:claude-3-opus"
        assert registry.get_model("other") == "default:other"


class TestCreateDefaultModelRegistry:
    """Tests for the create_default_model_registry factory."""

    def test_openai_models(self) -> None:
        """Test OpenAI model name prefixing."""
        registry = create_default_model_registry()

        assert registry.get_model("gpt-4o") == "openai:gpt-4o"
        assert registry.get_model("gpt-4o-mini") == "openai:gpt-4o-mini"
        assert registry.get_model("gpt-3.5-turbo") == "openai:gpt-3.5-turbo"
        assert registry.get_model("o1-preview") == "openai:o1-preview"
        assert registry.get_model("o3-mini") == "openai:o3-mini"

    def test_anthropic_models(self) -> None:
        """Test Anthropic model name prefixing."""
        registry = create_default_model_registry()

        assert registry.get_model("claude-3-opus") == "anthropic:claude-3-opus"
        assert registry.get_model("claude-3-5-sonnet") == "anthropic:claude-3-5-sonnet"
        assert registry.get_model("claude-3-haiku") == "anthropic:claude-3-haiku"

    def test_gemini_models(self) -> None:
        """Test Gemini model name prefixing."""
        registry = create_default_model_registry()

        assert registry.get_model("gemini-1.5-pro") == "gemini:gemini-1.5-pro"
        assert registry.get_model("gemini-1.5-flash") == "gemini:gemini-1.5-flash"

    def test_mistral_models(self) -> None:
        """Test Mistral model name prefixing."""
        registry = create_default_model_registry()

        assert registry.get_model("mistral-large") == "mistral:mistral-large"
        assert registry.get_model("codestral-latest") == "mistral:codestral-latest"

    def test_already_prefixed_passthrough(self) -> None:
        """Test that already-prefixed model names pass through unchanged."""
        registry = create_default_model_registry()

        assert registry.get_model("openai:gpt-4o") == "openai:gpt-4o"
        assert registry.get_model("anthropic:claude-3-opus") == "anthropic:claude-3-opus"
        assert registry.get_model("custom:my-model") == "custom:my-model"

    def test_unknown_model_passthrough(self) -> None:
        """Test that unknown model names pass through unchanged."""
        registry = create_default_model_registry()

        # Unknown models without prefix are returned as-is
        assert registry.get_model("my-custom-model") == "my-custom-model"
        assert registry.get_model("local-llama") == "local-llama"
