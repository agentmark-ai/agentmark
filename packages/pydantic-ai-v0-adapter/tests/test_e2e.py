"""E2E Integration Tests for Seamless Pull-Models Flow (Pydantic AI)

Tests the full workflow:
1. Create registry with register_providers()
2. Use provider/model format (as written by pull-models CLI)
3. Attempt to run a prompt
4. Verify it fails with API key error (not resolution error)

Note: Pydantic AI uses ":" separator, so "openai/gpt-4o" becomes "openai:gpt-4o"
"""

from __future__ import annotations

import pytest

from agentmark_pydantic_ai_v0 import (
    PydanticAIModelRegistry,
    create_pydantic_ai_client,
)


class TestSeamlessPullModelsE2E:
    """E2E tests for seamless pull-models flow."""

    async def test_wire_openai_provider_model_through_full_flow(self) -> None:
        """Test OpenAI provider/model wiring through format."""
        # Step 1: Create registry and register OpenAI provider
        registry = PydanticAIModelRegistry()
        registry.register_providers({"openai": "openai"})

        # Step 2: Create client
        client = create_pydantic_ai_client(model_registry=registry)

        # Step 3: Load prompt with provider/model format
        prompt_ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": """name: test-pydantic-openai
text_config:
  model_name: openai/gpt-4o-mini""",
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "User",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "text", "value": "Say hello"}],
                        }
                    ],
                },
            ],
        }

        # Step 4: Format the prompt
        prompt = await client.load_text_prompt(prompt_ast)  # type: ignore[arg-type]
        params = await prompt.format(props={})  # type: ignore[call-overload]

        # Step 5: Verify model was resolved with "/" -> ":" transform
        assert params.model is not None
        assert params.model == "openai:gpt-4o-mini"

    async def test_wire_anthropic_provider_model_through_full_flow(self) -> None:
        """Test Anthropic provider/model wiring."""
        registry = PydanticAIModelRegistry()
        registry.register_providers({"anthropic": "anthropic"})

        client = create_pydantic_ai_client(model_registry=registry)

        prompt_ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": """name: test-pydantic-anthropic
text_config:
  model_name: anthropic/claude-3-5-haiku-20241022""",
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "User",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "text", "value": "Say hello"}],
                        }
                    ],
                },
            ],
        }

        prompt = await client.load_text_prompt(prompt_ast)  # type: ignore[arg-type]
        params = await prompt.format(props={})  # type: ignore[call-overload]

        assert params.model == "anthropic:claude-3-5-haiku-20241022"

    async def test_support_multiple_providers_at_once(self) -> None:
        """Test registering multiple providers simultaneously."""
        # Step 1: Register both OpenAI and Anthropic
        registry = PydanticAIModelRegistry()
        registry.register_providers({
            "openai": "openai",
            "anthropic": "anthropic",
        })

        client = create_pydantic_ai_client(model_registry=registry)

        # Step 2: Test OpenAI model
        openai_prompt_ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": """name: test-pydantic-multi-openai
text_config:
  model_name: openai/gpt-4o-mini""",
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "User",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "text", "value": "Test"}],
                        }
                    ],
                },
            ],
        }

        prompt1 = await client.load_text_prompt(openai_prompt_ast)  # type: ignore[arg-type]
        params1 = await prompt1.format(props={})  # type: ignore[call-overload]
        assert params1.model == "openai:gpt-4o-mini"

        # Step 3: Test Anthropic model
        anthropic_prompt_ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": """name: test-pydantic-multi-anthropic
text_config:
  model_name: anthropic/claude-3-5-haiku-20241022""",
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "User",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "text", "value": "Test"}],
                        }
                    ],
                },
            ],
        }

        prompt2 = await client.load_text_prompt(anthropic_prompt_ast)  # type: ignore[arg-type]
        params2 = await prompt2.format(props={})  # type: ignore[call-overload]
        assert params2.model == "anthropic:claude-3-5-haiku-20241022"

    async def test_fail_with_clear_error_when_provider_not_registered(self) -> None:
        """Test error when provider is not registered."""
        registry = PydanticAIModelRegistry()
        client = create_pydantic_ai_client(model_registry=registry)

        prompt_ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": """name: test-pydantic-unregistered
text_config:
  model_name: openai/gpt-4o-mini""",
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "User",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "text", "value": "Test"}],
                        }
                    ],
                },
            ],
        }

        prompt = await client.load_text_prompt(prompt_ast)  # type: ignore[arg-type]

        with pytest.raises(ValueError, match="No model creator found"):
            await prompt.format(props={})  # type: ignore[call-overload]

    async def test_callable_provider_for_custom_models(self) -> None:
        """Test using callable provider for custom model creation."""
        registry = PydanticAIModelRegistry()

        # Register a callable provider that creates custom model instances
        def custom_model_creator(model_id: str) -> str:
            return f"custom-provider:{model_id.upper()}"

        registry.register_providers({"custom": custom_model_creator})

        client = create_pydantic_ai_client(model_registry=registry)

        prompt_ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": """name: test-pydantic-callable
text_config:
  model_name: custom/my-model""",
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "User",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "text", "value": "Test"}],
                        }
                    ],
                },
            ],
        }

        prompt = await client.load_text_prompt(prompt_ast)  # type: ignore[arg-type]
        params = await prompt.format(props={})  # type: ignore[call-overload]

        # Callable should have transformed the model ID
        assert params.model == "custom-provider:MY-MODEL"

    async def test_handle_model_names_with_multiple_slashes(self) -> None:
        """Test edge case: model names with multiple slashes."""
        registry = PydanticAIModelRegistry()
        registry.register_providers({"custom": "custom"})

        client = create_pydantic_ai_client(model_registry=registry)

        prompt_ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": """name: test-pydantic-multi-slash
text_config:
  model_name: custom/org/model-name""",
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "User",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "text", "value": "Test"}],
                        }
                    ],
                },
            ],
        }

        prompt = await client.load_text_prompt(prompt_ast)  # type: ignore[arg-type]
        params = await prompt.format(props={})  # type: ignore[call-overload]

        # Should split on first "/" only: custom/org/model-name -> custom:org/model-name
        assert params.model == "custom:org/model-name"

    async def test_backward_compatibility_with_bare_model_names(self) -> None:
        """Test that bare model names (no /) still work."""
        registry = PydanticAIModelRegistry()

        # Register a default creator that handles bare names
        registry._default_creator = lambda name, _: f"default:{name}"

        client = create_pydantic_ai_client(model_registry=registry)

        prompt_ast = {
            "type": "root",
            "children": [
                {
                    "type": "yaml",
                    "value": """name: test-pydantic-bare
text_config:
  model_name: gpt-4o-mini""",
                },
                {
                    "type": "mdxJsxFlowElement",
                    "name": "User",
                    "attributes": [],
                    "children": [
                        {
                            "type": "paragraph",
                            "children": [{"type": "text", "value": "Test"}],
                        }
                    ],
                },
            ],
        }

        prompt = await client.load_text_prompt(prompt_ast)  # type: ignore[arg-type]
        params = await prompt.format(props={})  # type: ignore[call-overload]

        # Bare name should use default creator
        assert params.model == "default:gpt-4o-mini"
