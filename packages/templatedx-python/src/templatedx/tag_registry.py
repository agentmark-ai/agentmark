"""Tag plugin registry for managing tag plugins."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .tag_plugin import TagPlugin


class TagPluginRegistry:
    """Registry for tag plugins with global and instance-level support."""

    _global_plugins: dict[str, "TagPlugin"] = {}

    def __init__(self) -> None:
        """Initialize an instance registry."""
        self._plugins: dict[str, TagPlugin] = {}

    @classmethod
    def register_global(cls, plugin: "TagPlugin", names: list[str]) -> None:
        """Register a plugin globally.

        Args:
            plugin: The tag plugin instance
            names: List of tag names this plugin handles
        """
        for name in names:
            cls._global_plugins[name] = plugin

    @classmethod
    def get_global(cls, name: str) -> "TagPlugin | None":
        """Get a globally registered plugin.

        Args:
            name: Tag name

        Returns:
            The plugin, or None if not found
        """
        return cls._global_plugins.get(name)

    @classmethod
    def get_all_global(cls) -> dict[str, "TagPlugin"]:
        """Get all globally registered plugins.

        Returns:
            Dictionary of all global plugins
        """
        return cls._global_plugins.copy()

    def register(self, plugin: "TagPlugin", names: list[str]) -> None:
        """Register a plugin on this instance.

        Args:
            plugin: The tag plugin instance
            names: List of tag names this plugin handles
        """
        for name in names:
            self._plugins[name] = plugin

    def get(self, name: str) -> "TagPlugin | None":
        """Get a plugin from instance or global registry.

        Args:
            name: Tag name

        Returns:
            The plugin, or None if not found
        """
        return self._plugins.get(name) or self._global_plugins.get(name)

    def remove(self, name: str) -> None:
        """Remove a plugin from instance registry.

        Args:
            name: Tag name
        """
        self._plugins.pop(name, None)

    def copy_from_global(self) -> None:
        """Copy all global plugins to instance registry."""
        self._plugins.update(self._global_plugins)

    def get_all(self) -> dict[str, "TagPlugin"]:
        """Get all plugins (instance + global).

        Returns:
            Dictionary of all plugins
        """
        result = self._global_plugins.copy()
        result.update(self._plugins)
        return result
