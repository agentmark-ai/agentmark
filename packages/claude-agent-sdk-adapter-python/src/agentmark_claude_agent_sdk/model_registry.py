"""Model registry for Claude Agent SDK adapter.

Ported from TypeScript: packages/claude-agent-sdk-adapter/src/model-registry.ts
"""

from __future__ import annotations

import re
from typing import Any

from .types import ModelConfig, ModelConfigCreator


class ClaudeAgentModelRegistry:
    """Registry for Claude Agent SDK model configurations.

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
            default_creator: Default creator function for unmatched models.
                           If not provided, creates a passthrough creator.
        """
        self._exact_matches: dict[str, ModelConfigCreator] = {}
        self._pattern_matches: list[tuple[re.Pattern[str], ModelConfigCreator]] = []
        self._default_creator: ModelConfigCreator | None = (
            default_creator
            if default_creator is not None
            else (lambda name, _: ModelConfig(model=name))
        )

    @classmethod
    def create_default(cls) -> ClaudeAgentModelRegistry:
        """Create a default registry that passes model names through directly."""
        return cls(lambda model_name, _: ModelConfig(model=model_name))

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

        # Use default creator
        if self._default_creator is not None:
            return self._default_creator(model_name, options)

        raise ValueError(
            f"No model configuration found for: {model_name}. "
            "Register the model using register_models() or provide a default creator."
        )

    def has_model(self, model_name: str) -> bool:
        """Check if a model is registered (exact or pattern match)."""
        if model_name in self._exact_matches:
            return True
        for pattern, _ in self._pattern_matches:
            if pattern.search(model_name):
                return True
        return self._default_creator is not None


def create_default_model_registry() -> ClaudeAgentModelRegistry:
    """Create a default model registry that passes model names through directly."""
    return ClaudeAgentModelRegistry.create_default()
