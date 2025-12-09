"""Eval registry for evaluation functions."""

from .types import EvalFunction


class EvalRegistry:
    """Registry for evaluation functions."""

    def __init__(self) -> None:
        """Initialize an empty eval registry."""
        self._evals: dict[str, EvalFunction] = {}

    def register(self, name: str | list[str], eval_fn: EvalFunction) -> "EvalRegistry":
        """Register an eval function under one or more names.

        Args:
            name: Single name or list of names to register under
            eval_fn: The evaluation function

        Returns:
            Self for method chaining
        """
        if isinstance(name, str):
            self._evals[name] = eval_fn
        else:
            for n in name:
                self._evals[n] = eval_fn
        return self

    def get(self, name: str) -> EvalFunction | None:
        """Get an eval function by name.

        Args:
            name: The name to look up

        Returns:
            The eval function or None if not found
        """
        return self._evals.get(name)

    def has(self, name: str) -> bool:
        """Check if an eval function is registered.

        Args:
            name: The name to check

        Returns:
            True if registered, False otherwise
        """
        return name in self._evals

    def remove(self, name: str) -> bool:
        """Remove an eval function by name.

        Args:
            name: The name to remove

        Returns:
            True if removed, False if not found
        """
        if name in self._evals:
            del self._evals[name]
            return True
        return False

    def clear(self) -> None:
        """Remove all registered eval functions."""
        self._evals.clear()

    def list_names(self) -> list[str]:
        """Get all registered eval names.

        Returns:
            List of registered names
        """
        return list(self._evals.keys())
