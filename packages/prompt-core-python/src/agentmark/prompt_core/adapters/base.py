"""Adapter protocol definition.

prompt-core passes compiled Pydantic config schemas directly to adapters,
matching the TypeScript pattern where compiled objects are passed as-is.
Each adapter handles its own serialization if needed.
"""

from typing import Any, Protocol

from ..schemas import (
    ImageConfigSchema,
    ObjectConfigSchema,
    SpeechConfigSchema,
    TextConfigSchema,
)
from ..types import AdaptOptions, PromptMetadata


class Adapter(Protocol):
    """Protocol defining the adapter interface for LLM providers.

    Config parameters are Pydantic schema objects compiled by the template
    engine. Adapters that need dict access should call config.model_dump()
    internally.
    """

    @property
    def name(self) -> str:
        """Adapter name identifier."""
        ...

    def adapt_text(
        self,
        config: TextConfigSchema,
        options: AdaptOptions,
        metadata: PromptMetadata,
    ) -> Any:
        """Adapt a text prompt config for the provider.

        Args:
            config: Text prompt configuration (Pydantic model).
            options: Adapter options
            metadata: Prompt metadata

        Returns:
            Provider-specific format
        """
        ...

    def adapt_object(
        self,
        config: ObjectConfigSchema,
        options: AdaptOptions,
        metadata: PromptMetadata,
    ) -> Any:
        """Adapt an object prompt config for the provider.

        Args:
            config: Object prompt configuration (Pydantic model).
            options: Adapter options
            metadata: Prompt metadata

        Returns:
            Provider-specific format
        """
        ...

    def adapt_image(
        self,
        config: ImageConfigSchema,
        options: AdaptOptions,
    ) -> Any:
        """Adapt an image prompt config for the provider.

        Args:
            config: Image prompt configuration (Pydantic model).
            options: Adapter options

        Returns:
            Provider-specific format
        """
        ...

    def adapt_speech(
        self,
        config: SpeechConfigSchema,
        options: AdaptOptions,
    ) -> Any:
        """Adapt a speech prompt config for the provider.

        Args:
            config: Speech prompt configuration (Pydantic model).
            options: Adapter options

        Returns:
            Provider-specific format
        """
        ...
