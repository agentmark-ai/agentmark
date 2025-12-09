"""Object prompt class."""

from typing import Any

from ..schemas import ObjectConfigSchema
from .base import BasePrompt


class ObjectPrompt(BasePrompt[ObjectConfigSchema]):
    """Object prompt for structured outputs."""

    async def format(
        self,
        props: dict[str, Any] | None = None,
        **options: Any,
    ) -> Any:
        """Format the object prompt.

        Args:
            props: Props to pass to the template
            **options: Additional adapter options

        Returns:
            Adapted object prompt output
        """
        compiled = await self._compile(props)
        adapt_options = self._build_adapt_options(options)
        return self._adapter.adapt_object(compiled, adapt_options, self._metadata(props))
