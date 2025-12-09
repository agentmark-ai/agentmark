"""ForEach tag plugin for array iteration."""

from typing import Any

from ..constants import NODE_TYPES
from ..tag_plugin import Node, PluginContext, TagPlugin


class ForEachPlugin(TagPlugin):
    """Handles <ForEach arr={...}> tags with function children."""

    async def transform(
        self,
        props: dict[str, Any],
        children: list[Node],
        context: PluginContext,
    ) -> list[Node]:
        """Transform the ForEach tag.

        Iterates over the array and renders the function body for each item.
        The function body receives (item, index) parameters.

        Args:
            props: Must contain "arr" (array to iterate)
            children: Must be a single function expression: {(item, index) => ...}
            context: Plugin context

        Returns:
            Transformed nodes for each array item
        """
        arr = props.get("arr", [])

        if not isinstance(arr, list):
            return []

        if len(children) != 1:
            raise ValueError("ForEach expects exactly one child function.")

        child_node = children[0]
        node_helpers = context.node_helpers

        if not node_helpers.has_function_body(child_node):
            raise ValueError("ForEach expects a function as its child.")

        argument_names, body = node_helpers.get_function_body(child_node)

        # If no explicit body nodes, the body might be sibling content
        # In the AST, the function body content comes after the arrow
        # We need to parse it from the expression value
        if not body:
            body = self._extract_body_from_expression(child_node, context)

        item_param_name = argument_names[0] if len(argument_names) > 0 else None
        index_param_name = argument_names[1] if len(argument_names) > 1 else None

        result_nodes_per_item: list[list[Node]] = []

        for index, item in enumerate(arr):
            # Create child scope with item and index
            child_vars: dict[str, Any] = {}
            if item_param_name:
                child_vars[item_param_name] = item
            if index_param_name:
                child_vars[index_param_name] = index

            item_scope = context.scope.create_child(child_vars)
            item_transformer = context.create_node_transformer(item_scope)

            processed_children = await item_transformer.transform_children(body)
            result_nodes_per_item.append(processed_children)

        result_nodes = [node for nodes in result_nodes_per_item for node in nodes]

        # Smart list aggregation
        if self._are_all_list_items(result_nodes_per_item, node_helpers):
            return [
                {
                    "type": NODE_TYPES["LIST"],
                    "ordered": False,
                    "spread": False,
                    "children": self._collect_list_items(result_nodes_per_item, node_helpers),
                }
            ]

        return result_nodes

    def _extract_body_from_expression(
        self, node: Node, context: PluginContext
    ) -> list[Node]:
        """Extract body nodes from a function expression.

        When the ForEach has inline JSX content like:
        <ForEach arr={items}>{(item) => <p>{item}</p>}</ForEach>

        The body after => is parsed into the node's data.estree.
        We need to convert it back to AST nodes.
        """
        value = node.get("value", "")
        arrow_pos = value.find("=>")
        if arrow_pos == -1:
            return []

        body_str = value[arrow_pos + 2:].strip()

        # If the body starts with JSX, we need to create a placeholder
        # that will be filled by the actual children
        if body_str.startswith("<") or body_str.startswith("{"):
            # The actual content should be in data.estree or as parsed children
            data = node.get("data", {})
            estree = data.get("estree", {})

            if estree:
                # Try to extract JSX from estree
                return self._parse_estree_body(estree)

        # Fallback: return the expression as a text expression node
        if body_str:
            return [
                {
                    "type": NODE_TYPES["MDX_TEXT_EXPRESSION"],
                    "value": body_str.strip("{}"),
                }
            ]

        return []

    def _parse_estree_body(self, estree: dict[str, Any]) -> list[Node]:
        """Parse ESTree AST back to MDX AST nodes.

        This handles the case where JSX content is in the estree format.
        """
        body = estree.get("body", [])
        if not body:
            return []

        result: list[Node] = []

        for stmt in body:
            if stmt.get("type") == "ExpressionStatement":
                expr = stmt.get("expression", {})
                result.extend(self._convert_estree_expr(expr))

        return result

    def _convert_estree_expr(self, expr: dict[str, Any]) -> list[Node]:
        """Convert an ESTree expression to MDX AST nodes."""
        expr_type = expr.get("type", "")

        if expr_type == "ArrowFunctionExpression":
            # Get the body of the arrow function
            body = expr.get("body", {})
            return self._convert_estree_expr(body)

        if expr_type == "JSXElement":
            return [self._convert_jsx_element(expr)]

        if expr_type == "JSXFragment":
            children = expr.get("children", [])
            result: list[Node] = []
            for child in children:
                result.extend(self._convert_estree_expr(child))
            return result

        if expr_type == "JSXExpressionContainer":
            inner = expr.get("expression", {})
            # Convert to MDX expression
            return [
                {
                    "type": NODE_TYPES["MDX_TEXT_EXPRESSION"],
                    "value": self._estree_to_expression(inner),
                }
            ]

        if expr_type == "JSXText":
            value = expr.get("value", "")
            if value.strip():
                return [{"type": NODE_TYPES["TEXT"], "value": value}]
            return []

        if expr_type == "Identifier":
            return [
                {
                    "type": NODE_TYPES["MDX_TEXT_EXPRESSION"],
                    "value": expr.get("name", ""),
                }
            ]

        if expr_type == "MemberExpression":
            return [
                {
                    "type": NODE_TYPES["MDX_TEXT_EXPRESSION"],
                    "value": self._estree_to_expression(expr),
                }
            ]

        return []

    def _convert_jsx_element(self, expr: dict[str, Any]) -> Node:
        """Convert a JSXElement to MDX AST node."""
        opening = expr.get("openingElement", {})
        name_node = opening.get("name", {})
        tag_name = name_node.get("name", "")

        attributes: list[dict[str, Any]] = []
        for attr in opening.get("attributes", []):
            if attr.get("type") == "JSXAttribute":
                attr_name = attr.get("name", {}).get("name", "")
                attr_value = attr.get("value")

                if attr_value is None:
                    attributes.append({"type": "mdxJsxAttribute", "name": attr_name, "value": None})
                elif attr_value.get("type") == "StringLiteral":
                    val = attr_value.get("value", "")
                    attributes.append(
                        {"type": "mdxJsxAttribute", "name": attr_name, "value": val}
                    )
                elif attr_value.get("type") == "JSXExpressionContainer":
                    inner_expr = attr_value.get("expression", {})
                    attributes.append(
                        {
                            "type": "mdxJsxAttribute",
                            "name": attr_name,
                            "value": {
                                "type": "mdxJsxAttributeValueExpression",
                                "value": self._estree_to_expression(inner_expr),
                            },
                        }
                    )

        children: list[Node] = []
        for child in expr.get("children", []):
            children.extend(self._convert_estree_expr(child))

        return {
            "type": NODE_TYPES["MDX_JSX_FLOW_ELEMENT"],
            "name": tag_name,
            "attributes": attributes,
            "children": children,
        }

    def _estree_to_expression(self, expr: dict[str, Any]) -> str:
        """Convert an ESTree expression back to expression string."""
        expr_type = expr.get("type", "")

        if expr_type == "Identifier":
            name = expr.get("name", "")
            return str(name)

        if expr_type == "MemberExpression":
            obj = self._estree_to_expression(expr.get("object", {}))
            prop = expr.get("property", {})
            if expr.get("computed"):
                prop_str = self._estree_to_expression(prop)
                return f"{obj}[{prop_str}]"
            else:
                prop_name = prop.get("name", "")
                return f"{obj}.{str(prop_name)}"

        if expr_type == "Literal":
            value = expr.get("value")
            if isinstance(value, str):
                return f'"{value}"'
            return str(value) if value is not None else ""

        if expr_type == "BinaryExpression":
            left = self._estree_to_expression(expr.get("left", {}))
            right = self._estree_to_expression(expr.get("right", {}))
            op = expr.get("operator", "")
            return f"{left} {str(op)} {right}"

        return ""

    def _are_all_list_items(
        self, result_nodes_per_item: list[list[Node]], node_helpers: Any
    ) -> bool:
        """Check if all result nodes are list items."""
        for processed_nodes in result_nodes_per_item:
            for node in processed_nodes:
                node_type = node.get("type", "")
                if node_type not in (NODE_TYPES["LIST"], NODE_TYPES["LIST_ITEM"]):
                    return False
        return True

    def _collect_list_items(
        self, result_nodes_per_item: list[list[Node]], node_helpers: Any
    ) -> list[Node]:
        """Collect list items from results, unwrapping nested lists."""
        items: list[Node] = []

        for processed_nodes in result_nodes_per_item:
            for node in processed_nodes:
                node_type = node.get("type", "")
                if node_type == NODE_TYPES["LIST"]:
                    items.extend(node.get("children", []))
                elif node_type == NODE_TYPES["LIST_ITEM"]:
                    items.append(node)

        return items
