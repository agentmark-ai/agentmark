"""Conditional tag plugins: If, ElseIf, Else."""

from typing import Any

from ..tag_plugin import Node, PluginContext, TagPlugin


class IfPlugin(TagPlugin):
    """Handles <If condition={...}> tags."""

    async def transform(
        self,
        props: dict[str, Any],
        children: list[Node],
        context: PluginContext,
    ) -> list[Node]:
        """Transform the If tag.

        Evaluates the condition and renders children if true.
        Sets __condition_met in scope for ElseIf/Else to use.

        Args:
            props: Must contain "condition" (boolean)
            children: Child nodes to render if condition is true
            context: Plugin context

        Returns:
            Transformed children if condition is true, otherwise empty list
        """
        condition = props.get("condition", False)

        # Store condition state for ElseIf/Else
        context.scope.set_local("__condition_met", bool(condition))

        if condition:
            transformer = context.create_node_transformer(context.scope)
            result: list[Node] = await transformer.transform_children(children)
            return result

        return []


class ElseIfPlugin(TagPlugin):
    """Handles <ElseIf condition={...}> tags."""

    async def transform(
        self,
        props: dict[str, Any],
        children: list[Node],
        context: PluginContext,
    ) -> list[Node]:
        """Transform the ElseIf tag.

        Only evaluates if no previous condition was met.

        Args:
            props: Must contain "condition" (boolean)
            children: Child nodes to render if condition is true
            context: Plugin context

        Returns:
            Transformed children if condition is true and no previous match,
            otherwise empty list
        """
        condition_met = context.scope.get_local("__condition_met")

        if condition_met:
            return []

        condition = props.get("condition", False)
        if condition:
            context.scope.set_local("__condition_met", True)
            transformer = context.create_node_transformer(context.scope)
            result: list[Node] = await transformer.transform_children(children)
            return result

        return []


class ElsePlugin(TagPlugin):
    """Handles <Else> tags."""

    async def transform(
        self,
        props: dict[str, Any],
        children: list[Node],
        context: PluginContext,
    ) -> list[Node]:
        """Transform the Else tag.

        Renders children if no previous condition was met.

        Args:
            props: Unused
            children: Child nodes to render
            context: Plugin context

        Returns:
            Transformed children if no previous condition matched,
            otherwise empty list
        """
        condition_met = context.scope.get_local("__condition_met")

        if condition_met:
            return []

        transformer = context.create_node_transformer(context.scope)
        result: list[Node] = await transformer.transform_children(children)
        return result
