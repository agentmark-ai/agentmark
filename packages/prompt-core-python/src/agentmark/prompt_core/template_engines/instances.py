"""Pre-configured TemplateDX instances with prompt-specific tag plugins."""

from typing import Any

from templatedx import TemplateDX
from templatedx.scope import Scope
from templatedx.tag_plugin import Node, PluginContext, TagPlugin

# Role tag constants
USER = "User"
SYSTEM = "System"
ASSISTANT = "Assistant"
SPEECH_PROMPT = "SpeechPrompt"
IMAGE_PROMPT = "ImagePrompt"

# Shared context keys
EXTRACT_TEXT_PROMISES_KEY = "__agentmark-extractTextPromises"
MEDIA_PARTS_KEY = "__agentmark-mediaParts"
INSIDE_MESSAGE_TYPE_KEY = "__insideMessageType"


class SimpleTextPlugin(TagPlugin):
    """Extracts text content from System, Assistant, SpeechPrompt, ImagePrompt tags."""

    async def transform(
        self,
        _props: dict[str, Any],
        children: list[Node],
        context: PluginContext,
    ) -> list[Node]:
        """Transform the tag by extracting text and storing in shared context."""
        tag_name = context.tag_name
        if not tag_name:
            raise ValueError("tag_name must be provided in PluginContext")

        # Create coroutine to extract text and add to shared context
        coro = self._extract_text(children, tag_name, context)
        self._add_coroutine_to_scope(coro, context.scope)

        return []

    async def _extract_text(
        self,
        children: list[Node],
        tag_name: str,
        context: PluginContext,
    ) -> dict[str, str]:
        """Extract text from children nodes."""
        # Use the transformer to process children
        transformer = context.create_node_transformer(context.scope)
        processed_children: list[Node] = []
        for child in children:
            result = await transformer.transform_node(child)
            if isinstance(result, list):
                processed_children.extend(result)
            else:
                processed_children.append(result)

        # Convert back to markdown
        markdown = context.node_helpers.to_markdown(processed_children)
        return {"content": markdown.strip(), "name": tag_name}

    def _add_coroutine_to_scope(self, coro: Any, scope: Scope) -> None:
        """Add coroutine to the shared promises list."""
        promises = scope.get_shared(EXTRACT_TEXT_PROMISES_KEY)
        if promises is not None:
            promises.append(coro)
        else:
            scope.set_shared(EXTRACT_TEXT_PROMISES_KEY, [coro])


class UserPlugin(TagPlugin):
    """Handles User tag with support for mixed content (text + attachments)."""

    async def transform(
        self,
        _props: dict[str, Any],
        children: list[Node],
        context: PluginContext,
    ) -> list[Node]:
        """Transform the User tag by extracting content and media attachments."""
        # Create child scope to track we're inside User
        child_scope = context.scope.create_child()
        child_scope.set_shared(INSIDE_MESSAGE_TYPE_KEY, USER)

        coro = self._extract_user_content(children, context, child_scope)
        self._add_coroutine_to_scope(coro, context.scope)

        return []

    async def _extract_user_content(
        self,
        children: list[Node],
        context: PluginContext,
        child_scope: Scope,
    ) -> dict[str, Any]:
        """Extract user content including text and media attachments."""
        transformer = context.create_node_transformer(child_scope)
        processed_children: list[Node] = []
        for child in children:
            result = await transformer.transform_node(child)
            if isinstance(result, list):
                processed_children.extend(result)
            else:
                processed_children.append(result)

        markdown = context.node_helpers.to_markdown(processed_children)
        media_parts = child_scope.get_shared(MEDIA_PARTS_KEY) or []

        content: str | list[dict[str, Any]]
        if media_parts:
            content = [{"type": "text", "text": markdown.strip()}, *media_parts]
        else:
            content = markdown.strip()

        return {"content": content, "name": USER}

    def _add_coroutine_to_scope(self, coro: Any, scope: Scope) -> None:
        """Add coroutine to the shared promises list."""
        promises = scope.get_shared(EXTRACT_TEXT_PROMISES_KEY)
        if promises is not None:
            promises.append(coro)
        else:
            scope.set_shared(EXTRACT_TEXT_PROMISES_KEY, [coro])


