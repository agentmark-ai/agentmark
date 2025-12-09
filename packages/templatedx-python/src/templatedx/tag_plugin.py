"""Tag plugin base class and context types."""

from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from .constants import NODE_TYPES

if TYPE_CHECKING:
    from .scope import Scope

# Type alias for AST nodes (represented as dicts in Python)
Node = dict[str, Any]


@dataclass
class NodeHelpers:
    """Helper functions for working with AST nodes."""

    is_mdx_jsx_element: Callable[[Node], bool]
    is_mdx_jsx_flow_element: Callable[[Node], bool]
    is_mdx_jsx_text_element: Callable[[Node], bool]
    is_parent_node: Callable[[Node], bool]
    to_markdown: Callable[[list[Node]], str]
    has_function_body: Callable[[Node], bool]
    get_function_body: Callable[[Node], tuple[list[str], list[Node]]]
    NODE_TYPES: dict[str, str]


@dataclass
class PluginContext:
    """Context provided to tag plugins during transformation."""

    node_helpers: NodeHelpers
    create_node_transformer: Callable[["Scope"], Any]
    scope: "Scope"
    tag_name: str


class TagPlugin(ABC):
    """Abstract base class for tag plugins."""

    @abstractmethod
    async def transform(
        self,
        props: dict[str, Any],
        children: list[Node],
        context: PluginContext,
    ) -> list[Node] | Node:
        """Transform the tag and its children.

        Args:
            props: Evaluated properties of the tag
            children: Child AST nodes
            context: Plugin context with helpers and scope

        Returns:
            Transformed node(s)
        """
        pass


# Helper functions for checking node types


def is_mdx_jsx_element(node: Node) -> bool:
    """Check if node is an MDX JSX element."""
    return node.get("type") in (
        NODE_TYPES["MDX_JSX_FLOW_ELEMENT"],
        NODE_TYPES["MDX_JSX_TEXT_ELEMENT"],
    )


def is_mdx_jsx_flow_element(node: Node) -> bool:
    """Check if node is an MDX JSX flow element."""
    return node.get("type") == NODE_TYPES["MDX_JSX_FLOW_ELEMENT"]


def is_mdx_jsx_text_element(node: Node) -> bool:
    """Check if node is an MDX JSX text element."""
    return node.get("type") == NODE_TYPES["MDX_JSX_TEXT_ELEMENT"]


def is_parent_node(node: Node) -> bool:
    """Check if node has children."""
    return "children" in node and isinstance(node.get("children"), list)


def has_function_body(node: Node) -> bool:
    """Check if node contains a function body (arrow function in MDX expression).

    This detects patterns like: {(item, index) => <content>}
    """
    if node.get("type") not in (
        NODE_TYPES["MDX_TEXT_EXPRESSION"],
        NODE_TYPES["MDX_FLOW_EXPRESSION"],
    ):
        return False

    value = node.get("value", "")
    if not isinstance(value, str):
        return False

    # Check for arrow function pattern
    return "=>" in value


def get_function_body(node: Node) -> tuple[list[str], list[Node]]:
    """Extract function parameters and body from a node.

    For a node like {(item, index) => <content>}, returns:
    - argument_names: ["item", "index"]
    - body: [child nodes representing the content]

    Args:
        node: The MDX expression node

    Returns:
        Tuple of (argument_names, body_nodes)
    """
    value = node.get("value", "")

    # Parse the arrow function expression
    # Pattern: (arg1, arg2, ...) => or arg =>
    arrow_pos = value.find("=>")
    if arrow_pos == -1:
        return ([], [])

    params_part = value[:arrow_pos].strip()

    # Extract parameter names
    if params_part.startswith("(") and params_part.endswith(")"):
        params_str = params_part[1:-1]
    else:
        params_str = params_part

    if params_str:
        argument_names = [p.strip() for p in params_str.split(",") if p.strip()]
    else:
        argument_names = []

    # The body is represented by the node's children (for JSX content)
    # or as part of the data (for inline expressions)
    children = node.get("children", [])

    # If there are explicit children, use them
    if children:
        return (argument_names, children)

    # Otherwise, the body might be in the data.estree
    # For now, return empty body - the actual content comes from sibling nodes
    # in the ForEach component's children
    return (argument_names, [])


def to_markdown(nodes: list[Node]) -> str:
    """Convert AST nodes back to markdown string.

    This is a simplified implementation that handles common cases.
    """
    result = []

    for node in nodes:
        node_type = node.get("type", "")

        if node_type == NODE_TYPES["TEXT"]:
            result.append(node.get("value", ""))

        elif node_type == NODE_TYPES["PARAGRAPH"]:
            children_md = to_markdown(node.get("children", []))
            result.append(children_md)

        elif node_type in (NODE_TYPES["MDX_TEXT_EXPRESSION"], NODE_TYPES["MDX_FLOW_EXPRESSION"]):
            value = node.get("value", "")
            result.append("{" + value + "}")

        elif node_type in (NODE_TYPES["MDX_JSX_FLOW_ELEMENT"], NODE_TYPES["MDX_JSX_TEXT_ELEMENT"]):
            tag_name = node.get("name", "")
            attrs = node.get("attributes", [])
            children = node.get("children", [])

            # Build attributes string
            attr_parts = []
            for attr in attrs:
                attr_name = attr.get("name", "")
                attr_value = attr.get("value")
                if attr_value is None:
                    attr_parts.append(attr_name)
                elif isinstance(attr_value, str):
                    attr_parts.append(f'{attr_name}="{attr_value}"')
                elif isinstance(attr_value, dict):
                    expr = attr_value.get("value", "")
                    attr_parts.append(f"{attr_name}={{{expr}}}")

            attrs_str = " ".join(attr_parts)
            if attrs_str:
                attrs_str = " " + attrs_str

            if children:
                children_md = to_markdown(children)
                result.append(f"<{tag_name}{attrs_str}>{children_md}</{tag_name}>")
            else:
                result.append(f"<{tag_name}{attrs_str} />")

        elif node_type == NODE_TYPES["LIST"]:
            items = node.get("children", [])
            for item in items:
                item_content = to_markdown(item.get("children", []))
                result.append(f"- {item_content}")

        elif node_type == NODE_TYPES["LIST_ITEM"]:
            children_md = to_markdown(node.get("children", []))
            result.append(children_md)

        elif is_parent_node(node):
            children_md = to_markdown(node.get("children", []))
            result.append(children_md)

    return "".join(result)


# Create default node helpers instance
def create_node_helpers() -> NodeHelpers:
    """Create a NodeHelpers instance with default implementations."""
    return NodeHelpers(
        is_mdx_jsx_element=is_mdx_jsx_element,
        is_mdx_jsx_flow_element=is_mdx_jsx_flow_element,
        is_mdx_jsx_text_element=is_mdx_jsx_text_element,
        is_parent_node=is_parent_node,
        to_markdown=to_markdown,
        has_function_body=has_function_body,
        get_function_body=get_function_body,
        NODE_TYPES=NODE_TYPES,
    )
