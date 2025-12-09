"""Filter registry for managing filter functions."""

from collections.abc import Callable
from typing import Any

FilterFunction = Callable[..., Any]


class FilterRegistry:
    """Registry for filter functions with global and instance-level support."""

    _global_filters: dict[str, FilterFunction] = {}

    def __init__(self) -> None:
        """Initialize an instance registry."""
        self._filters: dict[str, FilterFunction] = {}

    @classmethod
    def register_global(cls, name: str, func: FilterFunction) -> None:
        """Register a filter globally.

        Args:
            name: Filter name
            func: Filter function
        """
        cls._global_filters[name] = func

    @classmethod
    def get_global(cls, name: str) -> FilterFunction | None:
        """Get a globally registered filter.

        Args:
            name: Filter name

        Returns:
            The filter function, or None if not found
        """
        return cls._global_filters.get(name)

    @classmethod
    def get_all_global(cls) -> dict[str, FilterFunction]:
        """Get all globally registered filters.

        Returns:
            Dictionary of all global filters
        """
        return cls._global_filters.copy()

    def register(self, name: str, func: FilterFunction) -> None:
        """Register a filter on this instance.

        Args:
            name: Filter name
            func: Filter function
        """
        self._filters[name] = func

    def get(self, name: str) -> FilterFunction | None:
        """Get a filter from instance or global registry.

        Args:
            name: Filter name

        Returns:
            The filter function, or None if not found
        """
        return self._filters.get(name) or self._global_filters.get(name)

    def remove(self, name: str) -> None:
        """Remove a filter from instance registry.

        Args:
            name: Filter name
        """
        self._filters.pop(name, None)

    def copy_from_global(self) -> None:
        """Copy all global filters to instance registry."""
        self._filters.update(self._global_filters)

    def get_all(self) -> dict[str, FilterFunction]:
        """Get all filters (instance + global).

        Returns:
            Dictionary of all filters
        """
        result = self._global_filters.copy()
        result.update(self._filters)
        return result
