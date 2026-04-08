"""Model registry for Claude Agent SDK adapter.

Ported from TypeScript: packages/claude-agent-sdk-v0-adapter/src/model-registry.ts
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from .types import ModelConfig, ModelConfigCreator


class ClaudeAgentModelRegistry:
    """Registry for Claude Agent SDK model configurations.

    Providers must be registered explicitly — there are no defaults.
    If no match is found, a ValueError is raised.

    Unlike other adapters, Claude Agent SDK accepts model names directly,
    so this registry primarily provides validation and optional configuration
    like maxThinkingTokens for extended thinking models.

    Example:
        registry = ClaudeAgentModelRegistry()
        registry.register_models(re.compile(r"claude-.*-thinking"), lambda name, _: ModelConfig(
            model=name,
            max_thinking_tokens=10000
        ))
        registry.register_models("claude-sonnet-4-20250514", lambda name, _: ModelConfig(model=name))
    """

    def __init__(self, default_creator: ModelConfigCreator | None = None) -> None:
        """Create a new model registry.

        Args:
            default_creator: Optional fallback creator function for unmatched models.
                           If not provided, get_model_config() raises ValueError when
                           no match is found.
        """
        self._exact_matches: dict[str, ModelConfigCreator] = {}
        self._pattern_matches: list[tuple[re.Pattern[str], ModelConfigCreator]] = []
        self._providers: dict[str, str | Callable[[str], ModelConfig]] = {}
        self._default_creator: ModelConfigCreator | None = default_creator

    def register_providers(
        self,
        providers: dict[str, str | Callable[[str], ModelConfig]],
    ) -> ClaudeAgentModelRegistry:
        """Register providers for automatic model resolution.

        When a model name contains a "/" (e.g., "anthropic/claude-sonnet-4"),
        the registry looks up the provider by the prefix before the first slash.

        For string values (truthy, non-callable), the prefix is stripped and
        ModelConfig(model=model_id) is returned.

        For callable values, the callable is invoked with the model ID.

        Args:
            providers: Mapping of provider name to string marker or callable.

        Returns:
            self for method chaining.
        """
        self._providers.update(providers)
        return self

    def register_models(
        self,
        pattern: str | re.Pattern[str] | list[str],
        creator: ModelConfigCreator,
    ) -> ClaudeAgentModelRegistry:
        """Register model(s) with a configuration creator.

        Args:
            pattern: Exact model name, regex pattern, or array of names.
            creator: Function that creates model configuration.

        Returns:
            self for chaining.
        """
        if isinstance(pattern, str):
            self._exact_matches[pattern] = creator
        elif isinstance(pattern, list):
            for m in pattern:
                self._exact_matches[m] = creator
        else:
            self._pattern_matches.append((pattern, creator))
        return self

    def get_model_config(
        self, model_name: str, options: dict[str, Any] | None = None
    ) -> ModelConfig:
        """Get model configuration for a given model name.

        Resolution order:
        1. Exact match
        2. Pattern match (first match wins)
        3. Default creator

        Args:
            model_name: The model name to look up.
            options: Optional adapt options.

        Returns:
            Model configuration.

        Raises:
            ValueError: If no matching configuration found.
        """
        # Check exact matches first
        exact_creator = self._exact_matches.get(model_name)
        if exact_creator is not None:
            return exact_creator(model_name, options)

        # Check pattern matches
        for pattern, creator in self._pattern_matches:
            if pattern.search(model_name):
                return creator(model_name, options)

        # Provider auto-resolution for "provider/model" format
        if "/" in model_name:
            slash_idx = model_name.index("/")
            provider_name = model_name[:slash_idx]
            model_id = model_name[slash_idx + 1:]

            if not provider_name or not model_id:
                raise ValueError(
                    f"Invalid model name format: '{model_name}'. Expected 'provider/model'."
                )

            provider = self._providers.get(provider_name)
            if provider is not None:
                if callable(provider):
                    return provider(model_id)
                # Truthy string value: strip the prefix, return plain ModelConfig
                return ModelConfig(model=model_id)

        # Use default creator
        if self._default_creator is not None:
            return self._default_creator(model_name, options)

        raise ValueError(
            f"No model configuration found for: {model_name}. "
            "Register the model using register_models() or register_providers()."
        )

    def has_model(self, model_name: str) -> bool:
        """Check if a model is registered (exact match, pattern match, or provider)."""
        if model_name in self._exact_matches:
            return True
        for pattern, _ in self._pattern_matches:
            if pattern.search(model_name):
                return True
        # Check provider resolution
        if "/" in model_name:
            slash_idx = model_name.index("/")
            provider_name = model_name[:slash_idx]
            model_id = model_name[slash_idx + 1:]
            if provider_name and model_id and provider_name in self._providers:
                return True
        return self._default_creator is not None

