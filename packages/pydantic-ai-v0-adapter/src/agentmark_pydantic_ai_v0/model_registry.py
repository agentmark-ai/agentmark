"""Model registry for mapping AgentMark model names to Pydantic AI models."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pydantic_ai.models import Model

from .types import AdaptOptions, ModelFunctionCreator


class PydanticAIModelRegistry:
    """Registry for mapping model names to Pydantic AI model instances.

    Mirrors TypeScript's VercelAIModelRegistry pattern. Supports:
    - Exact string matches (highest priority)
    - Regex pattern matches
    - Default fallback creator

    Example:
        registry = PydanticAIModelRegistry()

        # Register exact matches
        registry.register_models("gpt-4o", lambda name, _: f"openai:{name}")
        registry.register_models(
            ["claude-3-5-sonnet", "claude-3-opus"],
            lambda name, _: f"anthropic:{name}"
        )

        # Register pattern match
        registry.register_models(
            re.compile(r"^gpt-"),
            lambda name, _: f"openai:{name}"
        )

        # Use
        model = registry.get_model("gpt-4o")  # Returns "openai:gpt-4o"
    """

    def __init__(
        self,
        default_creator: ModelFunctionCreator | None = None,
    ) -> None:
        """Initialize the registry.

        Args:
            default_creator: Fallback creator when no match is found.
        """
        self._exact_matches: dict[str, ModelFunctionCreator] = {}
        self._pattern_matches: list[tuple[re.Pattern[str], ModelFunctionCreator]] = []
        self._default_creator = default_creator

    def register_models(
        self,
        model_pattern: str | re.Pattern[str] | list[str],
        creator: ModelFunctionCreator,
    ) -> PydanticAIModelRegistry:
        """Register a model creator for the given pattern.

        Args:
            model_pattern: Exact name, regex pattern, or list of exact names.
            creator: Function to create model instance from name.

        Returns:
            Self for method chaining.
        """
        if isinstance(model_pattern, str):
            self._exact_matches[model_pattern] = creator
        elif isinstance(model_pattern, list):
            for name in model_pattern:
                self._exact_matches[name] = creator
        else:
            self._pattern_matches.append((model_pattern, creator))
        return self

    def get_model(
        self,
        model_name: str,
        options: AdaptOptions | None = None,
    ) -> Model | str:
        """Get a model instance for the given name.

        Args:
            model_name: The model name from AgentMark config.
            options: Adapter options (may contain API keys, etc.).

        Returns:
            Pydantic AI model instance or model string.

        Raises:
            ValueError: If no creator found for the model name.
        """
        # Check exact matches first (highest priority)
        if model_name in self._exact_matches:
            return self._exact_matches[model_name](model_name, options)

        # Check pattern matches
        for pattern, creator in self._pattern_matches:
            if pattern.match(model_name):
                return creator(model_name, options)

        # Fall back to default
        if self._default_creator:
            return self._default_creator(model_name, options)

        raise ValueError(f"No model creator found for: {model_name}")

    def set_default(
        self,
        creator: ModelFunctionCreator,
    ) -> PydanticAIModelRegistry:
        """Set the default model creator.

        Args:
            creator: Default creator function.

        Returns:
            Self for method chaining.
        """
        self._default_creator = creator
        return self


def create_default_model_registry() -> PydanticAIModelRegistry:
    """Create a model registry with sensible defaults.

    Uses Pydantic AI's string format which auto-resolves providers.
    This matches common model naming patterns used in AgentMark prompts.

    Returns:
        Pre-configured model registry.
    """

    def default_creator(name: str, _options: AdaptOptions | None) -> str:
        # Pydantic AI accepts "provider:model" format
        # If already has provider prefix, return as-is
        if ":" in name:
            return name

        # Common model name patterns → provider prefixes
        if name.startswith("gpt-") or name.startswith("o1") or name.startswith("o3"):
            return f"openai:{name}"
        if name.startswith("claude-"):
            return f"anthropic:{name}"
        if name.startswith("gemini-"):
            return f"gemini:{name}"
        if name.startswith("mistral-") or name.startswith("codestral"):
            return f"mistral:{name}"

        # Return as-is and let Pydantic AI attempt resolution
        return name

    return PydanticAIModelRegistry(default_creator=default_creator)  # type: ignore[arg-type]
