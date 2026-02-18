"""Tests for PydanticAIModelRegistry."""

from __future__ import annotations

import re
from typing import Any

import pytest

from agentmark_pydantic_ai_v0 import (
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


class TestProviderAutoResolution:
    """Tests for provider auto-resolution via register_providers()."""

    def test_should_transform_slash_to_colon_when_string_provider_registered(
        self,
    ) -> None:
        """String provider: 'openai/gpt-4o' -> 'openai:gpt-4o'."""
        registry = PydanticAIModelRegistry()
        registry.register_providers({"openai": "openai"})

        result = registry.get_model("openai/gpt-4o")

        assert result == "openai:gpt-4o"

    def test_should_use_provider_prefix_when_it_differs_from_provider_name(
        self,
    ) -> None:
        """String provider with different prefix: 'my-ai/model-x' -> 'custom-prefix:model-x'."""
        registry = PydanticAIModelRegistry()
        registry.register_providers({"my-ai": "custom-prefix"})

        result = registry.get_model("my-ai/model-x")

        assert result == "custom-prefix:model-x"

    def test_should_call_provider_function_when_callable_provider_registered(
        self,
    ) -> None:
        """Callable provider dispatches to the function with model ID."""
        registry = PydanticAIModelRegistry()
        registry.register_providers({"custom": lambda model_id: f"custom-{model_id}"})

        result = registry.get_model("custom/my-model")

        assert result == "custom-my-model"

    def test_should_pass_only_model_id_to_callable_provider(self) -> None:
        """Callable provider receives the part after the slash, not the full name."""
        captured_ids: list[str] = []

        def tracking_provider(model_id: str) -> str:
            captured_ids.append(model_id)
            return f"tracked:{model_id}"

        registry = PydanticAIModelRegistry()
        registry.register_providers({"tracker": tracking_provider})

        registry.get_model("tracker/some-model-v2")

        assert captured_ids == ["some-model-v2"]

    def test_should_fall_through_to_default_when_provider_not_registered(
        self,
    ) -> None:
        """Unregistered provider falls through to default creator."""
        registry = PydanticAIModelRegistry(
            default_creator=lambda name, _: f"default:{name}"
        )
        registry.register_providers({"openai": "openai"})

        # 'anthropic' is not registered as a provider
        result = registry.get_model("anthropic/claude-3")

        assert result == "default:anthropic/claude-3"

    def test_should_raise_when_provider_not_registered_and_no_default(
        self,
    ) -> None:
        """Unregistered provider with no default raises ValueError."""
        registry = PydanticAIModelRegistry()
        registry.register_providers({"openai": "openai"})

        with pytest.raises(ValueError, match="No model creator found for"):
            registry.get_model("unknown/model")

    def test_should_merge_providers_when_register_called_multiple_times(
        self,
    ) -> None:
        """Multiple register_providers() calls merge provider dictionaries."""
        registry = PydanticAIModelRegistry()
        registry.register_providers({"openai": "openai"})
        registry.register_providers({"anthropic": "anthropic"})

        assert registry.get_model("openai/gpt-4o") == "openai:gpt-4o"
        assert registry.get_model("anthropic/claude-3") == "anthropic:claude-3"

    def test_should_override_provider_when_registered_again_with_same_key(
        self,
    ) -> None:
        """Later register_providers() call overrides earlier one for same key."""
        registry = PydanticAIModelRegistry()
        registry.register_providers({"openai": "old-prefix"})
        registry.register_providers({"openai": "new-prefix"})

        result = registry.get_model("openai/gpt-4o")

        assert result == "new-prefix:gpt-4o"

    def test_should_bypass_provider_resolution_when_no_slash_in_name(
        self,
    ) -> None:
        """Bare model names (no slash) skip provider resolution entirely."""
        registry = PydanticAIModelRegistry(
            default_creator=lambda name, _: f"default:{name}"
        )
        registry.register_providers({"openai": "openai"})

        result = registry.get_model("gpt-4o")

        assert result == "default:gpt-4o"

    def test_should_support_method_chaining_with_register_models(self) -> None:
        """register_providers() chains with register_models() and set_default()."""
        registry = (
            PydanticAIModelRegistry()
            .register_providers({"openai": "openai"})
            .register_models("special-model", lambda name, _: f"special:{name}")
            .set_default(lambda name, _: f"fallback:{name}")
        )

        assert registry.get_model("openai/gpt-4o") == "openai:gpt-4o"
        assert registry.get_model("special-model") == "special:special-model"
        assert registry.get_model("unknown") == "fallback:unknown"

    def test_should_raise_when_provider_name_is_empty(self) -> None:
        """Empty provider name in slash format raises ValueError."""
        registry = PydanticAIModelRegistry()
        registry.register_providers({"": "empty"})

        with pytest.raises(ValueError, match="Invalid model name format"):
            registry.get_model("/gpt-4o")

    def test_should_raise_when_model_id_is_empty(self) -> None:
        """Empty model ID in slash format raises ValueError."""
        registry = PydanticAIModelRegistry()
        registry.register_providers({"openai": "openai"})

        with pytest.raises(ValueError, match="Invalid model name format"):
            registry.get_model("openai/")

    def test_should_prefer_exact_match_over_provider_resolution(self) -> None:
        """Exact match takes priority over provider auto-resolution."""
        registry = PydanticAIModelRegistry()
        registry.register_providers({"openai": "openai"})
        registry.register_models(
            "openai/gpt-4o", lambda name, _: f"exact:{name}"
        )

        result = registry.get_model("openai/gpt-4o")

        assert result == "exact:openai/gpt-4o"

    def test_should_prefer_pattern_match_over_provider_resolution(self) -> None:
        """Pattern match takes priority over provider auto-resolution."""
        registry = PydanticAIModelRegistry()
        registry.register_providers({"openai": "openai"})
        registry.register_models(
            re.compile(r"^openai/"), lambda name, _: f"pattern:{name}"
        )

        result = registry.get_model("openai/gpt-4o")

        assert result == "pattern:openai/gpt-4o"

    def test_should_handle_model_id_with_multiple_slashes(self) -> None:
        """Only the first slash separates provider from model ID."""
        registry = PydanticAIModelRegistry()
        registry.register_providers({"org": "org"})

        result = registry.get_model("org/team/model-v2")

        assert result == "org:team/model-v2"

    def test_should_handle_callable_returning_non_string(self) -> None:
        """Callable provider can return arbitrary objects (e.g., Model instances)."""
        sentinel = object()
        registry = PydanticAIModelRegistry()
        registry.register_providers({"custom": lambda _: sentinel})

        result = registry.get_model("custom/any-model")

        assert result is sentinel


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
