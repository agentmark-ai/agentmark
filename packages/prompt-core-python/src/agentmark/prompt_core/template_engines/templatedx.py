"""TemplateDX-based template engine for prompt-core."""

import asyncio
from typing import Any

import yaml

from ..schemas import (
    AgentmarkConfigSchema,
    ImageConfigSchema,
    ObjectConfigSchema,
    SpeechConfigSchema,
    TextConfigSchema,
)
from ..types import PromptKind, RichChatMessage
from .instances import (
    ASSISTANT,
    EXTRACT_TEXT_PROMISES_KEY,
    IMAGE_PROMPT,
    SPEECH_PROMPT,
    SYSTEM,
    USER,
    determine_prompt_type,
    get_templatedx_instance,
)

# Type alias for AST nodes
Node = dict[str, Any]


def get_front_matter(tree: Node) -> dict[str, Any]:
    """Extract frontmatter from AST.

    Args:
        tree: Root AST node

    Returns:
        Parsed YAML frontmatter as dict
    """
    children = tree.get("children", [])
    for child in children:
        if child.get("type") == "yaml":
            value = child.get("value", "")
            result = yaml.safe_load(value)
            return result if isinstance(result, dict) else {}
    return {}


class TemplateDXTemplateEngine:
    """TemplateDX-based template engine for prompt-core."""

    async def compile(
        self,
        template: Any,
        props: dict[str, Any] | None = None,
    ) -> AgentmarkConfigSchema:
        """Compile a template with props.

        Args:
            template: Pre-parsed MDX AST
            props: Props to pass to the template

        Returns:
            Compiled prompt configuration
        """
        return await get_raw_config(ast=template, props=props or {})


async def get_raw_config(
    ast: Node,
    props: dict[str, Any],
) -> AgentmarkConfigSchema:
    """Extract configuration from AST with props applied.

    Args:
        ast: Pre-parsed MDX AST
        props: Props to pass to the template

    Returns:
        Compiled prompt configuration

    Raises:
        ValueError: If no valid config found in frontmatter
    """
    front_matter = get_front_matter(ast)
    prompt_type = determine_prompt_type(front_matter)

    templatedx_instance = get_templatedx_instance(prompt_type)
    shared: dict[str, Any] = {}
    await templatedx_instance.transform(ast, props, shared)

    # Collect extracted fields from coroutines
    extract_coros: list[Any] = shared.get(EXTRACT_TEXT_PROMISES_KEY, [])
    extracted_fields: list[dict[str, Any]] = list(await asyncio.gather(*extract_coros))

    # Build config based on type
    name: str = front_matter.get("name", "")
    speech_settings = front_matter.get("speech_config")
    image_settings = front_matter.get("image_config")
    object_settings = front_matter.get("object_config")
    text_settings = front_matter.get("text_config")
    test_settings = front_matter.get("test_settings")
    agentmark_meta = front_matter.get("agentmark_meta")

    # Determine config type and build response
    if speech_settings:
        return _build_speech_config(
            name, extracted_fields, speech_settings, test_settings, agentmark_meta
        )
    elif image_settings:
        return _build_image_config(
            name, extracted_fields, image_settings, test_settings, agentmark_meta
        )
    elif object_settings:
        return _build_object_config(
            name, extracted_fields, object_settings, test_settings, agentmark_meta
        )
    elif text_settings:
        return _build_text_config(
            name, extracted_fields, text_settings, test_settings, agentmark_meta
        )

    raise ValueError("No valid config found in frontmatter.")


def _get_messages(
    extracted_fields: list[dict[str, Any]], config_type: PromptKind
) -> list[RichChatMessage]:
    """Convert extracted fields to message list.

    Args:
        extracted_fields: List of extracted field dicts with 'name' and 'content'
        config_type: The prompt type for error messages

    Returns:
        List of rich chat messages

    Raises:
        ValueError: If system message is not first or invalid role tag
    """
    messages: list[RichChatMessage] = []
    role_tags = {USER, SYSTEM, ASSISTANT}

    for i, field in enumerate(extracted_fields):
        field_name = field["name"]

        if i != 0 and field_name == SYSTEM:
            raise ValueError(f"System message may only be the first message: {field['content']}")

        if field_name not in role_tags:
            raise ValueError(f'Invalid role tag: "{field_name}" in config type: {config_type}.')

        role_map = {USER: "user", ASSISTANT: "assistant", SYSTEM: "system"}
        role = role_map[field_name]
        messages.append({"role": role, "content": field["content"]})  # type: ignore[typeddict-item]

    return messages


