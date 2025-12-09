"""Adapter protocol definition."""

from typing import Any, Protocol

from ..schemas import (
    ImageConfigSchema,
    ObjectConfigSchema,
    SpeechConfigSchema,
    TextConfigSchema,
)
from ..types import AdaptOptions, PromptMetadata


class Adapter(Protocol):
    """Protocol defining the adapter interface for LLM providers."""

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
            config: Text prompt configuration
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
            config: Object prompt configuration
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
            config: Image prompt configuration
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
            config: Speech prompt configuration
            options: Adapter options

        Returns:
            Provider-specific format
        """
        ...
