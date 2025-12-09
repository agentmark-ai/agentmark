"""Node transformer for processing MDX AST trees."""

from typing import TYPE_CHECKING, Any

from .constants import MDX_JSX_ATTRIBUTE_TYPES, NODE_TYPES
from .expression import ExpressionEvaluator
from .filter_registry import FilterRegistry
from .scope import Scope
from .tag_plugin import (
    Node,
    PluginContext,
    create_node_helpers,
    is_mdx_jsx_element,
    is_parent_node,
)
from .tag_registry import TagPluginRegistry
from .utils import stringify_value

if TYPE_CHECKING:
    from .engine import TemplateDX


class NodeTransformer:
    """Transforms AST nodes with expression evaluation and plugin support."""

    def __init__(
        self,
        scope: Scope,
        templatedx: "TemplateDX | None" = None,
    ) -> None:
        """Initialize the transformer.

        Args:
            scope: Variable scope for expression evaluation
            templatedx: Optional TemplateDX instance for registry access
        """
        self.scope = scope
        self.templatedx = templatedx

        # Get registries from templatedx instance or use global
        if templatedx:
            self._tag_registry = templatedx.get_tag_registry()
            self._filter_registry = templatedx.get_filter_registry()
        else:
            self._tag_registry = TagPluginRegistry()
            self._filter_registry = FilterRegistry()

        self.evaluator = ExpressionEvaluator(scope, self._filter_registry)
        self._node_helpers = create_node_helpers()

    async def transform(self, tree: Node) -> Node:
        """Transform the entire AST tree.

        Args:
            tree: Root AST node

        Returns:
            Transformed AST tree
        """
        result = await self.transform_node(tree)
        if isinstance(result, list):
            # If root returns multiple nodes, wrap in root
            return {"type": "root", "children": result}
        return result

    async def transform_node(self, node: Node) -> Node | list[Node]:
        """Transform a single AST node.

        Args:
            node: AST node to transform

        Returns:
            Transformed node(s)
        """
        node_type = node.get("type", "")

        # Handle MDX expressions
        if node_type in (NODE_TYPES["MDX_TEXT_EXPRESSION"], NODE_TYPES["MDX_FLOW_EXPRESSION"]):
            return self._evaluate_expression_node(node)

        # Handle MDX JSX elements
        if is_mdx_jsx_element(node):
            return await self._process_mdx_jsx_element(node)

        # Handle fragments
        if self._is_fragment_node(node):
            children = node.get("children", [])
            return await self.transform_children(children)

        # Handle parent nodes (with children)
        if is_parent_node(node):
            new_node = dict(node)
            new_node["children"] = await self.transform_children(node["children"])
            return new_node

        # Leaf nodes - return as-is
        return node

    async def transform_children(self, children: list[Node]) -> list[Node]:
        """Transform a list of child nodes.

        Args:
            children: List of child nodes

        Returns:
            List of transformed nodes
        """
        results: list[Node] = []

        for child in children:
            result = await self.transform_node(child)
            if isinstance(result, list):
                results.extend(result)
            else:
                results.append(result)

        return results

    def _is_fragment_node(self, node: Node) -> bool:
        """Check if node is a JSX fragment."""
        if not is_mdx_jsx_element(node):
            return False

        name = node.get("name")
        return name is None or name == "" or name == "Fragment" or name == "React.Fragment"

    def _evaluate_expression_node(self, node: Node) -> Node:
        """Evaluate an MDX expression node.

        Args:
            node: Expression node

        Returns:
            Text node with evaluated value
        """
        expression = node.get("value", "")

        try:
            evaluated_value = self.evaluator.evaluate(expression)
            return {
                "type": NODE_TYPES["TEXT"],
                "value": stringify_value(evaluated_value),
            }
        except Exception as e:
            raise ValueError(f'Error evaluating expression "{expression}": {e}') from e

    async def _process_mdx_jsx_element(self, node: Node) -> Node | list[Node]:
        """Process an MDX JSX element.

        Args:
            node: JSX element node

        Returns:
            Transformed node(s)
        """
        try:
            tag_name = node.get("name", "")

            # Check for registered plugin
            plugin = self._tag_registry.get(tag_name)

            if plugin:
                props = self._evaluate_props(node)
                children = node.get("children", [])

                context = PluginContext(
                    node_helpers=self._node_helpers,
                    create_node_transformer=lambda scope: NodeTransformer(scope, self.templatedx),
                    scope=self.scope,
                    tag_name=tag_name,
                )

                result = await plugin.transform(props, children, context)
                return result

            # No plugin - recursively transform children
            new_node = dict(node)
            new_node["children"] = await self.transform_children(node.get("children", []))
            return new_node

        except Exception as e:
            raise ValueError(f"Error processing MDX JSX Element: {e}") from e

    def _evaluate_props(self, node: Node) -> dict[str, Any]:
        """Evaluate JSX attributes to concrete values.

        Args:
            node: JSX element node

        Returns:
            Dictionary of evaluated props
        """
        props: dict[str, Any] = {}
        attributes = node.get("attributes", [])

        for attr in attributes:
            attr_type = attr.get("type", "")

            if attr_type == MDX_JSX_ATTRIBUTE_TYPES["MDX_JSX_ATTRIBUTE"]:
                name = attr.get("name", "")
                value = attr.get("value")

                if value is None or isinstance(value, str):
                    # String literal or boolean attribute (None means boolean true)
                    props[name] = value if value is not None else True
                elif isinstance(value, dict):
                    value_type = value.get("type", "")
                    if value_type == MDX_JSX_ATTRIBUTE_TYPES["MDX_JSX_ATTRIBUTE_VALUE_EXPRESSION"]:
                        # Expression value
                        expression = value.get("value", "")
                        props[name] = self.evaluator.evaluate(expression)

            elif attr_type == MDX_JSX_ATTRIBUTE_TYPES["MDX_JSX_EXPRESSION_ATTRIBUTE"]:
                # Spread attributes - not supported
                tag_name = node.get("name", "unknown")
                raise ValueError(f"Unsupported attribute type in component <{tag_name}>.")

        return props


async def transform_tree(
    tree: Node,
    props: dict[str, Any] | None = None,
    shared: dict[str, Any] | None = None,
    templatedx: "TemplateDX | None" = None,
) -> Node:
    """Transform an AST tree with the given props.

    This is a convenience function for one-off transformations.

    Args:
        tree: Root AST node
        props: Props to pass to the template (wrapped as {"props": props})
        shared: Shared/global context
        templatedx: Optional TemplateDX instance

    Returns:
        Transformed AST tree
    """
    # Wrap props to match TypeScript behavior
    variables = {"props": props if props is not None else {}}
    scope = Scope(variables=variables, shared=shared if shared is not None else {})
    transformer = NodeTransformer(scope, templatedx)
    return await transformer.transform(tree)
