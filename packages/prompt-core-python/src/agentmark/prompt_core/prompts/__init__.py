"""Prompt classes for prompt-core."""

from .base import BasePrompt
from .image import ImagePrompt
from .object import ObjectPrompt
from .speech import SpeechPrompt
from .text import TextPrompt

__all__ = [
    "BasePrompt",
    "TextPrompt",
    "ObjectPrompt",
    "ImagePrompt",
    "SpeechPrompt",
]