def _get_prompt(
    tag_name: str,
    extracted_fields: list[dict[str, Any]],
) -> dict[str, str | None]:
    """Get prompt text for speech or image prompts.

    Args:
        tag_name: Either SPEECH_PROMPT or IMAGE_PROMPT
        extracted_fields: List of extracted field dicts

    Returns:
        Dict with 'prompt' and optionally 'instructions'
    """
    if tag_name == SPEECH_PROMPT:
        speech_field = next((f for f in extracted_fields if f["name"] == SPEECH_PROMPT), None)
        system_field = next((f for f in extracted_fields if f["name"] == SYSTEM), None)

        return {
            "prompt": speech_field["content"] if speech_field else "",
            "instructions": system_field["content"] if system_field else None,
        }

    if tag_name == IMAGE_PROMPT:
        image_field = next((f for f in extracted_fields if f["name"] == IMAGE_PROMPT), None)
        return {"prompt": image_field["content"] if image_field else ""}

    return {"prompt": ""}


def _build_text_config(
    name: str,
    extracted_fields: list[dict[str, Any]],
    text_settings: dict[str, Any],
    test_settings: dict[str, Any] | None,
    agentmark_meta: dict[str, Any] | None,
) -> TextConfigSchema:
    """Build a text config from extracted data."""
    messages = _get_messages(extracted_fields, "text")

    config_dict: dict[str, Any] = {
        "name": name,
        "messages": messages,
        "text_config": text_settings,
    }

    if test_settings:
        config_dict["test_settings"] = test_settings
    if agentmark_meta:
        config_dict["agentmark_meta"] = agentmark_meta

    return TextConfigSchema.model_validate(config_dict)


def _build_object_config(
    name: str,
    extracted_fields: list[dict[str, Any]],
    object_settings: dict[str, Any],
    test_settings: dict[str, Any] | None,
    agentmark_meta: dict[str, Any] | None,
) -> ObjectConfigSchema:
    """Build an object config from extracted data."""
    messages = _get_messages(extracted_fields, "object")

    config_dict: dict[str, Any] = {
        "name": name,
        "messages": messages,
        "object_config": object_settings,
    }

    if test_settings:
        config_dict["test_settings"] = test_settings
    if agentmark_meta:
        config_dict["agentmark_meta"] = agentmark_meta

    return ObjectConfigSchema.model_validate(config_dict)


def _build_image_config(
    name: str,
    extracted_fields: list[dict[str, Any]],
    image_settings: dict[str, Any],
    test_settings: dict[str, Any] | None,
    agentmark_meta: dict[str, Any] | None,
) -> ImageConfigSchema:
    """Build an image config from extracted data."""
    prompt_data = _get_prompt(IMAGE_PROMPT, extracted_fields)

    config_dict: dict[str, Any] = {
        "name": name,
        "image_config": {
            **image_settings,
            "prompt": prompt_data["prompt"],
        },
    }

    if test_settings:
        config_dict["test_settings"] = test_settings
    if agentmark_meta:
        config_dict["agentmark_meta"] = agentmark_meta

    return ImageConfigSchema.model_validate(config_dict)


def _build_speech_config(
    name: str,
    extracted_fields: list[dict[str, Any]],
    speech_settings: dict[str, Any],
    test_settings: dict[str, Any] | None,
    agentmark_meta: dict[str, Any] | None,
) -> SpeechConfigSchema:
    """Build a speech config from extracted data."""
    prompt_data = _get_prompt(SPEECH_PROMPT, extracted_fields)

    speech_config: dict[str, Any] = {
        **speech_settings,
        "text": prompt_data["prompt"],
    }
    if prompt_data.get("instructions"):
        speech_config["instructions"] = prompt_data["instructions"]

    config_dict: dict[str, Any] = {
        "name": name,
        "speech_config": speech_config,
    }

    if test_settings:
        config_dict["test_settings"] = test_settings
    if agentmark_meta:
        config_dict["agentmark_meta"] = agentmark_meta

    return SpeechConfigSchema.model_validate(config_dict)
