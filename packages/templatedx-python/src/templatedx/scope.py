"""Scope management for variable resolution."""

from typing import Any


class Scope:
    """Hierarchical variable scope with local, parent, and shared contexts.

    Note: Props are wrapped as {"props": props_dict} to match TS behavior.
    In templates, variables are accessed as `props.name`, not just `name`.
    """

    def __init__(
        self,
        variables: dict[str, Any] | None = None,
        shared: dict[str, Any] | None = None,
        parent: "Scope | None" = None,
    ) -> None:
        """Initialize a new scope.

        Args:
            variables: Local variables for this scope
            shared: Shared/global context accessible from all scopes
            parent: Parent scope for variable resolution chain
        """
        self._variables = variables if variables is not None else {}
        self._shared = shared if shared is not None else {}
        self._parent = parent

    def get(self, key: str) -> Any:
        """Resolve variable: variables -> parent -> shared.

        Returns None if not found (permissive, matches TS behavior).

        Args:
            key: Variable name to resolve

        Returns:
            The variable value, or None if not found
        """
        if key in self._variables:
            return self._variables[key]
        if self._parent:
            return self._parent.get(key)
        if key in self._shared:
            return self._shared[key]
        return None

    def get_local(self, key: str) -> Any:
        """Get from local variables only.

        Args:
            key: Variable name

        Returns:
            The variable value, or None if not found
        """
        return self._variables.get(key)

    def get_shared(self, key: str) -> Any:
        """Get from shared context only.

        Args:
            key: Variable name

        Returns:
            The variable value, or None if not found
        """
        return self._shared.get(key)

    def set_local(self, key: str, value: Any) -> None:
        """Set a local variable.

        Args:
            key: Variable name
            value: Value to set
        """
        self._variables[key] = value

    def set_shared(self, key: str, value: Any) -> None:
        """Set a shared context variable.

        Args:
            key: Variable name
            value: Value to set
        """
        self._shared[key] = value

    def create_child(self, variables: dict[str, Any] | None = None) -> "Scope":
        """Create a child scope inheriting from this scope.

        Args:
            variables: Local variables for the child scope

        Returns:
            A new child Scope
        """
        return Scope(variables=variables, shared=self._shared, parent=self)
