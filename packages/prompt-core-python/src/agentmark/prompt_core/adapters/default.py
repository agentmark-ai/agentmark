"""Default passthrough adapter."""

from ..schemas import (
    ImageConfigSchema,
    ObjectConfigSchema,
    SpeechConfigSchema,
    TextConfigSchema,
)
from ..types import AdaptOptions, PromptMetadata


class DefaultAdapter:
    """Default passthrough adapter that returns configs unchanged."""

    @property
    def name(self) -> str:
        """Adapter name identifier."""
        return "default"

    def adapt_text(
        self,
        config: TextConfigSchema,
        _options: AdaptOptions,
        _metadata: PromptMetadata,
    ) -> TextConfigSchema:
        """Return text config unchanged."""
        return config

    def adapt_object(
        self,
        config: ObjectConfigSchema,
        _options: AdaptOptions,
        _metadata: PromptMetadata,
    ) -> ObjectConfigSchema:
        """Return object config unchanged."""
        return config

    def adapt_image(
        self,
        config: ImageConfigSchema,
        _options: AdaptOptions,
    ) -> ImageConfigSchema:
        """Return image config unchanged."""
        return config

    def adapt_speech(
        self,
        config: SpeechConfigSchema,
        _options: AdaptOptions,
    ) -> SpeechConfigSchema:
        """Return speech config unchanged."""
        return config
