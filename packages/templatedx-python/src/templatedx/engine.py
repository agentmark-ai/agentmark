"""TemplateDX engine - main entry point for the templatedx transformer."""

from collections.abc import Callable
from typing import Any

from .filter_plugins import register_builtin_filters
from .filter_registry import FilterRegistry
from .scope import Scope
from .tag_plugin import Node, TagPlugin
from .tag_plugins import ElseIfPlugin, ElsePlugin, ForEachPlugin, IfPlugin, RawPlugin
from .tag_registry import TagPluginRegistry
from .transformer import NodeTransformer


def _register_builtin_tag_plugins() -> None:
    """Register all built-in tag plugins globally."""
    TagPluginRegistry.register_global(IfPlugin(), ["If"])
    TagPluginRegistry.register_global(ElseIfPlugin(), ["ElseIf"])
    TagPluginRegistry.register_global(ElsePlugin(), ["Else"])
    TagPluginRegistry.register_global(ForEachPlugin(), ["ForEach"])
    TagPluginRegistry.register_global(RawPlugin(), ["Raw"])


# Register built-in plugins on module load
_register_builtin_tag_plugins()
register_builtin_filters()


class TemplateDX:
    """Stateful TemplateDX engine with isolated plugin registries.

    This is the main entry point for using templatedx. It provides
    instance-level plugin registries that inherit from global registries.

    Example:
        ```python
        engine = TemplateDX()

        # Transform an AST
        result = await engine.transform(ast, props={"name": "Alice"})

        # Register custom plugins
        engine.register_tag_plugin(MyPlugin(), ["MyTag"])
        engine.register_filter("double", lambda x: x * 2)
        ```
    """

    def __init__(self) -> None:
        """Initialize a new TemplateDX engine.

        Creates instance-level registries that inherit from global registries.
        """
        self._tag_registry = TagPluginRegistry()
        self._filter_registry = FilterRegistry()

        # Copy built-in plugins to instance
        self._tag_registry.copy_from_global()
        self._filter_registry.copy_from_global()

    def register_tag_plugin(self, plugin: TagPlugin, names: list[str]) -> None:
        """Register a tag plugin on this instance.

        Args:
            plugin: The tag plugin instance
            names: List of tag names this plugin handles
        """
        self._tag_registry.register(plugin, names)

    def remove_tag_plugin(self, name: str) -> None:
        """Remove a tag plugin from this instance.

        Args:
            name: Tag name to remove
        """
        self._tag_registry.remove(name)

    def get_tag_plugin(self, name: str) -> TagPlugin | None:
        """Get a tag plugin by name.

        Args:
            name: Tag name

        Returns:
            The plugin, or None if not found
        """
        return self._tag_registry.get(name)

    def get_tag_registry(self) -> TagPluginRegistry:
        """Get the tag plugin registry.

        Returns:
            The tag plugin registry for this instance
        """
        return self._tag_registry

    def register_filter(self, name: str, func: Callable[..., Any]) -> None:
        """Register a filter function on this instance.

        Args:
            name: Filter name
            func: Filter function
        """
        self._filter_registry.register(name, func)

    def remove_filter(self, name: str) -> None:
        """Remove a filter from this instance.

        Args:
            name: Filter name to remove
        """
        self._filter_registry.remove(name)

    def get_filter(self, name: str) -> Callable[..., Any] | None:
        """Get a filter function by name.

        Args:
            name: Filter name

        Returns:
            The filter function, or None if not found
        """
        return self._filter_registry.get(name)

    def get_filter_registry(self) -> FilterRegistry:
        """Get the filter registry.

        Returns:
            The filter registry for this instance
        """
        return self._filter_registry

    async def transform(
        self,
        tree: Node,
        props: dict[str, Any] | None = None,
        shared: dict[str, Any] | None = None,
    ) -> Node:
        """Transform an AST tree with the given props.

        Note: Props are wrapped as {"props": props} to match TS behavior.
        Templates access variables as `props.name`, not just `name`.

        Args:
            tree: Root AST node (pre-parsed MDX AST as dict)
            props: Props to pass to the template
            shared: Shared/global context accessible from all scopes

        Returns:
            Transformed AST tree
        """
        # Wrap props to match TypeScript behavior
        variables = {"props": props or {}}
        scope = Scope(variables=variables, shared=shared or {})
        transformer = NodeTransformer(scope, self)
        return await transformer.transform(tree)
