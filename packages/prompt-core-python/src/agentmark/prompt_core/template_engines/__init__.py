"""Template engines for prompt-core."""

from .instances import (
    ASSISTANT,
    IMAGE_PROMPT,
    SPEECH_PROMPT,
    SYSTEM,
    USER,
    determine_prompt_type,
    get_templatedx_instance,
    image_templatedx,
    language_templatedx,
    speech_templatedx,
)
from .templatedx import TemplateDXTemplateEngine, get_front_matter, get_raw_config

__all__ = [
    "TemplateDXTemplateEngine",
    "get_front_matter",
    "get_raw_config",
    "get_templatedx_instance",
    "determine_prompt_type",
    "image_templatedx",
    "speech_templatedx",
    "language_templatedx",
    "USER",
    "SYSTEM",
    "ASSISTANT",
    "SPEECH_PROMPT",
    "IMAGE_PROMPT",
]
