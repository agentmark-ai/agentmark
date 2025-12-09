"""Text prompt class."""

from typing import Any

from ..schemas import TextConfigSchema
from .base import BasePrompt


class TextPrompt(BasePrompt[TextConfigSchema]):
    """Text prompt for chat completions."""

    async def format(
        self,
        props: dict[str, Any] | None = None,
        **options: Any,
    ) -> Any:
        """Format the text prompt.

        Args:
            props: Props to pass to the template
            **options: Additional adapter options

        Returns:
            Adapted text prompt output
        """
        compiled = await self._compile(props)
        adapt_options = self._build_adapt_options(options)
        return self._adapter.adapt_text(compiled, adapt_options, self._metadata(props))
