"""Raw tag plugin for unprocessed content."""

from typing import Any

from ..constants import NODE_TYPES
from ..tag_plugin import Node, PluginContext, TagPlugin


class RawPlugin(TagPlugin):
    """Handles <Raw> tags - outputs children as raw markdown."""

    async def transform(
        self,
        props: dict[str, Any],
        children: list[Node],
        context: PluginContext,
    ) -> list[Node]:
        """Transform the Raw tag.

        Converts children back to markdown string without processing
        expressions or nested tags.

        Args:
            props: Unused
            children: Child nodes to convert to raw markdown
            context: Plugin context

        Returns:
            A single text node containing the raw markdown
        """
        markdown = context.node_helpers.to_markdown(children)
        return [{"type": NODE_TYPES["TEXT"], "value": markdown}]