class MediaAttachmentPlugin(TagPlugin):
    """Handles ImageAttachment and FileAttachment tags inside User."""

    async def transform(
        self,
        props: dict[str, Any],
        _children: list[Node],
        context: PluginContext,
    ) -> list[Node]:
        """Transform media attachment tags."""
        tag_name = context.tag_name
        if not tag_name:
            raise ValueError("tag_name must be provided in PluginContext")

        # Validate we're inside User
        inside_type = context.scope.get_shared(INSIDE_MESSAGE_TYPE_KEY)
        if inside_type != USER:
            raise ValueError("ImageAttachment and FileAttachment tags must be inside User tag.")

        media_parts: list[dict[str, Any]] = context.scope.get_shared(MEDIA_PARTS_KEY) or []

        if tag_name == "ImageAttachment":
            self._process_image_attachment(props, media_parts)
        elif tag_name == "FileAttachment":
            self._process_file_attachment(props, media_parts)

        context.scope.set_shared(MEDIA_PARTS_KEY, media_parts)
        return []

    def _process_image_attachment(
        self, props: dict[str, Any], media_parts: list[dict[str, Any]]
    ) -> None:
        """Process an ImageAttachment tag."""
        image = props.get("image")
        if image is None:
            raise ValueError("ImageAttachment must contain an image prop")

        part: dict[str, Any] = {"type": "image", "image": image}
        if mime_type := props.get("mimeType"):
            part["mimeType"] = mime_type
        media_parts.append(part)

    def _process_file_attachment(
        self, props: dict[str, Any], media_parts: list[dict[str, Any]]
    ) -> None:
        """Process a FileAttachment tag."""
        data = props.get("data")
        mime_type = props.get("mimeType")
        if data is None or mime_type is None:
            raise ValueError("FileAttachment must contain data and mimeType props")

        media_parts.append({"type": "file", "data": data, "mimeType": mime_type})


# Pre-configured instances
image_templatedx = TemplateDX()
speech_templatedx = TemplateDX()
language_templatedx = TemplateDX()

# Create plugin instances
_simple_text_plugin = SimpleTextPlugin()
_user_plugin = UserPlugin()
_media_plugin = MediaAttachmentPlugin()

# Register plugins on instances
image_templatedx.register_tag_plugin(_simple_text_plugin, [IMAGE_PROMPT])
speech_templatedx.register_tag_plugin(_simple_text_plugin, [SYSTEM, SPEECH_PROMPT])
language_templatedx.register_tag_plugin(_simple_text_plugin, [SYSTEM, ASSISTANT])
language_templatedx.register_tag_plugin(_user_plugin, [USER])
language_templatedx.register_tag_plugin(_media_plugin, ["ImageAttachment", "FileAttachment"])


def get_templatedx_instance(prompt_type: str) -> TemplateDX:
    """Get the appropriate TemplateDX instance for a prompt type.

    Args:
        prompt_type: One of "image", "speech", or "language"

    Returns:
        The configured TemplateDX instance

    Raises:
        ValueError: If prompt_type is unknown
    """
    match prompt_type:
        case "image":
            return image_templatedx
        case "speech":
            return speech_templatedx
        case "language":
            return language_templatedx
        case _:
            raise ValueError(f"Unknown prompt type: {prompt_type}")


def determine_prompt_type(front_matter: dict[str, Any]) -> str:
    """Determine prompt type from frontmatter.

    Args:
        front_matter: Parsed YAML frontmatter

    Returns:
        One of "image", "speech", or "language"

    Raises:
        ValueError: If no valid config found in frontmatter
    """
    if "image_config" in front_matter:
        return "image"
    if "speech_config" in front_matter:
        return "speech"
    if "text_config" in front_matter or "object_config" in front_matter:
        return "language"
    raise ValueError(
        "No valid config found in frontmatter. "
        "Please specify one of: image_config, speech_config, text_config, or object_config."
    )
